#!/usr/bin/env node
// RUMPUS ENGINE level generator — emits a .glb you import as a full-level model.
//
//   node tools/levelgen.mjs <layout> <out.glb>     layouts: keep, spine
//
// Everything here is shaped by what builds 1089/1092 established about how an imported model
// becomes a collider:
//   - the voxel grid lands on ~1.0-unit cells for an arena this size, with ~0.35-unit
//     vertical slots; STEP (the shared step allowance) is 0.6
//   - enemies get a clearance capsule of radius 0.9 — corridors ≥ 4 wide, ramps ≤ 0.5
//     rise per cell, nothing waist-high where bots must path
//   - surfaceTopUnder raycasts real triangles for floor height; since build 1092 sloped
//     faces rasterise as slopes and near-step columns read as ground, so ramps are
//     bot-climbable (verified per-centreline in the engine before shipping)
//
// Materials are textured, not flat: a procedural painter bakes tileable PBR sets (base
// colour + metallic-roughness + normal) into embedded PNGs — concrete, panelled concrete,
// brushed metal, deck plate, crate, hazard stripes. Architectural surfaces are planar-mapped
// in world units so texture density is constant everywhere; discrete objects (crates) get
// unit UVs so their frames land on their edges.
//
// Multiplayer intent: 180° rotational symmetry (fair for two teams), no dead ends (every
// space has ≥ 2 exits), and cover placed in mirrored pairs.

// Runs in TWO environments (build 1104): as the Node CLI below, and inside the browser, where
// the editor's "Generate arena" dialog fetches this exact source and evaluates it with
// RUMPUS_LEVELGEN_HOST supplying deflate, a Buffer work-alike and an output sink. One file,
// no build step, no drift between what the CLI ships and what the editor generates.
const _LG_HOST = (typeof RUMPUS_LEVELGEN_HOST !== 'undefined') ? RUMPUS_LEVELGEN_HOST : null;
const deflateSync = _LG_HOST ? _LG_HOST.deflateSync : (await import('node:zlib')).deflateSync;
const writeFileSync = _LG_HOST ? _LG_HOST.writeFileSync : (await import('node:fs')).writeFileSync;

// ------------------------------------------------------------------ texture painter ----
// Deterministic (seeded PRNG) and tileable (lattice noise wraps). What earns realism is not
// resolution but WHERE variation lands — the rules below follow production texturing practice:
//   - roughness varies everywhere: grime is matte, worn edges polish, oil is glossy. A flat
//     roughness value is the single biggest tell of a procedural texture.
//   - wear follows logic, not randomness: edges (above the local mean height) chip and
//     polish, cavities (below it) collect dirt. Both masks derive from the height field.
//   - three scales of variation — macro tone drift, meso features/stains, micro grain — so
//     the tiling never reads at any distance.
//   - decals (stains, leaks, painted markings) break repetition on top of the tiling base.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function lattice(r, n) { const g = new Float64Array(n * n); for (let i = 0; i < n * n; i++) g[i] = r(); return g; }
function noiseAt(g, n, x, y, S) {   // bilinear, smoothstep, wrapping -> tileable
  const fx = x * n / S, fy = y * n / S;
  const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
  let tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm(r, S, octaves) {   // sampler(x,y) in ~[0,1]
  const layers = octaves.map(([n, w]) => [lattice(r, n), n, w]);
  const tot = octaves.reduce((s, o) => s + o[1], 0);
  return (x, y) => layers.reduce((s, [g, n, w]) => s + noiseAt(g, n, x, y, S) * w, 0) / tot;
}
function worley(r, S, n) {   // wrapped feature points; sampler returns {d1,d2,id} in px
  const pts = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) pts.push([(gx + r()) * S / n, (gy + r()) * S / n, r()]);
  return (x, y) => {
    const gx = Math.floor(x * n / S), gy = Math.floor(y * n / S);
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cgx = gx + ox, cgy = gy + oy;
      const wx = ((cgx % n) + n) % n, wy = ((cgy % n) + n) % n;
      const pt = pts[wy * n + wx];
      const px = pt[0] + (cgx - wx) / n * S, py = pt[1] + (cgy - wy) / n * S;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < d1) { d2 = d1; d1 = d; id = pt[2]; } else if (d < d2) d2 = d;
    }
    return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), id };
  };
}
function hash2(a, b) { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
function brickAt(x, y, bw, bh, off) {   // staggered courses; tiles when bw, bh divide S
  const row = Math.floor(y / bh), xo = (row % 2) * bw * off;
  return { row, col: Math.floor((x + xo) / bw), lx: (((x + xo) % bw) + bw) % bw, ly: ((y % bh) + bh) % bh };
}
function sstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// domain-warped worley: cell boundaries wiggle organically instead of reading as voronoi.
// Two warp layers with different jobs: a low-frequency SHAPE warp makes each cell a different
// blob, a high-frequency CRINKLE roughens the boundary line itself. (Substance practice:
// the base pattern is 10% of the result; warp + per-cell variation is most of the rest.)
function warpedWorley(r, S, n, shapeAmp = 0.35, crinkleAmp = 0.06) {
  const w = worley(r, S, n);
  const cell = S / n;
  const wx1 = fbm(rng(r() * 1e9 | 0), S, [[Math.max(2, (n * 0.7) | 0), 1], [n * 2 | 0, 0.4]]);
  const wy1 = fbm(rng(r() * 1e9 | 0), S, [[Math.max(2, (n * 0.7) | 0), 1], [n * 2 | 0, 0.4]]);
  const wx2 = fbm(rng(r() * 1e9 | 0), S, [[Math.min(256, n * 4 | 0), 1]]);
  const wy2 = fbm(rng(r() * 1e9 | 0), S, [[Math.min(256, n * 4 | 0), 1]]);
  return (x, y) => {
    const X = x + (wx1(x, y) - 0.5) * 2 * shapeAmp * cell + (wx2(x, y) - 0.5) * 2 * crinkleAmp * cell;
    const Y = y + (wy1(x, y) - 0.5) * 2 * shapeAmp * cell + (wy2(x, y) - 0.5) * 2 * crinkleAmp * cell;
    return w(((X % S) + S) % S, ((Y % S) + S) % S);
  };
}
// slope-blur-min: cheap grayscale erosion with a noise structuring element. Eats edges
// irregularly (flat areas barely move), turning mathematically clean bevels and chip rims
// into crumbled, weathered ones. Run AFTER profile shaping, BEFORE normals.
function erodeMin(h, S, intensity, seed) {
  const r = rng(seed);
  const ox1 = fbm(r, S, [[24, 1], [96, 0.5]]), oy1 = fbm(r, S, [[24, 1], [96, 0.5]]);
  const ox2 = fbm(r, S, [[40, 1]]), oy2 = fbm(r, S, [[40, 1]]);
  const out = new Float64Array(S * S);
  const at = (x, y) => h[(((y | 0) % S + S) % S) * S + (((x | 0) % S + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    let v = h[i];
    v = Math.min(v, at(x + (ox1(x, y) - 0.5) * 2 * intensity, y + (oy1(x, y) - 0.5) * 2 * intensity));
    v = Math.min(v, at(x + (ox2(x, y) - 0.5) * 2 * intensity, y + (oy2(x, y) - 0.5) * 2 * intensity));
    out[i] = v;
  }
  h.set(out);
}
function blurField(src, S, rad) {   // wrapping two-pass box blur: the "local mean" for cavity/edge masks
  const tmp = new Float64Array(S * S), out = new Float64Array(S * S), w = rad * 2 + 1;
  for (let y = 0; y < S; y++) { let acc = 0;
    for (let k = -rad; k <= rad; k++) acc += src[y * S + ((k + S) % S)];
    for (let x = 0; x < S; x++) { tmp[y * S + x] = acc / w;
      acc += src[y * S + ((x + rad + 1) % S)] - src[y * S + ((x - rad + S) % S)]; } }
  for (let x = 0; x < S; x++) { let acc = 0;
    for (let k = -rad; k <= rad; k++) acc += tmp[((k + S) % S) * S + x];
    for (let y = 0; y < S; y++) { out[y * S + x] = acc / w;
      acc += tmp[((y + rad + 1) % S) * S + x] - tmp[((y - rad + S) % S) * S + x]; } }
  return out;
}
class Tex {
  constructor(name, S) { this.name = name; this.S = S; this.rgb = new Float64Array(S * S * 3); this.h = new Float64Array(S * S); this.mr = null; this.a = null; this.em = null; this.noAux = false; }
  emInit() { this.em = new Float64Array(this.S * this.S * 3); return this; }
  setEm(i, c, k = 1) { this.em[i * 3] = c[0] * k; this.em[i * 3 + 1] = c[1] * k; this.em[i * 3 + 2] = c[2] * k; }
  fill(c) { for (let i = 0; i < this.S * this.S; i++) { this.rgb[i * 3] = c[0]; this.rgb[i * 3 + 1] = c[1]; this.rgb[i * 3 + 2] = c[2]; } return this; }
  each(fn) { for (let y = 0; y < this.S; y++) for (let x = 0; x < this.S; x++) fn(x, y, y * this.S + x); return this; }
  tint(i, k) { this.rgb[i * 3] *= k; this.rgb[i * 3 + 1] *= k; this.rgb[i * 3 + 2] *= k; }
  tintC(i, kr, kg, kb) { this.rgb[i * 3] *= kr; this.rgb[i * 3 + 1] *= kg; this.rgb[i * 3 + 2] *= kb; }
  mix(i, c, k) { for (let q = 0; q < 3; q++) this.rgb[i * 3 + q] += (c[q] - this.rgb[i * 3 + q]) * k; }
  mrInit(metal, rough) { this.mr = new Float64Array(this.S * this.S * 2); for (let i = 0; i < this.S * this.S; i++) { this.mr[i * 2] = rough; this.mr[i * 2 + 1] = metal; } return this; }
}

// The finishing pass every material runs through LAST. This is where the "AAA" rules live:
// cavity grime (darker + matte), edge wear (brighter + polished), macro tone/hue drift that
// breaks tiling at distance, and a micro grain kept inside the subtle 5-10% band.
function finish(t, seed, o = {}) {
  const S = t.S, r = rng(seed ^ 0xF1715);
  const mean = blurField(t.h, S, o.blurR ?? Math.max(4, S >> 6));
  const macro = fbm(r, S, [[2, 1], [5, 0.7]]);
  const grain = fbm(r, S, [[Math.min(512, S), 1]]);
  t.each((x, y, i) => {
    const cav = Math.min(1, Math.max(0, (mean[i] - t.h[i])) * (o.cavK ?? 1.6));
    const edge = Math.min(1, Math.max(0, (t.h[i] - mean[i])) * (o.edgeK ?? 1.8));
    const m = macro(x, y) - 0.5, g = grain(x, y) - 0.5;
    t.tintC(i, 1 + m * 0.11 + g * 0.06, 1 + m * 0.09 + g * 0.06, 1 + m * 0.06 + g * 0.06);
    t.tint(i, (1 - cav * (o.cavDark ?? 0.32)) * (1 + edge * (o.edgeLight ?? 0.2)));
    if (t.mr) {
      let rr = t.mr[i * 2];
      rr += cav * (o.cavRough ?? 0.2) - edge * (o.edgeSmooth ?? 0.3) + g * (o.grainRough ?? 0.12);
      t.mr[i * 2] = Math.max(0.08, Math.min(1, rr));
    }
  });
  return t;
}

let _crcT = null;
function crc32(buf) {
  if (!_crcT) { _crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c; } }
  let c = -1; for (const b of buf) c = _crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) | 0;
}
function toBytes(px) { const b = Buffer.alloc(px.length); for (let i = 0; i < px.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(px[i] * 255))); return b; }
// PNG with adaptive per-row filtering (None/Sub/Up/Paeth, least-sum-of-abs). At 1024 on noisy
// content this roughly halves the file next to the filter-0-everywhere encoder it replaces.
function pngEncode(bytes, w, h, ch) {
  const bpr = w * ch, raw = Buffer.alloc((bpr + 1) * h), cand = Buffer.alloc(bpr);
  for (let y = 0; y < h; y++) {
    const row = bytes.subarray(y * bpr, (y + 1) * bpr);
    const prev = y ? bytes.subarray((y - 1) * bpr, y * bpr) : null;
    let bestF = 0, bestSum = Infinity, best = null;
    for (const f of [0, 1, 2, 4]) {
      let sum = 0;
      for (let i = 0; i < bpr && sum < bestSum; i++) {
        const a = i >= ch ? row[i - ch] : 0, b = prev ? prev[i] : 0, c = (prev && i >= ch) ? prev[i - ch] : 0;
        let v;
        if (f === 0) v = row[i];
        else if (f === 1) v = (row[i] - a) & 255;
        else if (f === 2) v = (row[i] - b) & 255;
        else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = (row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
        cand[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; bestF = f; best = Buffer.from(cand); }
    }
    raw[y * (bpr + 1)] = bestF; best.copy(raw, y * (bpr + 1) + 1);
  }
  const chunk = (t, d) => { const cbuf = Buffer.concat([Buffer.from(t), d]); const out = Buffer.alloc(cbuf.length + 8);
    out.writeUInt32BE(d.length, 0); cbuf.copy(out, 4); out.writeInt32BE(crc32(cbuf), cbuf.length + 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function normalPx(h, S, strength) {   // tangent-space normals from the height field, wrapping
  const px = new Float64Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * strength;
    const dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 3;
    px[i] = (-dx / l) * 0.5 + 0.5; px[i + 1] = (-dy / l) * 0.5 + 0.5; px[i + 2] = (1 / l) * 0.5 + 0.5;
  }
  return px;
}
function halfPx(px, S, ch) {   // 2x2 average downsample
  const H = S >> 1, out = new Float64Array(H * H * ch);
  for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) for (let c = 0; c < ch; c++)
    out[(y * H + x) * ch + c] = (px[((y * 2) * S + x * 2) * ch + c] + px[((y * 2) * S + x * 2 + 1) * ch + c]
      + px[((y * 2 + 1) * S + x * 2) * ch + c] + px[((y * 2 + 1) * S + x * 2 + 1) * ch + c]) / 4;
  return out;
}

// ---- the texture set -------------------------------------------------------------------
// Feature sizes are written for a 256px tile and scaled by k, so world-space detail size is
// unchanged at any resolution.
function concreteTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  t.fill([0.66, 0.66, 0.65]);
  const mottle = fbm(r, S, [[8, 1], [16, 0.6], [32, 0.35], [64, 0.2], [160, 0.14]]);
  const blotch = fbm(r, S, [[4, 1], [8, 0.7]]);
  const specks = worley(rng(seed ^ 8), S, 120);
  t.each((x, y, i) => {
    const m = mottle(x, y), b = blotch(x, y);
    t.tint(i, 0.86 + m * 0.24 - Math.max(0, b - 0.62) * 0.5);
    const sp = specks(x, y);                                        // aggregate showing through, any resolution
    if (sp.d1 < 0.8 * k && sp.id > 0.35) t.tint(i, sp.id > 0.68 ? 1.08 : 0.9);
    t.h[i] = m;
  });
  for (let c = 0; c < 2; c++) {                                     // hairline cracks, random-walked
    let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
    const len = S * (0.3 + r() * 0.4);
    for (let d = 0; d < len; d++) {
      ang += (r() - 0.5) * 0.4;
      x = (x + Math.cos(ang) + S) % S; y = (y + Math.sin(ang) + S) % S;
      const i = (y | 0) * S + (x | 0);
      t.tint(i, 0.68); t.h[i] -= 0.8;
      if (r() < 0.35) { const j = (y | 0) * S + (((x | 0) + 1) % S); t.tint(j, 0.75); t.h[j] -= 0.5; }
    }
  }
  return t;
}
function concreteFinished(name, seed, S) { return finish(concreteTex(name, seed, S), seed, { cavDark: 0.3 }); }
function panelsTex(name, seed, S) {   // concrete cast in big panels: seams, form ties, weep stains
  const t = concreteTex(name, seed, S), r = rng(seed ^ 0xBEEF), k = S / 256, P = S / 2;
  const seam = (v) => { const d = Math.min(v % P, P - (v % P)); return d < 2 * k ? 0.55 : d < 5 * k ? 0.88 : 1; };
  const tone = fbm(r, S, [[2, 1]]);                                 // per-panel tone difference
  t.each((x, y, i) => {
    const s = Math.min(seam(y), seam(x + P / 2));
    t.tint(i, s * (0.95 + tone(((x / P) | 0) * P + P / 2, ((y / P) | 0) * P + P / 2) * 0.1));
    if (s < 1) t.h[i] -= (1 - s) * 0.8;
  });
  for (let q = 0; q < 8; q++) {                                     // weep stains falling from seams
    const sx = Math.floor(r() * S), sy = (Math.floor(r() * 2) * P) % S, len = (26 + r() * 60) * k;
    for (let d = 0; d < len; d++) for (let w = -k; w <= k; w++) {
      const i = (((sy + d) | 0) % S) * S + (((sx + w) | 0) + S) % S;
      t.tint(i, 1 - 0.14 * (1 - d / len) * (Math.abs(w) > k / 2 ? 0.5 : 1));
    }
  }
  for (const fx of [32, 96, 160, 224]) for (const fy of [32, 160]) {
    for (let dy = -2 * k; dy <= 2 * k; dy++) for (let dx = -2 * k; dx <= 2 * k; dx++) if (dx * dx + dy * dy <= 4 * k * k) {
      const i = ((((fy * k + dy) | 0) + S) % S) * S + ((((fx * k + dx) | 0) + S) % S); t.tint(i, 0.62); t.h[i] -= 0.9;
    }
  }
  return finish(t, seed, { cavDark: 0.34, cavK: 1.8 });
}
function metalTex(name, seed, S) {   // brushed panels, seams, rivets — and rust where water sits
  const r = rng(seed), t = new Tex(name, S), k = S / 256, P = S / 2;
  t.fill([0.68, 0.7, 0.73]).mrInit(0.9, 0.62);
  const brushRow = new Float64Array(S); for (let y = 0; y < S; y++) brushRow[y] = r();
  for (let q = 0; q < 2; q++) for (let y = 0; y < S; y++)            // smooth: brushing, not scanlines
    brushRow[y] = (brushRow[(y + S - 1) % S] + brushRow[y] * 2 + brushRow[(y + 1) % S]) / 4;
  const brush = fbm(r, S, [[64, 1], [128, 0.8], [320, 0.5]]);
  const rustN = fbm(r, S, [[24, 1], [96, 0.7]]);
  const seamD = (v) => Math.min(v % P, P - (v % P));
  t.each((x, y, i) => {
    const b = brush(x, y) * 0.65 + brushRow[y] * 0.35;
    t.tint(i, 0.92 + b * 0.14);
    const ds = Math.min(seamD(x), seamD(y));
    if (ds < 2 * k) { t.tint(i, 0.62); t.h[i] -= 0.7; t.mr[i * 2] = 0.8; }
    else { t.h[i] = b * 0.35; t.mr[i * 2] = 0.55 + b * 0.25; }
    // rust: seeded near seams, matte, barely metallic — colour noise keeps it organic
    const rmask = rustN(x, y) - 0.74 + Math.max(0, (9 * k - ds)) / (9 * k) * 0.16;
    if (rmask > 0) { const n = Math.min(1, rmask * 5);
      t.mix(i, [0.36 + rustN(y, x) * 0.18, 0.2 + rustN(y, x) * 0.07, 0.11], 0.62 * n);
      t.mr[i * 2] = Math.min(1, t.mr[i * 2] + 0.3 * n); t.mr[i * 2 + 1] = 0.15; t.h[i] += n * 0.15; }
  });
  for (let px = 0; px < S; px += 32 * k) for (const py of [6 * k, P - 10 * k, P + 10 * k, S - 6 * k]) {   // rivets
    for (let dy = -2 * k; dy <= 2 * k; dy++) for (let dx = -2 * k; dx <= 2 * k; dx++) { const d2 = dx * dx + dy * dy; if (d2 > 5 * k * k) continue;
      const i = ((((py + dy) | 0) + S) % S) * S + (((px + 16 * k + dx) | 0) % S);
      t.h[i] += (5 * k * k - d2) * 0.28 / (k * k); t.tint(i, 1.06); t.mr[i * 2] = 0.4; }
  }
  for (let q = 0; q < 4; q++) {                                     // rust streaks bleeding down from rivets
    const sx = ((Math.floor(r() * (S / (32 * k))) * 32 + 16) * k) | 0, sy = (r() < 0.5 ? 8 * k : P + 12 * k) | 0, len = (30 + r() * 70) * k;
    for (let d = 0; d < len; d++) { const fall = 1 - d / len;
      const i = (((sy + d) | 0) % S) * S + ((sx + ((r() - 0.5) * 2) | 0) + S) % S;
      t.mix(i, [0.4, 0.23, 0.12], 0.5 * fall); t.mr[i * 2] = Math.min(1, t.mr[i * 2] + 0.25 * fall); }
  }
  for (let q = 0; q < 14 * k; q++) {                                // scratches: bright, glossy, hand-wavering
    let x = r() * S, y = r() * S, a = r() * Math.PI;
    const len = (10 + r() * 40) * k;
    for (let d = 0; d < len; d++) {
      a += (r() - 0.5) * 0.06;
      x = (x + Math.cos(a) + S) % S; y = (y + Math.sin(a) + S) % S;
      const i = (y | 0) * S + (x | 0);
      t.tint(i, 1.12); t.mr[i * 2] = 0.35;
    }
  }
  return finish(t, seed, { edgeSmooth: 0.35, cavDark: 0.3 });
}
function deckTex(name, seed, S) {   // walkway plate: offset stud rows, worn rims, oily patches
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  t.fill([0.62, 0.64, 0.67]).mrInit(0.5, 0.75);
  const wear = fbm(r, S, [[16, 1], [64, 0.5], [200, 0.3]]);
  const oil = fbm(r, S, [[6, 1], [18, 0.6]]);
  const CW = 64 * k, CH = 32 * k;
  t.each((x, y, i) => {
    const row = Math.floor(y / CH), lx = (x + (row % 2) * (CW / 2)) % CW, ly = y % CH;
    const cst = Math.floor((x + (row % 2) * (CW / 2)) / CW);
    const hs = hash2(cst * 7, row * 13);                             // every stud wears differently
    const e = Math.min(lx - 8 * k, 56 * k - lx, ly - 7 * k, 25 * k - ly);
    const w = wear(x, y);
    if (e > -2 * k) {                                                // stud with a soft shoulder
      const core = sstep(0, 1.8 * k, e);
      t.h[i] = 0.4 + 0.45 * core;
      if (e > 0) { t.tint(i, (1.03 + hs * 0.08) + w * 0.12 * core); t.mr[i * 2] = 0.55 + w * 0.2 + hs * 0.1; }
      else { t.tint(i, 1.03 + hs * 0.12); t.mr[i * 2] = 0.3 + hs * 0.22; t.mr[i * 2 + 1] = 0.85; }
    }
    else { t.h[i] = 0; t.tint(i, 0.9 + w * 0.1); t.mr[i * 2] = 0.82; }
    const o = oil(x, y);                                            // oil: darker AND glossier
    if (o > 0.64) { const oo = Math.min(1, (o - 0.64) / 0.3); t.tint(i, 1 - 0.38 * oo); t.mr[i * 2] = Math.max(0.2, t.mr[i * 2] - 0.4 * oo); }
  });
  return finish(t, seed, { edgeSmooth: 0.32 });
}
function crateTex(name, seed, S) {   // one crate face: raised frame, recessed panel, bolts, dirt
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  t.fill([0.62, 0.6, 0.56]);
  const grime = fbm(r, S, [[8, 1], [32, 0.6], [128, 0.3]]);
  const F = 30 * k;
  t.each((x, y, i) => {
    const g = grime(x, y), e = Math.min(x, S - 1 - x, y, S - 1 - y);
    if (e > F) { t.tint(i, 0.72 + g * 0.18); t.h[i] = 0; }
    else { t.tint(i, 0.95 + g * 0.12); t.h[i] = 0.9 - (e > F - 4 * k ? (e - (F - 4 * k)) * 0.2 / k : 0); }
    if (e > F && e < F + 3 * k) t.tint(i, 0.6);
    if (y > S * 0.72) t.tint(i, 1 - (y / S - 0.72) / 0.28 * 0.26);   // dirt gathers at the bottom
  });
  for (const bx of [15 * k, S - 15 * k]) for (const by of [15 * k, S - 15 * k]) {
    for (let dy = -4 * k; dy <= 4 * k; dy++) for (let dx = -4 * k; dx <= 4 * k; dx++) { const d2 = dx * dx + dy * dy; if (d2 > 18 * k * k) continue;
      const i = ((by + dy) | 0) * S + ((bx + dx) | 0); t.h[i] += (18 * k * k - d2) * 0.06 / (k * k); t.tint(i, 1.12); }
    for (let d = 0; d < 22 * k; d++) { const i = (((by + 5 * k + d) | 0) % S) * S + ((((bx + ((r() - 0.5) * 2 * k)) | 0) + S) % S);
      t.mix(i, [0.38, 0.22, 0.12], 0.4 * (1 - d / (22 * k))); }     // rust bleeding off each bolt
  }
  for (let q = 0; q < 3; q++) {                                     // stencil dashes, spray-frayed
    const y0 = (96 + q * 22) * k;
    for (let x = 70 * k; x < 130 * k; x++) for (let w = 0; w < 8 * k; w++) {
      if (hash2(x | 0, (y0 + w) | 0) < 0.28) continue;
      const i = ((y0 + w) | 0) * S + (x | 0); t.tint(i, 0.58);
    }
  }
  return finish(t, seed, { cavDark: 0.36, edgeLight: 0.24 });
}
function hazardTex(name, seed, S) {   // 45° chevrons, chipped and scuffed
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  t.fill([0.9, 0.72, 0.12]);
  const wear = fbm(r, S, [[16, 1], [64, 0.7]]);
  t.each((x, y, i) => {
    if (((x + y) % (64 * k)) < 28 * k) { t.rgb[i * 3] = 0.13; t.rgb[i * 3 + 1] = 0.13; t.rgb[i * 3 + 2] = 0.14; }
    const w = wear(x, y); t.tint(i, 0.8 + w * 0.35); t.h[i] = w * 0.3;
    if (w < 0.3) { t.mix(i, [0.45, 0.45, 0.47], (0.3 - w) * 2.4); t.h[i] -= 0.3; }   // paint chipped to bare
  });
  for (let q = 0; q < 10; q++) {                                    // scuffs dragged along the stripes
    let x = r() * S, y = r() * S; const len = (20 + r() * 50) * k;
    for (let d = 0; d < len; d++) { x = (x + 0.71 + S) % S; y = (y - 0.71 + S) % S;
      const i = (y | 0) * S + (x | 0); t.tint(i, 0.72); }
  }
  return finish(t, seed, {});
}
// ---- expanded families: masonry, nature, interior, sci-fi ------------------------------
function brickTex(name, seed, S, col = [0.5, 0.25, 0.19]) {
  // Reference-driven: discrete tone clusters (mid red / purple-brown / light orange) with
  // darker = purpler, kiln flashing gradients per brick, clustered iron spots, corner chips
  // as depth not bright discs, mortar with sand speckle and a shadow line at the interface.
  const r = rng(seed), t = new Tex(name, S), k = S / 256, bw = S / 4, bh = S / 16;
  const grain = fbm(r, S, [[48, 1], [160, 0.6]]);
  const wx = fbm(rng(seed ^ 21), S, [[8, 1], [32, 0.5]]), wy = fbm(rng(seed ^ 22), S, [[8, 1], [32, 0.5]]);
  const chips = worley(rng(seed ^ 9), S, 20);
  const spots = worley(rng(seed ^ 13), S, 110);
  const gone = worley(rng(seed ^ 17), S, 30);
  t.fill(col);
  t.each((x, y, i) => {
    const b = brickAt(x + (wx(x, y) - 0.5) * 3 * k, y + (wy(x, y) - 0.5) * 3 * k, bw, bh, 0.5);
    const m = 2.6 * k;
    const hb = hash2(b.row, b.col), hb2 = hash2(b.col * 3, b.row * 7), hb3 = hash2(b.row * 11, b.col * 5);
    const g = grain((x + hb * S) % S, (y + hb2 * S) % S);
    if (b.lx < m || b.ly < m) {                                      // mortar
      t.rgb[i * 3] = 0.58; t.rgb[i * 3 + 1] = 0.55; t.rgb[i * 3 + 2] = 0.51;
      t.tint(i, 0.82 + g * 0.3);
      if (hash2(x | 0, y | 0) > 0.85) t.tint(i, 1.2);                // sand grains
      t.h[i] = 0.12 + g * 0.1;
      const gn = gone(x, y);                                         // missing mortar patches
      if (gn.d1 < 3 * k && gn.id > 0.88) { t.tint(i, 0.55); t.h[i] = 0; }
      return;
    }
    // three firing clusters; darker cluster shifts purple, lighter shifts orange
    const cl = hb < 0.6 ? 0 : hb < 0.85 ? 1 : 2;
    const tone = [1.0, 0.78, 1.18][cl] * (0.96 + hb2 * 0.08);
    const warm = [1.0, 0.93, 1.07][cl];
    t.tintC(i, tone * warm, tone * (2 - warm) * 0.55 + tone * 0.45, tone * (2 - warm));
    t.tint(i, 0.9 + g * 0.2);
    if (hb3 > 0.55) {                                                // kiln flashing: one end darker
      const dir = hash2(b.col, b.row * 9) > 0.5 ? b.lx / bw : 1 - b.lx / bw;
      t.tint(i, 1 - Math.max(0, dir - 0.35) * 0.35 * ((hb3 - 0.55) / 0.45));
      t.tintC(i, 0.97, 0.99, 1.03);
    }
    const eb = Math.min(b.lx - m, b.ly - m, bw - b.lx, bh - b.ly);
    t.h[i] = 0.5 + hash2(b.row * 13, b.col * 17) * 0.14 + sstep(0, (2.5 + hb2 * 3) * k, eb) * 0.36 + g * 0.08;
    if (hb2 > 0.87) {                                                // the occasional iron-spotted brick
      const sp = spots(x, y);
      if (sp.d1 < (0.5 + sp.id * 0.8) * k && sp.id > 0.45) { t.tint(i, 0.62); t.h[i] -= 0.06; }
    }
    const c = chips(x, y);                                           // dog-eared corners: depth-led
    if (eb < 5 * k && c.d1 < (2.5 + c.id * 4) * k && hash2(b.col * 3, b.row * 7) > 0.66) {
      const pp = 1 - c.d1 / ((2.5 + c.id * 4) * k);
      t.tint(i, 1 + 0.1 * pp); t.tintC(i, 1.04, 1, 0.96);            // exposed core: brighter, oranger
      t.h[i] -= 0.42 * pp;
    }
    if (hash2(b.row * 31, b.col * 23) > 0.985) {                     // one lime pop in a while
      const dx2 = b.lx - bw * 0.55, dy2 = b.ly - bh * 0.5, dd = Math.hypot(dx2, dy2);
      if (dd < 4 * k) { t.tint(i, dd < 1.5 * k ? 1.7 : 0.7); t.h[i] -= (1 - dd / (4 * k)) * 0.3; }
    }
  });
  erodeMin(t.h, S, 2 * k, seed ^ 27);
  return finish(t, seed, { cavDark: 0.28 });
}
function stoneBlocksTex(name, seed, S, col = [0.6, 0.56, 0.48]) {
  // Rebuilt on reference: pits cluster on a few blocks (never uniform dots), edges vary
  // block-to-block, joints wander, tone comes in discrete quarry batches with rare outliers.
  const r = rng(seed), t = new Tex(name, S), k = S / 256, bw = S / 4, bh = S / 4;
  const grain = fbm(r, S, [[16, 1], [64, 0.5], [200, 0.3]]);
  const wx = fbm(rng(seed ^ 21), S, [[6, 1], [24, 0.5]]), wy = fbm(rng(seed ^ 22), S, [[6, 1], [24, 0.5]]);
  const vugs = worley(rng(seed ^ 5), S, 26);
  const micro = worley(rng(seed ^ 15), S, 84);
  const chipW = worley(rng(seed ^ 25), S, 14);
  const TONES = [1.0, 0.88, 1.12];                                  // quarry batches, not a gaussian
  t.fill(col);
  t.each((x, y, i) => {
    const b = brickAt(x + (wx(x, y) - 0.5) * 8 * k, y + (wy(x, y) - 0.5) * 8 * k, bw, bh, 0.5);
    const m = 5 * k;
    const hb = hash2(b.row * 13, b.col * 17), hb2 = hash2(b.col * 7, b.row * 3), hb3 = hash2(b.row * 5, b.col * 29);
    const g = grain((x + hb * S) % S, (y + hb2 * S) % S);            // per-block grain phase
    if (b.lx < m || b.ly < m) {                                      // mortar: a material, not a groove
      t.tint(i, (0.62 + g * 0.25));
      if (hash2(x | 0, y | 0) > 0.86) t.tint(i, 1.18);               // sand speckle
      t.h[i] = 0.05 + g * 0.08;
      return;
    }
    let tone = TONES[(hb * 2.99) | 0] * (0.96 + hb2 * 0.08);
    let warm = 0.96 + hash2(b.col + 4, b.row) * 0.08;
    if (hb3 > 0.93) { tone *= 0.82; warm = 1.12; }                   // the rare iron-stained block
    t.tintC(i, tone * warm, tone, tone * (2 - warm));
    t.tint(i, 0.88 + g * 0.24);
    const eb = Math.min(b.lx - m, b.ly - m, bw - b.lx, bh - b.ly);
    const bevW = (4 + hb2 * 9) * k;                                  // bevel width varies per block
    t.h[i] = 0.35 + hb * 0.2 + sstep(0, bevW, eb) * 0.5 + g * 0.15
      + (b.lx / bw - 0.5) * (hash2(b.col, b.row + 9) - 0.5) * 0.2;   // slight per-block tilt
    if (hb3 > 0.42 && hb3 < 0.68) {                                  // bedding bands on some blocks
      const band = Math.sin((b.ly / bh + hb) * Math.PI * (3 + hb2 * 5));
      t.tint(i, 1 + band * 0.05); t.h[i] += band * 0.04;
    }
    if (hb2 > 0.62) {                                                // tool marks, one direction per block
      t.tint(i, 1 + Math.sin((b.lx + b.ly * 0.7) / (3.2 * k) + hb * 9) * 0.035);
    }
    const mc = micro(x, y);                                          // micro-pitting: everywhere, subtle
    if (mc.d1 < 1.1 * k) { t.tint(i, 0.94); t.h[i] -= 0.05; }
    const c = vugs(x, y);                                            // vugs: clustered, size varies 3x, soft
    const R = (1.1 + c.id * 3.2) * k;
    if (c.d1 < R && c.id > 0.5 && hash2(b.col * 5, b.row * 11) > 0.62) {
      const pp = 1 - c.d1 / R;
      t.tint(i, 1 - 0.13 * pp * pp); t.h[i] -= 0.28 * pp * pp;
    }
    const ch = chipW(x, y);                                          // chips live on edges, gated per block
    if (eb < 7 * k && ch.d1 < (3 + ch.id * 5) * k && hash2(b.col * 3, b.row * 19) > 0.55) {
      const pp = 1 - ch.d1 / ((3 + ch.id * 5) * k);
      t.tint(i, 1 + 0.1 * pp); t.h[i] -= 0.45 * pp;                  // depth-led, freshly-exposed lighter
    }
  });
  erodeMin(t.h, S, 3 * k, seed ^ 31);                                // crumble the clean bevels
  return finish(t, seed, { cavDark: 0.28, cavK: 1.5 });
}
function cobbleTex(name, seed, S) {
  // Sett paving, not voronoi mosaic: warped cell boundaries, per-stone dome profiles
  // (some crowned, some worn flat), sand in the joints, the odd missing or off-colour stone.
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const w = warpedWorley(rng(seed ^ 3), S, 10, 0.3, 0.07);
  const grain = fbm(r, S, [[32, 1], [128, 0.5]]);
  const sand = fbm(rng(seed ^ 6), S, [[48, 1], [160, 0.6]]);
  t.fill([0.5, 0.48, 0.45]).mrInit(0.05, 0.85);
  t.each((x, y, i) => {
    const c = w(x, y), rim = c.d2 - c.d1, g = grain(x, y);
    const jw = (2.5 + hash2(c.id * 97, 3) * 3.5) * k;                // joint width varies stone to stone
    const missing = hash2(c.id * 131, 5) > 0.965;
    if (rim < jw || missing) {                                       // the joint: sand and grit, not void
      t.mix(i, [0.36, 0.31, 0.25], 0.9);
      t.tint(i, 0.8 + sand(x, y) * 0.45);
      if (hash2(x | 0, y * 3 | 0) > 0.9) t.tint(i, 1.25);            // grit specks
      t.h[i] = 0.06 + sand(x, y) * 0.12;
      t.mr[i * 2] = 0.95;
      return;
    }
    const tone = 0.74 + hash2(c.id * 57.3, 1) * 0.5;                 // tone and hue decorrelated
    let warm = 0.965 + hash2(c.id * 57.3, 2) * 0.07;
    if (hash2(c.id * 77, 9) > 0.93) warm += (hash2(c.id * 91, 2) > 0.5 ? 0.06 : -0.055);   // pink/blue outliers, rare and subtle
    t.tintC(i, tone * warm, tone, tone * (2 - warm));
    t.tint(i, 0.9 + g * 0.2);
    const dome = Math.min(1, (rim - jw) / ((8 + c.id * 14) * k));
    t.h[i] = Math.pow(dome, 0.55 + c.id * 0.75) * (0.68 + hash2(c.id * 41, 4) * 0.32);
    t.mr[i * 2] = 0.85 - t.h[i] * 0.35;                              // crowns polish, flanks stay matte
    if (dome < 0.22) t.tint(i, 0.88);                                // grime ring where stone meets sand
  });
  erodeMin(t.h, S, 2.5 * k, seed ^ 33);
  return finish(t, seed, { cavDark: 0.34, edgeLight: 0.14, edgeSmooth: 0.35 });
}
function rockTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S);
  const f1 = fbm(r, S, [[6, 1], [12, 0.6], [24, 0.4], [64, 0.25], [160, 0.15]]);
  const f2 = fbm(r, S, [[8, 1], [32, 0.5]]);
  t.fill([0.46, 0.42, 0.38]);
  t.each((x, y, i) => {
    const ridge = 1 - Math.abs(2 * f1(x, y) - 1);
    const strat = Math.sin((y + f2(x, y) * 90) * Math.PI * 10 / S) * 0.5 + 0.5;
    t.tint(i, 0.6 + ridge * 0.5);
    t.tintC(i, 1 + strat * 0.1, 1 + strat * 0.04, 1 - strat * 0.05);
    t.h[i] = ridge;
  });
  return finish(t, seed, { cavDark: 0.4, cavK: 2, edgeLight: 0.18 });
}
function dirtTex(name, seed, S) {
  // Pebbles are half-buried hemispheres in three sizes at low contrast — not bright confetti.
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const f = fbm(r, S, [[8, 1], [24, 0.6], [96, 0.4]]);
  const smear = fbm(rng(seed ^ 11), S, [[3, 1]]);
  const peb = worley(rng(seed ^ 7), S, 44);
  const grav = worley(rng(seed ^ 9), S, 96);
  const bigW = warpedWorley(rng(seed ^ 10), S, 6, 0.35, 0.08);
  const damp = fbm(rng(seed ^ 12), S, [[5, 1], [15, 0.5]]);
  t.fill([0.4, 0.32, 0.24]).mrInit(0.02, 0.92);
  t.each((x, y, i) => {
    const g = f(((x + (smear(x, y) - 0.5) * 40 * k) % S + S) % S, y);   // directionally smeared clods
    t.tint(i, 0.78 + g * 0.45); t.h[i] = g * 0.45;
    const gv = grav(x, y);                                           // fine gravel, barely-there
    if (gv.d1 < 0.9 * k && gv.id > 0.4) { t.tint(i, 1.1); t.h[i] += 0.12; }
    const c = peb(x, y);                                             // pebbles: domed, half-buried
    const R = (1 + hash2(c.id * 91, 7) * 2.8) * k;
    if (c.d1 < R && c.id > 0.55) {
      const pp = 1 - c.d1 / R;
      t.mix(i, [0.55, 0.5, 0.44], Math.max(0, pp - 0.25) * 1.2);
      t.tint(i, 1 + 0.13 * pp);
      t.h[i] += 0.35 * pp * pp;
    }
    const bs = bigW(x, y);                                           // the rare larger stone
    if (bs.d1 < 6 * k && bs.id > 0.88) { const pp = 1 - bs.d1 / (6 * k);
      t.mix(i, [0.5, 0.46, 0.4], Math.max(0, pp - 0.15)); t.tint(i, 1 + 0.1 * pp); t.h[i] += 0.5 * pp * pp; }
    const dp = damp(x, y);                                           // damp patches: darker AND less rough
    if (dp > 0.6) { const dd = Math.min(1, (dp - 0.6) * 4); t.tint(i, 1 - 0.22 * dd); t.mr[i * 2] -= 0.18 * dd; }
  });
  return finish(t, seed, { cavDark: 0.28 });
}
function grassTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S);
  const clump = fbm(r, S, [[10, 1], [30, 0.6]]);
  const dry = fbm(rng(seed ^ 4), S, [[4, 1], [12, 0.5]]);
  const cool = fbm(rng(seed ^ 9), S, [[5, 1], [15, 0.4]]);           // slow hue drift: warm and cool greens
  t.fill([0.23, 0.33, 0.14]);
  t.each((x, y, i) => {
    const c = clump(x, y), d = dry(x, y), q2 = cool(x, y);
    t.tint(i, 0.74 + c * 0.44);
    if (q2 > 0.55) t.mix(i, [0.17, 0.30, 0.19], Math.min(1, (q2 - 0.55) * 3) * 0.5);   // cool blue-green patches
    if (d > 0.58) t.mix(i, [0.5, 0.45, 0.22], Math.min(1, (d - 0.58) * 4) * 0.6);      // dry straw patches
    t.h[i] = c * 0.4;
  });
  const k = S / 256;                                                 // blades: short strokes, any resolution
  for (let q = 0; q < S * S / 230; q++) {
    let x = r() * S, y = r() * S;
    const lean = (r() - 0.5) * 0.9, len = (2 + r() * 3) * k, up = r() < 0.5 ? 0.82 : 1.2;
    for (let d = 0; d < len; d++) {
      const i = (((y - d) | 0 + S) % S) * S + (((x + lean * d) | 0) + S) % S;
      t.tint(i, up); t.h[i] += 0.1;
    }
  }
  return finish(t, seed, { cavDark: 0.22, edgeLight: 0.1 });
}
function sandTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S);
  const warp = fbm(r, S, [[6, 1], [18, 0.5]]);
  const grain = fbm(rng(seed ^ 2), S, [[200, 1]]);
  t.fill([0.76, 0.66, 0.48]);
  t.each((x, y, i) => {
    const rip = Math.sin((x + warp(x, y) * 120) * Math.PI * 14 / S) * 0.5 + 0.5;
    t.tint(i, 0.86 + rip * 0.2 + (grain(x, y) - 0.5) * 0.1);
    t.h[i] = rip * 0.8;
    if (r() < 0.02) t.tint(i, 1.16);
  });
  return finish(t, seed, { cavDark: 0.2, edgeK: 1, grainRough: 0.06 });
}
function plankTex(name, seed, S, col = [0.55, 0.4, 0.26]) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256, pw = S / 6;
  const grain = fbm(r, S, [[4, 1], [10, 0.7], [40, 0.4]]);
  // knots: a few hand-placed ellipses, long axis along the grain, with the grain field
  // deflecting around each — not concentric rings
  const kr = rng(seed ^ 8), knots = [];
  for (let q = 0; q < 5; q++) knots.push([kr() * S, kr() * S, (6 + kr() * 7) * k]);
  t.fill(col);
  t.each((x, y, i) => {
    const colI = Math.floor(x / pw), ph = hash2(colI, 7);
    const lx = x % pw;
    let warp = 0, knotD = 9;
    for (const [kx2, ky2, R] of knots) {
      let dx = x - kx2; dx -= Math.round(dx / S) * S;
      let dy = y - ky2; dy -= Math.round(dy / S) * S;
      const d = Math.hypot(dx / 0.42, dy) / R;              // tall ellipse: stretched with the grain
      if (d < knotD) knotD = d;
      if (d < 2.4) warp += (dx >= 0 ? 1 : -1) * Math.max(0, 1 - d / 2.4) * 7 * k;   // grain parts around the knot
    }
    // grain stretched ALONG the plank (slow in y, fast in x — the first version had it sideways)
    const g = grain((((x * 4 + warp) % S) + S) % S, (((y * 0.35 + ph * S) % S) + S) % S);
    const tone = 0.8 + ph * 0.36;
    t.tint(i, tone * (0.78 + g * 0.45));
    t.h[i] = g * 0.5;
    if (lx < 2 * k || lx > pw - 2 * k) { t.tint(i, 0.55); t.h[i] = 0; }               // plank gaps
    const seamY = Math.floor(hash2(colI, 3) * 4) * (S / 4) + (S / 8) * (colI % 2);
    if (Math.abs(y - seamY) < 2 * k) { t.tint(i, 0.6); t.h[i] = 0; }                  // board ends
    if (knotD < 1.4) {                                                                 // the knot itself
      const core = Math.max(0, 1 - knotD / 0.45);
      t.mix(i, [0.3, 0.19, 0.1], Math.min(1, core * 1.5));                             // dark heart
      t.tint(i, 1 - Math.max(0, 1 - knotD) * 0.22);                                    // soft halo, no bands
      t.h[i] += core * 0.3 - Math.max(0, 1 - knotD) * 0.12;                            // raised centre, sunk ring
    }
  });
  return finish(t, seed, { cavDark: 0.32 });
}
function asphaltTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const f = fbm(r, S, [[6, 1], [24, 0.5]]);
  t.fill([0.16, 0.16, 0.17]).mrInit(0.05, 0.85);
  t.each((x, y, i) => {
    const g = f(x, y); t.tint(i, 0.8 + g * 0.5 + (r() < 0.16 ? r() * 0.35 : 0));
    t.h[i] = g * 0.3 + r() * 0.08;
    t.mr[i * 2] = 0.78 + g * 0.18;
  });
  for (let c = 0; c < 3; c++) {                                                       // cracks with light edges
    let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
    for (let d = 0, len = S * (0.4 + r() * 0.4); d < len; d++) {
      ang += (r() - 0.5) * 0.35; x = (x + Math.cos(ang) + S) % S; y = (y + Math.sin(ang) + S) % S;
      const i = (y | 0) * S + (x | 0); t.tint(i, 0.45); t.h[i] -= 0.8;
      const jx = ((x - Math.sin(ang) * 1.3) | 0 + S) % S, jy = ((y + Math.cos(ang) * 1.3) | 0 + S) % S;
      t.tint(jy * S + jx, 1.22);                                    // raised lip perpendicular to the crack
    }
  }
  { const px = (r() * S) | 0, py = (r() * S) | 0, pw2 = (40 + r() * 60) * k, ph2 = (30 + r() * 50) * k;
    for (let y = 0; y < ph2; y++) for (let x = 0; x < pw2; x++) {                     // fresh patch rectangle
      const i = (((py + y) | 0) % S) * S + (((px + x) | 0) % S); t.tint(i, 0.5 + f((px + x) % S, (py + y) % S) * 0.18); t.mr[i * 2] = 0.6; } }
  return finish(t, seed, { cavDark: 0.3, edgeLight: 0.1 });
}
function tilesTex(name, seed, S, col = [0.72, 0.76, 0.76]) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256, tw = S / 8;
  t.fill(col).mrInit(0.05, 0.28);
  const g = fbm(r, S, [[16, 1], [64, 0.4]]);
  t.each((x, y, i) => {
    const tx = Math.floor(x / tw), ty = Math.floor(y / tw), lx = x % tw, ly = y % tw, m = 2 * k;
    if (lx < m || ly < m) { t.mix(i, [0.42, 0.4, 0.38], 0.95); t.h[i] = 0; t.mr[i * 2] = 0.9; return; }
    const tone = 0.9 + hash2(tx, ty) * 0.18;
    t.tint(i, tone * (0.96 + g(x, y) * 0.08));
    const e = Math.min(lx, ly, tw - lx, tw - ly) - m;
    t.h[i] = 0.8 * sstep(0, 2.5 * k, e); t.mr[i * 2] = 0.22 + hash2(ty, tx) * 0.2;
    if (hash2(tx * 5, ty * 3) > 0.93) { t.tint(i, 0.8 + g(y, x) * 0.2); t.mr[i * 2] = 0.6; }   // a stained tile
  });
  return finish(t, seed, { cavDark: 0.25, edgeSmooth: 0.1 });
}
function marbleTex(name, seed, S, col = [0.85, 0.85, 0.88]) {
  const r = rng(seed), t = new Tex(name, S);
  const w1 = fbm(r, S, [[4, 1], [10, 0.6]]);
  const w2 = fbm(rng(seed ^ 6), S, [[8, 1], [20, 0.5]]);
  t.fill(col).mrInit(0.05, 0.2);
  t.each((x, y, i) => {
    const v1 = Math.pow(1 - Math.abs(2 * w1((x + w2(x, y) * 140) % S, y) - 1), 10);
    const v2 = Math.pow(1 - Math.abs(2 * w2((x + w1(x, y) * 90) % S, (y + 77) % S) - 1), 14);
    t.tint(i, 1 - v1 * 0.35 - v2 * 0.2);
    if (v1 > 0.5) t.tintC(i, 0.92, 0.94, 1.02);
    t.h[i] = 0.5; t.mr[i * 2] = 0.16 + v1 * 0.2;
  });
  return finish(t, seed, { cavDark: 0.1, edgeK: 0.5, grainRough: 0.05 });
}
function plasterTex(name, seed, S, col = [0.8, 0.76, 0.68]) {
  // Losses are ragged (noise-modulated boundary), come in two sizes, have a curling lip and
  // radiating hairlines — never a circle with an annulus.
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const f = fbm(r, S, [[6, 1], [20, 0.5], [80, 0.3]]);
  const rag = fbm(rng(seed ^ 12), S, [[10, 1], [30, 0.6], [90, 0.3]]);
  const holes = worley(rng(seed ^ 11), S, 7);
  const small = worley(rng(seed ^ 19), S, 18);
  t.fill(col);
  const bare = (x, y, i, g) => {                                     // masonry under the loss
    const b = brickAt(x, y, S / 4, S / 16, 0.5);
    const bm = (b.lx < 3 * k || b.ly < 3 * k);
    t.rgb[i * 3] = bm ? 0.6 : 0.5; t.rgb[i * 3 + 1] = bm ? 0.58 : 0.28; t.rgb[i * 3 + 2] = bm ? 0.54 : 0.2;
    t.tint(i, 0.8 + g * 0.3); t.h[i] = 0.12;
  };
  t.each((x, y, i) => {
    const g = f(x, y);
    t.tint(i, 0.88 + g * 0.2); t.h[i] = 0.7 + g * 0.3;
    const c = holes(x, y);
    if (c.id > 0.82) {
      const d = c.d1 / (19 * k) + (rag(x, y) - 0.5) * 0.7;           // ragged boundary
      if (d < 0.92) { bare(x, y, i, f(y, x)); return; }
      if (d < 1.0 && rag(y, x) > 0.45) { t.tint(i, 0.86); t.h[i] -= 0.15; }   // broken fringe
      else if (d < 1.12) { t.tint(i, 1.05); t.h[i] += 0.09; }        // curling lip catches light
    }
    const sc = small(x, y);                                          // sparse small chips to the scratch coat
    const sd = sc.d1 / ((2.5 + sc.id * 4) * k) + (rag(y, x) - 0.5) * 0.5;
    if (sc.id > 0.91 && sd < 1) { t.tint(i, 0.9); t.h[i] = Math.min(t.h[i], 0.5); }
  });
  for (let q = 0; q < 7; q++) {                                      // hairline cracks wandering from losses
    let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
    for (let d = 0, len = S * (0.15 + r() * 0.3); d < len; d++) {
      ang += (r() - 0.5) * 0.5;
      x = (x + Math.cos(ang) + S) % S; y = (y + Math.sin(ang) + S) % S;
      const i = (y | 0) * S + (x | 0); t.tint(i, 0.62); t.h[i] -= 0.5;
    }
  }
  return finish(t, seed, { cavDark: 0.32 });
}
function corrugatedTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  t.fill([0.6, 0.62, 0.64]).mrInit(0.6, 0.5);
  const g = fbm(r, S, [[8, 1], [48, 0.4]]);
  t.each((x, y, i) => {
    const rip = Math.sin(x * Math.PI * 32 / S) * 0.5 + 0.5;
    t.tint(i, (0.8 + rip * 0.3) * (0.9 + g(x, y) * 0.2));
    t.h[i] = rip; t.mr[i * 2] = 0.42 + rip * 0.2;
  });
  for (let q = 0; q < 7; q++) {                                                        // rust wash from the top lap
    const sx = (r() * S) | 0, len = (60 + r() * 160) * k, w = (3 + r() * 6) * k;
    for (let d = 0; d < len; d++) for (let dx = -w; dx <= w; dx++) {
      const i = ((d | 0) % S) * S + (((sx + dx) | 0) + S) % S;
      t.mix(i, [0.42, 0.24, 0.13], 0.5 * (1 - d / len) * (1 - Math.abs(dx) / (w + 1))); t.mr[i * 2] = Math.min(1, t.mr[i * 2] + 0.3); }
  }
  return finish(t, seed, { edgeSmooth: 0.25 });
}
function paintedMetalTex(name, seed, S, col = [0.3, 0.42, 0.3]) {
  // Chips are ragged, rust is an independent weather field (some chips clean, some eaten),
  // big scrapes near seams, a lifted-paint rim, and orange-peel in the paint itself.
  const r = rng(seed), t = new Tex(name, S), k = S / 256, P = S / 2;
  t.fill(col).mrInit(0.25, 0.55);
  const g = fbm(r, S, [[12, 1], [48, 0.5]]);
  const peel = fbm(rng(seed ^ 18), S, [[200, 1]]);
  const rag = fbm(rng(seed ^ 14), S, [[40, 1], [120, 0.6]]);
  const rustF = fbm(rng(seed ^ 15), S, [[24, 1], [96, 0.7]]);
  const chips = worley(rng(seed ^ 13), S, 24);
  const scrape = worley(rng(seed ^ 17), S, 8);
  const seamD = (v) => Math.min(v % P, P - (v % P));
  const METAL = [0.55, 0.57, 0.6], RUST = [0.4, 0.23, 0.12];
  t.each((x, y, i) => {
    t.tint(i, 0.9 + g(x, y) * 0.2);
    t.h[i] = 0.6 + (peel(x, y) - 0.5) * 0.08;                        // orange-peel
    t.mr[i * 2] = 0.5 + (g(x, y) - 0.5) * 0.25;
    const ds = Math.min(seamD(x), seamD(y));
    if (ds < 2 * k) { t.tint(i, 0.6); t.h[i] = 0.2; t.mr[i * 2] = 0.7; }
    const near = Math.max(0, 1 - ds / (14 * k));
    const c = chips(x, y), sc = scrape(x, y);
    const cd = c.d1 + (rag(x, y) - 0.5) * 8 * k;                     // ragged chip boundary
    const sd = sc.d1 + (rag(y, x) - 0.5) * 14 * k;
    const R1 = (1.8 + near * 3.5 + c.id * 1.5) * k, R2 = (5 + sc.id * 9) * k * (0.4 + near);
    const inChip = (cd < R1 && c.id > 0.8) || (sd < R2 && sc.id > 0.9);
    if (inChip) {
      t.rgb[i * 3] = METAL[0]; t.rgb[i * 3 + 1] = METAL[1]; t.rgb[i * 3 + 2] = METAL[2];
      t.tint(i, 0.9 + g(y, x) * 0.2);
      t.h[i] = 0.34; t.mr[i * 2] = 0.4; t.mr[i * 2 + 1] = 0.85;
      const rf = rustF(x, y);                                        // rust where the weather says so
      if (rf > 0.52) { const rr2 = Math.min(1, (rf - 0.52) * 3);
        t.mix(i, RUST, rr2 * 0.85); t.mr[i * 2] = 0.4 + rr2 * 0.5; t.mr[i * 2 + 1] = 0.2; t.h[i] += rr2 * 0.1; }
    } else if (cd < R1 + 1.6 * k && c.id > 0.8) {
      t.tint(i, 1.08); t.h[i] -= 0.08;                               // lifted paint rim
    }
  });
  for (let q = 0; q < 10 * k; q++) {
    let x = r() * S, y = r() * S; const a = r() * Math.PI, len = (8 + r() * 30) * k;
    for (let d = 0; d < len; d++) { const i = ((Math.round(y + Math.sin(a) * d) + S) % S) * S + (Math.round(x + Math.cos(a) * d) + S) % S;
      t.tint(i, 1.15); t.mr[i * 2] = 0.4; }
  }
  return finish(t, seed, { edgeLight: 0.22 });
}
function scifiPanelTex(name, seed, S, accent = [0.25, 0.85, 1]) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  t.fill([0.74, 0.77, 0.81]).mrInit(0.55, 0.42).emInit();
  const g = fbm(r, S, [[16, 1], [80, 0.4]]);
  const half = S / 2;
  t.each((x, y, i) => {
    t.tint(i, 0.94 + g(x, y) * 0.12); t.h[i] = 0.8; t.mr[i * 2] = 0.36 + g(x, y) * 0.14;
    const cx = Math.floor(x / half), cy = Math.floor(y / half), lx = x % half, ly = y % half;
    const hsh = hash2(cx + 3, cy + 5);
    if (lx < 2 * k || ly < 2 * k) { t.tint(i, 0.55); t.h[i] = 0.3; t.mr[i * 2] = 0.6; }
    const ix0 = 18 * k + hsh * 20 * k, iy0 = 18 * k, ix1 = half - 18 * k, iy1 = half - 18 * k - hsh * 24 * k;
    if (lx > ix0 && lx < ix1 && ly > iy0 && ly < iy1) {                                // recessed inner panel
      t.tint(i, 0.9); t.h[i] = 0.45;
      const eb = Math.min(lx - ix0, ix1 - lx, ly - iy0, iy1 - ly);
      if (eb < 2.5 * k) { t.tint(i, 0.62); t.h[i] = 0.3; }
    }
    if (hsh > 0.55 && ly > iy1 + 6 * k && ly < iy1 + 11 * k && lx > 30 * k && lx < half - 30 * k) {
      const on = hash2(cx * 9, cy * 4) > 0.35;
      t.h[i] = 0.5; if (on) t.setEm(i, accent, 0.9); t.rgb[i*3]=accent[0]*0.4; t.rgb[i*3+1]=accent[1]*0.4; t.rgb[i*3+2]=accent[2]*0.4;   // light strip
    }
    if (hsh <= 0.55 && ly > iy1 + 6 * k && ly < iy1 + 12 * k && lx > 34 * k && lx < 74 * k && ((lx / (4 * k)) | 0) % 2 === 0) {
      t.tint(i, 0.35); t.h[i] = 0.35;                                                  // vent slats
    }
  });
  return finish(t, seed, { cavDark: 0.24, edgeSmooth: 0.15 });
}
function scifiFloorTex(name, seed, S, accent = [0.25, 0.85, 1]) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256, tw = S / 4;
  t.fill([0.5, 0.53, 0.57]).mrInit(0.6, 0.5).emInit();
  const g = fbm(r, S, [[12, 1], [64, 0.5]]);
  t.each((x, y, i) => {
    const tx = Math.floor(x / tw), ty = Math.floor(y / tw), lx = x % tw, ly = y % tw, m = 3 * k;
    t.tint(i, (0.9 + hash2(tx, ty) * 0.16) * (0.92 + g(x, y) * 0.14));
    t.h[i] = 0.7; t.mr[i * 2] = 0.42 + g(x, y) * 0.2;
    const eb = Math.min(lx, ly, tw - lx, tw - ly);
    if (eb < m) { t.tint(i, 0.5); t.h[i] = 0.3;
      if (hash2(tx * 7 + ty, ty * 3) > 0.72) { t.setEm(i, accent, 0.75); t.rgb[i*3]=accent[0]*0.35; t.rgb[i*3+1]=accent[1]*0.35; t.rgb[i*3+2]=accent[2]*0.35; } }
    else if (eb < m + 2 * k) t.tint(i, 0.7);
    if (((x / (2 * k)) | 0) % 2 === ((y / (2 * k)) | 0) % 2 && lx > 12 * k && lx < 30 * k && ly > 12 * k && ly < 30 * k) t.tint(i, 0.88);   // tread patch
  });
  return finish(t, seed, { cavDark: 0.26 });
}
function lavaTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S).emInit();
  const w = worley(rng(seed ^ 15), S, 8);
  const f = fbm(r, S, [[8, 1], [24, 0.6], [96, 0.3]]);
  t.fill([0.09, 0.07, 0.06]);
  t.each((x, y, i) => {
    const c = w(x, y), rim = c.d2 - c.d1, g = f(x, y);
    t.tint(i, 0.7 + g * 0.6); t.h[i] = Math.min(1, rim / (18 * (S / 256)));
    const hot = Math.max(0, 1 - rim / (11 * (S / 256)));
    if (hot > 0) { const hh = Math.min(1, hot * (1.0 + g * 0.5));
      t.setEm(i, [1, 0.38 + g * 0.3, 0.05], hh);
      t.mix(i, [0.95, 0.35, 0.06], Math.min(1, hot * 1.2)); t.h[i] = 0.1; }
    else if (g > 0.62) t.setEm(i, [0.85, 0.2, 0.02], (g - 0.62) * 2.2);               // ember pores
  });
  return finish(t, seed, { cavDark: 0.2, edgeLight: 0.1 });
}

// ---- build 1114: three more families -----------------------------------------------------
// Wind-carved bedded sandstone. The read is BEDDING, not masonry: alternating hard and soft
// strata, the soft ones undercut into shadow, tafoni pitting where salt has eaten into the face,
// and a bleached crust on the exposed ledges. The bedding planes are noise-warped, because a ruled
// horizontal line at this scale is the tell that gives a procedural rock away instantly.
function sandstoneTex(name, seed, S, col = [0.78, 0.62, 0.43]) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256, BED = S / 9;
  const warp = fbm(r, S, [[3, 1], [9, 0.5], [28, 0.25]]);
  const fine = fbm(rng(seed ^ 3), S, [[20, 1], [80, 0.5], [220, 0.3]]);
  const pits = worley(rng(seed ^ 5), S, 26);
  const salt = fbm(rng(seed ^ 7), S, [[4, 1], [13, 0.6]]);
  t.fill(col).mrInit(0.02, 0.95);
  t.each((x, y, i) => {
    // beds are not a layer cake: a monotone distortion of y before banding makes some beds thick
    // and some a few centimetres, which is what stops the eye finding the repeat
    const yw = y + (warp(x, y) - 0.5) * 30 * k;
    const yy = yw + Math.sin(yw * Math.PI * 2 / S) * 16 * k + Math.sin(yw * Math.PI * 6 / S) * 7 * k;
    const band = Math.floor(yy / BED), inBed = (((yy % BED) + BED) % BED) / BED;
    const hard = hash2(band, 11);                                   // per-bed hardness
    const g = fine(x, y);
    // soft beds sit back and hold shadow; hard beds stand proud and catch the light
    const depth = hard < 0.42 ? 0.3 + Math.sin(inBed * Math.PI) * 0.18 : 0.78 + g * 0.16;
    t.h[i] = depth;
    t.tint(i, 0.72 + depth * 0.42 + (g - 0.5) * 0.14);
    // bed-to-bed drift stays in the warm half of the wheel: a soft bed is a DARKER ochre, not a
    // grey one, or the rock reads as wet concrete in bands
    t.tintC(i, 1 + (hard - 0.5) * 0.05, 1 + (hard - 0.5) * 0.11, 1 + (hard - 0.5) * 0.24);
    if (inBed < 0.05 || inBed > 0.95) { t.tint(i, 0.82); t.h[i] -= 0.12; }   // the parting itself
    // tafoni: honeycomb hollows, and they eat the SOFT beds — sprayed evenly over the face they
    // read as polka dots, which is the giveaway on every procedural rock that has them
    const c = pits(x, y);
    const R = (1.6 + hash2(c.id * 53, 3) * 7) * k * (hard < 0.42 ? 1 : 0.45);
    if (c.id > 0.74 && c.d1 < R) {
      const p2 = 1 - c.d1 / R;
      t.tint(i, 1 - p2 * 0.34); t.h[i] -= p2 * p2 * 0.5;
      t.mr[i * 2] = Math.min(1, t.mr[i * 2] + p2 * 0.06);
    }
    const sv = salt(x, y);                                           // salt bloom / sun bleach
    if (sv > 0.58) { const ss = Math.min(1, (sv - 0.58) * 3.2);
      t.mix(i, [0.92, 0.88, 0.8], ss * 0.45); t.mr[i * 2] = Math.min(1, t.mr[i * 2] + ss * 0.04); }
  });
  return finish(t, seed, { cavDark: 0.36, cavK: 1.9, edgeLight: 0.22, edgeSmooth: 0.12 });
}
// Wind-packed snow. Almost all of the read is in the NORMAL and the ROUGHNESS, not the colour:
// sastrugi ridges carved across the wind, a glazed crust on the ridges against powder in the
// hollows, a blue shift where the surface dips (snow's shadow is sky-lit, not black), and sparse
// specular sparkle where crystal facets happen to face the camera.
function snowTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const drift = fbm(r, S, [[3, 1], [8, 0.5]]);                       // the big soft dunes
  const warp = fbm(rng(seed ^ 2), S, [[6, 1], [20, 0.4]]);
  const grain = fbm(rng(seed ^ 4), S, [[120, 1], [360, 0.6]]);
  const scour = fbm(rng(seed ^ 6), S, [[4, 1], [12, 0.5]]);
  t.fill([0.93, 0.945, 0.97]).mrInit(0.0, 0.72);
  t.each((x, y, i) => {
    const d = drift(x, y);
    // Sastrugi run ACROSS the wind, so their phase is mostly the linear coordinate and only
    // slightly warped. Warp them hard instead (the first cut used a 150px offset on a 256px tile)
    // and the sine folds back on itself: contour rings, a topographic map rather than snow.
    const ph = y + (warp(x, y) - 0.5) * 16 * k + d * 10 * k;
    const rid = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2 * 5 / S)), 1.7);   // crisp crest, broad trough
    const amp = Math.max(0, d - 0.3) * 1.5;                          // carved where the wind bites, smooth where it fills
    const hgt = d * 0.5 + rid * amp * 0.6 + (grain(x, y) - 0.5) * 0.05;
    t.h[i] = hgt;
    // Snow's albedo is very nearly flat — the drifts are read from SHADING, not from tone. Driving
    // the base colour off the height (and tinting the hollows hard) painted the sastrugi on as blue
    // stripes, which is exactly what a photo of snow does not look like.
    t.tint(i, 0.97 + hgt * 0.05);
    if (hgt < 0.42) t.tintC(i, 1 - (0.42 - hgt) * 0.15, 1 - (0.42 - hgt) * 0.07, 1);   // sky-lit hollows
    t.mr[i * 2] = 0.88 - rid * 0.4;                                  // glazed crust on the crests
    const sc = scour(x, y);                                          // wind-scoured back to old crust
    if (sc > 0.68) { const s2 = Math.min(1, (sc - 0.68) * 3);
      t.mix(i, [0.74, 0.75, 0.77], s2 * 0.3); t.mr[i * 2] = Math.min(1, t.mr[i * 2] + s2 * 0.12); t.h[i] -= s2 * 0.12; }
    if (r() < 0.002) { t.tint(i, 1.05); t.mr[i * 2] = 0.12; }        // facet sparkle
  });
  return finish(t, seed, { cavDark: 0.14, cavK: 1.2, edgeLight: 0.12, grainRough: 0.05 });
}
// Frozen-over water: fracture planes running through the slab, columns of trapped air, and frost
// bloom that turns the surface matte wherever the wind reached it. The fractures are drawn from the
// worley d2-d1 rim so they read as thin bright refractive seams instead of cell borders.
function iceTex(name, seed, S) {
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const cracks = warpedWorley(rng(seed ^ 3), S, 6, 0.45, 0.1);
  const bub = worley(rng(seed ^ 9), S, 14);
  const bloom = fbm(rng(seed ^ 11), S, [[5, 1], [17, 0.6], [70, 0.3]]);
  const deep = fbm(rng(seed ^ 13), S, [[4, 1], [11, 0.5]]);
  t.fill([0.6, 0.72, 0.78]).mrInit(0.02, 0.12);
  t.each((x, y, i) => {
    const dv = deep(x, y);
    t.tint(i, 0.88 + dv * 0.26);
    t.tintC(i, 1 - dv * 0.11, 1 - dv * 0.04, 1);                     // thicker ice reads bluer
    t.h[i] = 0.74 + (dv - 0.5) * 0.1;
    const w = cracks(x, y), rim = (w.d2 - w.d1) / (3.4 * k);         // the fracture web
    if (rim < 1) { const f2 = (1 - rim) * (1 - rim);
      t.mix(i, [0.93, 0.97, 1], f2 * 0.6); t.h[i] -= f2 * 0.34; t.mr[i * 2] = Math.min(1, t.mr[i * 2] + f2 * 0.25); }
    // Bubbles are frozen-in columns: few, large and drawn out vertically. Sprayed small and dense
    // (the first cut used 40 cells and a 0.5 threshold) they read as confetti, not as trapped air.
    const b = bub(x, y), R = (1.4 + b.id * 3.2) * k;
    if (b.id > 0.72 && b.d1 < R) { const p2 = 1 - b.d1 / R;
      t.mix(i, [0.97, 0.99, 1], p2 * p2 * 0.75); t.h[i] += p2 * 0.05; }
    const bl = bloom(x, y);                                          // wind frost: matte, feathered
    if (bl > 0.56) { const f3 = Math.min(1, (bl - 0.56) * 2.4);
      t.mix(i, [0.9, 0.94, 0.96], f3 * 0.55); t.mr[i * 2] = Math.min(1, t.mr[i * 2] + f3 * 0.6); t.h[i] += f3 * 0.05; }
  });
  // long straight fissures: the feature that says "a sheet under stress" rather than "a noise field"
  for (let q = 0; q < 5; q++) {
    let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
    const len = S * (0.5 + r() * 0.7), w2 = (0.8 + r() * 1.4) * k;
    for (let d = 0; d < len; d++) {
      ang += (r() - 0.5) * 0.05;                                     // nearly straight
      x = (x + Math.cos(ang) + S) % S; y = (y + Math.sin(ang) + S) % S;
      for (let o = -w2; o <= w2; o++) {
        const i = (((y + o * Math.sin(ang + 1.57)) | 0) % S + S) % S * S + ((((x + o * Math.cos(ang + 1.57)) | 0) % S) + S) % S;
        const f4 = 1 - Math.abs(o) / (w2 + 1);
        t.mix(i, [0.95, 0.98, 1], f4 * 0.5); t.h[i] -= f4 * 0.3; t.mr[i * 2] = Math.min(1, t.mr[i * 2] + f4 * 0.3);
      }
    }
  }
  return finish(t, seed, { cavDark: 0.16, edgeLight: 0.14, edgeSmooth: 0.12, grainRough: 0.04 });
}

// ---- signage: worn stencil lettering baked on demand -----------------------------------
// A 5x7 stencil font. sign() bakes each unique string once into a shared 1024x1024 atlas row
// and emits an alpha-blended quad, so layouts can label bases, shops and hazards free-form.
const FONT = {
  A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[15,16,16,16,16,16,15],D:[30,17,17,17,17,17,30],
  E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[15,16,16,23,17,17,15],H:[17,17,17,31,17,17,17],
  I:[31,4,4,4,4,4,31],J:[7,2,2,2,2,18,12],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],
  M:[17,27,21,21,17,17,17],N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],
  Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,27,17],X:[17,17,10,4,10,17,17],
  Y:[17,17,10,4,4,4,4],Z:[31,1,2,4,8,16,31],
  '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,6,8,16,31],'3':[30,1,1,14,1,1,30],
  '4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[14,16,16,30,17,17,14],'7':[31,1,2,4,8,8,8],
  '8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,1,14],'-':[0,0,0,31,0,0,0],' ':[0,0,0,0,0,0,0],
  '!':[4,4,4,4,4,0,4],'.':[0,0,0,0,0,0,4],
};
let _signTex = null, _signRow = 0, _signMat = null;
const _signSlots = {};   // text -> { u0, v0, u1, v1, cols }
function _bakeSign(text, color) {
  if (!_signTex) { _signTex = new Tex('signage', 1024); _signTex.a = new Float64Array(1024 * 1024); _signTex.noAux = true;
    useTex(_signTex); _signMat = mat('signage', { tex: 'signage', blend: true, rough: 0.6, metal: 0, base: [1, 1, 1] }); }
  const key = text + '|' + color.join(',');
  if (_signSlots[key]) return _signSlots[key];
  const S = 1024, cols = text.length * 6 - 1;
  const bw = Math.min(13, Math.floor(1016 / (cols * 5)));           // block size so the row fits
  const wear = fbm(rng(31337 + _signRow), S, [[48, 1], [128, 0.7]]);
  const y0 = _signRow * 100 + 4, x0 = 4;
  if (y0 + 96 > S) throw new Error('signage atlas full');
  for (let ci = 0; ci < text.length; ci++) {
    const g = FONT[text[ci].toUpperCase()] || FONT[' '];
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
      if (!((g[gy] >> (4 - gx)) & 1)) continue;
      for (let py = 0; py < bw * 2; py++) for (let px = 0; px < bw; px++) {
        const X = x0 + (ci * 6 + gx) * bw + px, Y = y0 + gy * bw * 2 + py;
        const w = wear(X, Y), a = w < 0.3 ? 0 : 0.92 * (0.5 + 0.5 * Math.min(1, (w - 0.3) / 0.35));
        const i = Y * S + X;
        if (a > _signTex.a[i]) { _signTex.a[i] = a;
          _signTex.rgb[i * 3] = color[0]; _signTex.rgb[i * 3 + 1] = color[1]; _signTex.rgb[i * 3 + 2] = color[2]; }
      }
    }
  }
  const slot = { u0: x0 / S, v0: y0 / S, u1: (x0 + cols * bw) / S, v1: (y0 + 14 * bw) / S, cols };
  _signSlots[key] = slot; _signRow++;
  return slot;
}
// stencil text on a surface; height in world units, width follows the glyph aspect
function sign(face, cx, cy, cz, h, text, color = [0.9, 0.88, 0.82], rot = 0) {
  const sl = _bakeSign(text, color);
  const w = h * sl.cols / 14;
  const m = _signMat;
  if (face === 'up') {
    let uv = [[sl.u0, sl.v0], [sl.u1, sl.v0], [sl.u1, sl.v1], [sl.u0, sl.v1]];
    for (let q = 0; q < ((rot / 90) | 0); q++) uv = [uv[3], uv[0], uv[1], uv[2]];
    const rw = (rot % 180) ? h * 1 : w, rh = (rot % 180) ? w : h;
    quad(m, [cx - rw / 2, cy, cz - rh / 2], [cx + rw / 2, cy, cz - rh / 2], [cx + rw / 2, cy, cz + rh / 2], [cx - rw / 2, cy, cz + rh / 2], uv);
    return;
  }
  const uv = [[sl.u1, sl.v1], [sl.u0, sl.v1], [sl.u0, sl.v0], [sl.u1, sl.v0]];
  const y0 = cy - h / 2, y1 = cy + h / 2;
  if (face === '-z') quad(m, [cx - w / 2, y0, cz], [cx + w / 2, y0, cz], [cx + w / 2, y1, cz], [cx - w / 2, y1, cz], uv);
  if (face === '+z') quad(m, [cx + w / 2, y0, cz], [cx - w / 2, y0, cz], [cx - w / 2, y1, cz], [cx + w / 2, y1, cz], uv);
  if (face === '-x') quad(m, [cx, y0, cz + w / 2], [cx, y0, cz - w / 2], [cx, y1, cz - w / 2], [cx, y1, cz + w / 2], uv);
  if (face === '+x') quad(m, [cx, y0, cz - w / 2], [cx, y0, cz + w / 2], [cx, y1, cz + w / 2], [cx, y1, cz - w / 2], uv);
}

function barkTex(name, seed, S) {   // vertical ridged plates with deep dark furrows
  const r = rng(seed), t = new Tex(name, S);
  const ridge = fbm(r, S, [[3, 1], [8, 0.55]]);
  const fine = fbm(rng(seed ^ 3), S, [[24, 1], [96, 0.5]]);
  t.fill([0.36, 0.28, 0.2]);
  t.each((x, y, i) => {
    const rv = 1 - Math.abs(2 * ridge((x * 3) % S, (y * 0.5 + fine(x, y) * 60) % S) - 1);   // vertical furrows
    t.tint(i, 0.6 + rv * 0.6 + (fine(x, y) - 0.5) * 0.25);
    t.tintC(i, 1 + rv * 0.05, 1, 1 - rv * 0.06);
    t.h[i] = rv;
  });
  return finish(t, seed, { cavDark: 0.42, cavK: 2 });
}
function leavesTex(name, seed, S) {   // canopy: leaf clumps over dark interior, a few bright tips
  const r = rng(seed), t = new Tex(name, S), k = S / 256;
  const clump = fbm(r, S, [[8, 1], [20, 0.6], [64, 0.35]]);
  const leafW = worley(rng(seed ^ 5), S, 64);
  t.fill([0.18, 0.3, 0.12]);
  t.each((x, y, i) => {
    const c = clump(x, y);
    t.tint(i, 0.55 + c * 0.9);                                       // strong light/shade clumping
    const lw = leafW(x, y);
    if (lw.d1 < 2.2 * k) { t.tint(i, 0.9 + lw.id * 0.45); t.tintC(i, 1 + lw.id * 0.12, 1 + lw.id * 0.06, 1); }
    t.h[i] = c * 0.7 + (lw.d1 < 2.2 * k ? 0.25 : 0);
  });
  return finish(t, seed, { cavDark: 0.4, cavK: 1.8, edgeLight: 0.2 });
}

// the decal atlas: 4x4 cells of stains and worn paint, alpha-blended over the tiling base
const DECAL = { OIL: [0, 0], LEAK: [1, 0], SCUFF: [2, 0], RING: [3, 0], ONE: [0, 1], TWO: [1, 1], CHEV: [2, 1], LINE: [3, 1] };
function decalTex(name) {
  const S = 1024, t = new Tex(name, S); t.a = new Float64Array(S * S); t.noAux = true;
  const r = rng(4242), C = 256;
  const wear = fbm(r, S, [[64, 1], [192, 0.7]]);
  const paint = [0.88, 0.87, 0.8], yellow = [0.93, 0.68, 0.12];
  const put = (gx, gy, c, a) => { const i = gy * S + gx; if (a <= t.a[i]) return;
    t.rgb[i * 3] = c[0]; t.rgb[i * 3 + 1] = c[1]; t.rgb[i * 3 + 2] = c[2]; t.a[i] = a; };
  const worn = (gx, gy, a) => { const w = wear(gx, gy); return w < 0.28 ? 0 : a * (0.5 + 0.5 * Math.min(1, (w - 0.28) / 0.4)); };
  const inCell = (cx, cy, fn) => { for (let y = 6; y < C - 6; y++) for (let x = 6; x < C - 6; x++) fn(x, y, cx * C + x, cy * C + y); };
  inCell(...DECAL.OIL, (x, y, gx, gy) => {                          // oil blob: ragged edge, darker core
    const rr = Math.hypot(x - 128, y - 128) / 108 + (wear((gx * 3) % S, (gy * 3) % S) - 0.5) * 0.55;
    if (rr < 1) put(gx, gy, [0.05, 0.045, 0.04], Math.min(0.85, (1 - rr) * 2.0));
  });
  { const streaks = []; for (let q = 0; q < 6; q++) streaks.push([20 + r() * 216, (2 + r() * 4), (90 + r() * 150)]);
    inCell(...DECAL.LEAK, (x, y, gx, gy) => {
      for (const [sx, sw, sl] of streaks) { const d = Math.abs(x - sx); if (d > sw || y > sl) continue;
        put(gx, gy, [0.16, 0.14, 0.12], (1 - y / sl) * (1 - d / sw) * 0.55 * (0.6 + wear(gx, gy) * 0.4)); } }); }
  inCell(...DECAL.SCUFF, (x, y, gx, gy) => {                        // directional scuff smudge
    const ry = (y - 128) / 70, rx = (x - 128) / 116;
    if (rx * rx + ry * ry < 1 && wear((gx * 2) % S, gy) > 0.45) put(gx, gy, [0.1, 0.1, 0.11], (1 - rx * rx - ry * ry) * 0.4);
  });
  inCell(...DECAL.RING, (x, y, gx, gy) => {                         // painted ring + cardinal ticks
    const rr = Math.hypot(x - 128, y - 128);
    if (Math.abs(rr - 102) < 9) put(gx, gy, paint, worn(gx, gy, 0.9));
    if (rr < 78 && rr > 70 && (Math.abs(x - 128) < 5 || Math.abs(y - 128) < 5)) put(gx, gy, paint, worn(gx, gy, 0.85));
  });
  const rect = (cell, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
    put(cell[0] * C + x, cell[1] * C + y, c, worn(cell[0] * C + x, cell[1] * C + y, 0.92)); };
  rect(DECAL.ONE, 112, 40, 148, 216, paint); rect(DECAL.ONE, 78, 58, 112, 88, paint); rect(DECAL.ONE, 74, 192, 186, 216, paint);
  rect(DECAL.TWO, 70, 40, 186, 68, paint); rect(DECAL.TWO, 158, 68, 186, 118, paint);
  rect(DECAL.TWO, 70, 112, 186, 140, paint); rect(DECAL.TWO, 70, 140, 98, 192, paint); rect(DECAL.TWO, 70, 192, 186, 218, paint);
  inCell(...DECAL.CHEV, (x, y, gx, gy) => {                         // two chevrons, apex up
    for (const yb of [104, 176]) { const d = Math.abs(y - (yb - Math.abs(x - 128) * 0.55));
      if (d < 15 && x > 30 && x < 226) put(gx, gy, yellow, worn(gx, gy, 0.9)); }
  });
  rect(DECAL.LINE, 14, 112, 242, 146, paint);
  return t;
}

// ---------------------------------------------------------------- geometry builder ----
const MATS = [];    // material specs, resolved into glTF at write time
const TEXS = {};    // name -> Tex
function useTex(t) { TEXS[t.name] = t; return t.name; }
function mat(name, opts = {}) {
  MATS.push({ name, base: opts.base || [1, 1, 1], metal: opts.metal ?? 0.05, rough: opts.rough ?? 0.92,
    tex: opts.tex || null, nrm: opts.nrm ?? 1.0, glow: opts.glow || null, scale: opts.scale || 4,
    blend: !!opts.blend, mask: !!opts.mask, ds: !!opts.ds, nocollide: !!opts.nocollide });
  return MATS.length - 1;
}

const prims = [];   // per-material: { pos:[], nrm:[], uv:[], idx:[] }
function prim(m) { return prims[m] || (prims[m] = { pos: [], nrm: [], uv: [], idx: [] }); }
// The a→b→c→d labels below run clockwise seen from outside, so both emitters flip:
// negated normal, reversed winding. (Caught by the engine probe — with front faces
// pointing inward, surfaceTopUnder raycasts landed on every slab's underside.)
// UVs: planar projection along the face's dominant axis, in world units / material scale —
// or explicit per-vertex UVs (unitUV) for objects whose texture must land on their edges.
// Signed per-face axes: (tangent x bitangent) points along the OUTWARD normal on every face,
// and v runs down the wall in world space. The old mapping reused one axis pair for opposite
// faces — mirrored tangent basis on half of them, so normal maps rendered inside-out (bumps
// read as dents), and v pointed up, so rust streaks and weep stains climbed the walls.
function _uvFor(n, s, v) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return n[1] >= 0 ? [v[0] / s, -v[2] / s] : [v[0] / s, v[2] / s];
  if (ax >= az) return n[0] >= 0 ? [v[2] / s, -v[1] / s] : [-v[2] / s, -v[1] / s];
  return n[2] >= 0 ? [-v[0] / s, -v[1] / s] : [v[0] / s, -v[1] / s];
}
const PATCHES = [];   // every emitted face: a lightmap-atlas cell candidate
function _quadRaw(m, a, b, c, d, unitUV) {
  const p = prim(m), s = MATS[m].scale;
  if (!MATS[m].blend && !MATS[m].mask && !MATS[m].glow) PATCHES.push({ m, base: p.pos.length / 3, n: 4 });
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  let n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
  const base = p.pos.length / 3;
  const uvs = unitUV || [a, b, c, d].map(vtx => _uvFor(n, s, vtx));
  [a, b, c, d].forEach((vtx, k) => { p.pos.push(...vtx); p.nrm.push(...n); p.uv.push(uvs[k][0], uvs[k][1]); });
  p.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
// Big faces subdivide into <=SUBD-unit patches. That is what makes baked vertex lighting
// possible: a 76-unit wall as one quad has nowhere to store a shadow gradient.
const SUBD = 3;
function quad(m, a, b, c, d, unitUV) {
  if (MATS[m].blend || MATS[m].mask) return _quadRaw(m, a, b, c, d, unitUV);
  const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
  const nx = Math.max(1, Math.ceil(w / SUBD)), ny = Math.max(1, Math.ceil(h / SUBD));
  if (nx === 1 && ny === 1) return _quadRaw(m, a, b, c, d, unitUV);
  const lerp = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t];
  const at = (i, j) => lerp(lerp(a, b, i / nx), lerp(d, c, i / nx), j / ny);
  const uvAt = unitUV ? (i, j) => { const l2 = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
    return l2(l2(unitUV[0], unitUV[1], i / nx), l2(unitUV[3], unitUV[2], i / nx), j / ny); } : null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    _quadRaw(m, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1),
      uvAt ? [uvAt(i, j), uvAt(i + 1, j), uvAt(i + 1, j + 1), uvAt(i, j + 1)] : null);
}
function tri(m, a, b, c) {
  const p = prim(m), s = MATS[m].scale;
  if (!MATS[m].blend && !MATS[m].mask && !MATS[m].glow) PATCHES.push({ m, base: p.pos.length / 3, n: 3 });
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
  const base = p.pos.length / 3;
  [a, b, c].forEach(vtx => { p.pos.push(...vtx); p.nrm.push(...n); const q = _uvFor(n, s, vtx); p.uv.push(q[0], q[1]); });
  p.idx.push(base, base + 2, base + 1);
}
// build 1108: how far a decorative surface must stand off the structure behind it. Two coplanar
// front-facing surfaces have identical depth, so the GPU picks a winner per pixel and the choice
// flips as the camera moves — the "overlapping mesh that flashes". Decals already used 0.02-0.03;
// this is the same rule for banded geometry, with more margin because bands sit on 79-unit walls
// seen from across the arena, where depth precision is coarsest.
const PROUD = 0.05;
const SOLIDS = [];   // analytic occluders for the AO bake — every box and ramp lands here
// build 1111: local light sources for the bake. The radiance bake integrates SKY visibility, so
// anything under a roof integrates to almost nothing — a room would bake black. Interiors register
// their fixtures here and the baker adds each one's direct contribution, shadow-tested, so a lamp
// actually lights its room and casts the doorway's light across the floor outside.
const LIGHTS = [];
// Range is capped at the ray tracer's search distance: past that the shadow test cannot see an
// occluder, so a longer-reaching light would leak through walls.
function addLight(x, y, z, col, range, power = 1) { LIGHTS.push({ x, y, z, c: col, r: Math.min(range, 9.5), p: power }); }
const UNIT = [[0, 1], [1, 1], [1, 0], [0, 0]];   // v=1 at the face's base: image bottom sits at the bottom
function box(m, x0, y0, z0, x1, y1, z1, unit) {
  SOLIDS.push([x0, y0, z0, x1, y1, z1]);
  const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1];
  const E = [x0, y1, z0], F = [x1, y1, z0], G = [x1, y1, z1], H = [x0, y1, z1];
  const uu = unit ? UNIT : null;
  quad(m, E, F, G, H, uu);            // top  (+y)
  quad(m, D, C, B, A, uu);            // bottom (-y)
  quad(m, A, B, F, E, uu);            // north (-z)
  quad(m, C, D, H, G, uu);            // south (+z)
  quad(m, D, A, E, H, uu);            // west (-x)
  quad(m, B, C, G, F, uu);            // east (+x)
}
function cbox(m, cx, cy, cz, sx, sy, sz, unit) { box(m, cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, unit); }

// solid ramp: the top surface runs along `axis` ('x'|'z') from height yAtMin at the axis-min end
// to yAtMax at the axis-max end; the underside is flat at yBase. The corner labels copy box()'s
// E/F/G/H pattern exactly, so the winding is correct no matter which end is high — the first
// version derived corners from a climb direction, which mirrored the quads (inverting their
// faces) for one of the two directions. The engine probe caught it: raycasts fell straight
// through half the ramp tops.
//
// build 1113: pass `thick` and the underside runs PARALLEL to the top instead of flat at yBase —
// a stair flight as a slab rather than a solid wedge. That is not cosmetic. A wedge's underside
// sits at yBase for the whole run, so every column it touches is solid from yBase up: a flight
// beside you (the other half of a switchback) becomes a wall along its entire length. As a slab
// it only occupies its own thickness, so the space under and beside a flight stays open — which
// is what lets a bot climb the lane next to it.
function ramp(m, x0, z0, x1, z1, yBase, yAtMin, yAtMax, axis, thick) {
  let E, F, G, H;   // top corners at (x0,z0) (x1,z0) (x1,z1) (x0,z1)
  if (axis === 'x') { E = [x0, yAtMin, z0]; F = [x1, yAtMax, z0]; G = [x1, yAtMax, z1]; H = [x0, yAtMin, z1]; }
  else              { E = [x0, yAtMin, z0]; F = [x1, yAtMin, z0]; G = [x1, yAtMax, z1]; H = [x0, yAtMax, z1]; }
  const bot = (c) => thick ? [c[0], c[1] - thick, c[2]] : [c[0], yBase, c[2]];
  const A = bot(E), B = bot(F), C = bot(G), D = bot(H);
  for (let q = 0; q < 4; q++) {   // AO occluder: the wedge as four rising slabs
    const t0 = q / 4, t1 = (q + 1) / 4;
    const hA = yAtMin + (yAtMax - yAtMin) * t0, hB = yAtMin + (yAtMax - yAtMin) * t1;
    const lo = thick ? Math.min(hA, hB) - thick : Math.min(yBase, hA, hB), hi = Math.max(hA, hB);
    if (axis === 'x') SOLIDS.push([x0 + (x1 - x0) * t0, lo, z0, x0 + (x1 - x0) * t1, hi, z1]);
    else SOLIDS.push([x0, lo, z0 + (z1 - z0) * t0, x1, hi, z0 + (z1 - z0) * t1]);
  }
  quad(m, E, F, G, H);   // sloping top
  quad(m, D, C, B, A);   // underside
  quad(m, A, B, F, E);   // z0 side (zero-area where top meets base — harmless)
  quad(m, C, D, H, G);   // z1 side
  quad(m, D, A, E, H);   // x0 end
  quad(m, B, C, G, F);   // x1 end
}

// a box with its top edges chamfered — the bevel highlight is most of what reads as
// "modelled, not blocked out" on props like crates, posts and cover
function bevelBox(m, x0, y0, z0, x1, y1, z1, c, unit) {
  SOLIDS.push([x0, y0, z0, x1, y1, z1]);
  const yt = y1 - c, uu = unit ? UNIT : null;
  const E = [x0 + c, y1, z0 + c], F = [x1 - c, y1, z0 + c], G = [x1 - c, y1, z1 - c], H = [x0 + c, y1, z1 - c];
  quad(m, E, F, G, H, uu);                                                        // inset top
  quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], uu);            // bottom
  quad(m, [x0, y0, z0], [x1, y0, z0], [x1, yt, z0], [x0, yt, z0], uu);            // sides stop at yt
  quad(m, [x1, y0, z1], [x0, y0, z1], [x0, yt, z1], [x1, yt, z1], uu);
  quad(m, [x0, y0, z1], [x0, y0, z0], [x0, yt, z0], [x0, yt, z1], uu);
  quad(m, [x1, y0, z0], [x1, y0, z1], [x1, yt, z1], [x1, yt, z0], uu);
  quad(m, [x0, yt, z0], [x1, yt, z0], F, E, uu);                                  // four bevels
  quad(m, [x1, yt, z1], [x0, yt, z1], H, G, uu);
  quad(m, [x0, yt, z1], [x0, yt, z0], E, H, uu);
  quad(m, [x1, yt, z0], [x1, yt, z1], G, F, uu);
}
function bevelCbox(m, cx, cy, cz, sx, sy, sz, unit) { bevelBox(m, cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, Math.min(sx, sy, sz) * 0.06, unit); }
// vertical cylinder (column) and a horizontal pipe run along x or z
function cyl(m, cx, cz, y0, y1, r, segs = 14, rTop = null) {
  const r1 = rTop == null ? r : rTop;
  SOLIDS.push([cx - r, y0, cz - r, cx + r, y1, cz + r]);
  const pt = (q, y, rr) => [cx + Math.cos(q / segs * Math.PI * 2) * rr, y, cz + Math.sin(q / segs * Math.PI * 2) * rr];
  for (let q = 0; q < segs; q++) {
    _quadRaw(m, pt(q, y0, r), pt(q + 1, y0, r), pt(q + 1, y1, r1), pt(q, y1, r1));
    if (r1 > 0.01) tri(m, [cx, y1, cz], pt(q, y1, r1), pt(q + 1, y1, r1));
    tri(m, [cx, y0, cz], pt(q + 1, y0, r), pt(q, y0, r));
  }
}
function pipe(m, axis, a0, a1, h, off, r, segs = 10) {
  if (axis === 'x') SOLIDS.push([a0, h - r, off - r, a1, h + r, off + r]);
  else SOLIDS.push([off - r, h - r, a0, off + r, h + r, a1]);
  const pt = (q, a) => { const cq = Math.cos(q / segs * Math.PI * 2) * r, sq = Math.sin(q / segs * Math.PI * 2) * r;
    return axis === 'x' ? [a, h + sq, off + cq] : [off + cq, h + sq, a]; };
  for (let q = 0; q < segs; q++) {
    if (axis === 'x') _quadRaw(m, pt(q, a0), pt(q, a1), pt(q + 1, a1), pt(q + 1, a0));
    else _quadRaw(m, pt(q, a1), pt(q, a0), pt(q + 1, a0), pt(q + 1, a1));
  }
}

// a wall with openings — doorways and windows built from segments, lintels and sills.
// axis 'x': runs a0..a1 with thickness o0..o1 in z (and vice versa). openings: {at, w, h, sill}.
// This is what turns extrusions into buildings: anything with an opening has an inside.
function wallRun(m, axis, a0, a1, o0, o1, y0, y1, openings = []) {
  const ops = [...openings].sort((p2, q2) => p2.at - q2.at);
  const seg = (s0, s1, yy0, yy1) => { if (s1 - s0 < 0.01 || yy1 - yy0 < 0.01) return;
    axis === 'x' ? box(m, s0, yy0, o0, s1, yy1, o1) : box(m, o0, yy0, s0, o1, yy1, s1); };
  let cur = a0;
  for (const op of ops) {
    // build 1113: an opening never overruns its wall. Doorways are wide now (see BOT_LANE), and a
    // wide one on a short wall used to run past the end — seg() then dropped the inverted piece and
    // the wall silently lost its pier. Clamp inside, shrink to fit, and leave the wall solid rather
    // than emit nonsense if there is genuinely no room.
    const PIER = 0.35, w = Math.min(op.w, (a1 - a0) - PIER * 2);
    if (w < 0.4) continue;
    const at = Math.max(a0 + PIER + w / 2, Math.min(a1 - PIER - w / 2, op.at));
    const w0 = at - w / 2, w1 = at + w / 2, sill = op.sill || 0;
    seg(cur, w0, y0, y1);
    if (sill > 0) seg(w0, w1, y0, y0 + sill);
    seg(w0, w1, y0 + sill + op.h, y1);
    cur = w1;
  }
  seg(cur, a1, y0, y1);
}

// ---- build 1111: multi-room interiors -------------------------------------------------
// A walled block split into rooms by a seeded binary partition. Every leaf room is reachable:
// each split wall gets a doorway, and the outer shell gets an entrance on the requested side, so
// the whole interior is one connected space with no sealed pockets. Rooms carry a ceiling fixture
// (emissive) plus a baked light, which is the half that makes an interior readable at all.
//
// Returns the leaf rooms as {x0,z0,x1,z1} so the caller can furnish them / reserve them.
// ---- build 1113: what the ENGINE's collider costs an opening ---------------------------
// An imported model becomes a grid of per-column boxes ~1 unit across (MGRID_CELL), and a column
// is solid for its WHOLE width the moment a triangle touches it. So every surface stands up to one
// cell proud of where it was modelled, and a face that lands exactly ON a cell boundary — which
// round-numbered architecture does constantly — costs the entire next cell. Measured on the
// generated buildings: a 0.45-thick wall collides 2.0 thick, and a 2.56-wide doorway leaves 1.0 of
// gap. An enemy resolves against those boxes with a 0.9 clearance radius and no escape hatch, so
// anything a bot must walk through needs BOT_LANE of modelled width before it is passable at all.
// This is why the build-1112 stairwell failed: not the slope, not the flights — the lanes were
// simply narrower than the engine's own arithmetic allows.
const GRID_PAD = 1.0, BOT_R = 0.9;
const BOT_LANE = 2 * GRID_PAD + 2 * BOT_R;   // 3.8: the narrowest opening a bot can pass at all
function roomBlock(mWall, mFloor, mTrim, x0, z0, x1, z1, y0, h, seed2, opts = {}) {
  const rr = rng(seed2), T = opts.wall || 0.45;
  // Doorways are openings, not doors: BOT_LANE plus a margin, or bots simply cannot enter the
  // building they are being lit and furnished for. (Before this they could not — probed.)
  const DOOR = opts.door || (BOT_LANE + 0.4), DOORH = opts.doorH || 2.9;
  const minRoom = opts.minRoom || 5.5;
  // ---- build 1112/1113: STOREYS. A stair bay is carved off one x edge and runs the full depth;
  // the rooms partition what's left, open to the bay across their whole edge. Every upper floor
  // plate and the roof omit the bay, so the shaft is open top to bottom and the flights inside it
  // are the way up — including onto the roof, which is why a multi-storey block needs no outside
  // ramp. Flights alternate lane and direction, so the climb switchbacks instead of running one
  // impossible 20-unit straight.
  const storeys = Math.max(1, opts.storeys || 1);
  // Each lane is half the bay and must clear BOT_LANE (3.8) on its own, so 9 — 4.5 a lane, which
  // leaves a 0.7-wide band of stable footing at the worst-case grid phase. 7 (build 1112) gave
  // 3.5 and the probe found bots shoved at all 31 sample points.
  const bayW = storeys > 1 ? (opts.bay || 9) : 0;
  // Which x edge holds the bay. The arena puts it on the courtyard side of BOTH side buildings, so
  // the mirrored pair reads the same from the middle of the map.
  const bayAtMin = opts.baySide !== '+x';
  const BX = (u) => bayAtMin ? x0 + u : x1 - u;               // bay-local (0 = outer edge) -> world x
  const xr = (u0, u1) => [Math.min(BX(u0), BX(u1)), Math.max(BX(u0), BX(u1))];
  const bx = BX(bayW);                                       // interior (room) area starts here
  const rmX = bayW ? [Math.min(bx, bayAtMin ? x1 : x0), Math.max(bx, bayAtMin ? x1 : x0)] : [x0, x1];
  // The floor plate reaches the shaft edge and the rooms start a nosing's width back from it, so the
  // plate's exposed edge and a partition wall's end are never the same plane — coplanar and both
  // facing into the shaft is exactly the flashing overlap build 1108 hunted down.
  const RB_LIP = 0.06;
  const rwX = bayW ? (bayAtMin ? [rmX[0] + RB_LIP, rmX[1]] : [rmX[0], rmX[1] - RB_LIP]) : rmX;
  const perStorey = [];
  for (let k = 0; k < storeys; k++) {
    const yk = y0 + k * h;
    // walls stand ON their floor (the ground slab, or this storey's plate). Starting them at the
    // slab's BOTTOM left every wall's underside coplanar with the slab's underside, both facing down
    // into the storey below — invisible on the ground floor (the arena slab buries it) and a
    // flashing overlap on every floor above it.
    const rooms = _rbStorey(mWall, mFloor, mTrim, rwX[0], z0, rwX[1], z1, yk, h, (seed2 * 31 + k * 7) | 0,
      opts, T, DOOR, DOORH, minRoom, yk + (k ? 0.2 : 0.12));
    perStorey.push(rooms);
    // this storey's plate — exactly the rooms area, so it never reaches over the shaft (a plate
    // that overhung the bay by the wall thickness put the guard rail and the top flight inside it)
    if (k > 0) box(mFloor, rmX[0], yk, z0, rmX[1], yk + 0.2, z1);
    if (bayW) _rbFlight(mFloor, mTrim, xr, bayW, z0, z1, yk, h, k, storeys);
  }
  const leaves = perStorey[0];
  // the stair centrelines, for the engine probe: one per flight plus the crossover on each landing
  leaves.stairScans = bayW ? _rbStairScans(BX, bayW, z0, z1, storeys) : [];
  // ---- shell + roof, spanning every storey ----
  const H = h * storeys;
  // An entrance in the stair bay's own face must open onto the bay's GROUND landing, not into the
  // flank of the first flight: walk in at the middle of that face and the stairs are already 1.9
  // up, so the doorway's own lintel lands in the bot's chest.
  const entAt = (bayW && (opts.entrance || '-x') === (bayAtMin ? '-x' : '+x')) ? z0 + RB_LAND * 0.75 : null;
  _rbShell(mWall, x0, z0, x1, z1, y0, H, h, storeys, T, DOOR, opts, entAt);
  box(mFloor, x0, y0, z0, x1, y0 + 0.12, z1);                          // ground floor (under the bay too)
  if (bayW) {                                                          // roof: everything but the shaft
    const inner = xr(bayW - T, bayW - T), edge = xr(0, 0);
    const rx0 = Math.min(inner[0], edge[0]), rx1 = Math.max(inner[0], edge[0]);
    box(mWall, bayAtMin ? inner[0] : x0 - T, y0 + H, z0 - T, bayAtMin ? x1 + T : inner[0], y0 + H + 0.35, z1 + T);
    box(mWall, rx0 - (bayAtMin ? T : 0), y0 + H, z0 - T, rx1 + (bayAtMin ? 0 : T), y0 + H + 0.35, z0);
    box(mWall, rx0 - (bayAtMin ? T : 0), y0 + H, z1, rx1 + (bayAtMin ? 0 : T), y0 + H + 0.35, z1 + T);
    box(mWall, bayAtMin ? x0 - T : x1, y0 + H, z0, bayAtMin ? x0 : x1 + T, y0 + H + 0.35, z1);
  } else box(mWall, x0 - T, y0 + H, z0 - T, x1 + T, y0 + H + 0.35, z1 + T);
  return leaves;
}
// One flight of the switchback plus the LANDING it arrives on. The landing is what makes the thing
// work: it spans the whole bay at the flight's top height, so a bot crosses to the other lane on
// flat ground (where the build-1094 step exemption applies) instead of trying to side-step between
// two converging slopes, and it is also how you step off onto the storey's floor plate or the roof.
// Flights are SLABS (see ramp()'s `thick`): a solid wedge in the next lane walls in the lane you
// are climbing, which is the other half of why build 1112's stairs were unwalkable.
// A landing is deep enough that its half away from the end wall is still clear of that wall's
// quantised collider face by a bot's radius — otherwise the crossover happens in the one strip of
// the stairwell a bot can never stand in, which is exactly how build 1112's shaft failed.
const RB_LAND = 2 * (GRID_PAD + BOT_R), RB_SLAB = 0.35;
function _rbFlight(mFloor, mTrim, xr, bayW, z0, z1, yk, h, k, storeys) {
  const lane = k % 2, up = lane === 0;
  const lx = xr(lane * bayW / 2, (lane + 1) * bayW / 2);     // the two lanes meet, so no slot to fall in
  const fz0 = z0 + RB_LAND, fz1 = z1 - RB_LAND;              // the sloped run, between the two landings
  const yFoot = k === 0 ? yk + 0.12 : yk, yTop = yk + h;     // flight 0 starts ON the ground-floor slab
  ramp(mFloor, lx[0], fz0, lx[1], fz1, 0, up ? yFoot : yTop, up ? yTop : yFoot, 'z', RB_SLAB);
  const bw = xr(0, bayW);
  box(mFloor, bw[0], yTop - RB_SLAB, up ? fz1 : z0, bw[1], yTop, up ? z1 : fz0);
  // Guard rail along the shaft edge, standing ON the deck it guards (the storey's plate, or the roof
  // for the last flight) — a rail whose base hung at deck level instead shared an underside plane
  // with the plate: a z-fight. It stops where THIS flight's landing meets the deck, or it would wall
  // off the one place the climb is supposed to deliver you.
  const deck = k === storeys - 1 ? 0.35 : 0.2, rail = xr(bayW, bayW + 0.12);
  box(mTrim, rail[0], yTop + deck, up ? z0 : fz0, rail[1], yTop + deck + 1.0, up ? fz1 : z1);
}
// The centreline of every flight and every landing crossover — the manifest the engine probe walks
// to prove a bot can actually climb what was generated.
function _rbStairScans(BX, bayW, z0, z1, storeys) {
  const out = [], fz0 = z0 + RB_LAND, fz1 = z1 - RB_LAND;
  const cl = [BX(bayW * 0.25), BX(bayW * 0.75)];
  for (let k = 0; k < storeys; k++) {
    const up = k % 2 === 0, c = cl[k % 2];
    out.push([c, up ? fz0 : fz1, c, up ? fz1 : fz0]);                    // the flight itself
    // the crossover runs down the middle of the landing's USABLE half — its far half is inside the
    // end wall's quantised collider, where nothing can stand
    const lz = up ? (fz1 + z1 - GRID_PAD - BOT_R) / 2 : (fz0 + z0 + GRID_PAD + BOT_R) / 2;
    out.push([cl[0], lz, cl[1], lz]);                                    // crossing to the next lane
  }
  return out;
}
// One storey's rooms: the partition + its lights. Split out of roomBlock so every storey of a
// tower gets its own seeded floor plan instead of the same one stacked.
function _rbStorey(mWall, mFloor, mTrim, x0, z0, x1, z1, y0, h, seed2, opts, T, DOOR, DOORH, minRoom, yw) {
  const rr = rng(seed2);
  const leaves = [];
  (function split(r, depth) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const canX = w >= minRoom * 2 + T, canZ = d >= minRoom * 2 + T;
    // The early-out only applies BELOW the top level: a block big enough to divide always divides,
    // otherwise "multi-room building" quietly rolls a single shed 15% of the time.
    if (depth >= (opts.depth || 2) || (!canX && !canZ) || (depth > 0 && rr() < 0.15)) { leaves.push(r); return; }
    const alongX = canX && (!canZ || w >= d);
    const lo = (alongX ? r.x0 : r.z0) + minRoom, hi = (alongX ? r.x1 : r.z1) - minRoom;
    const cut = lo + rr() * (hi - lo);
    if (alongX) {
      wallRun(mWall, 'z', r.z0, r.z1, cut - T / 2, cut + T / 2, yw ?? y0, y0 + h,
        [{ at: r.z0 + (r.z1 - r.z0) * (0.3 + rr() * 0.4), w: DOOR, h: DOORH }]);
      split({ x0: r.x0, z0: r.z0, x1: cut - T / 2, z1: r.z1 }, depth + 1);
      split({ x0: cut + T / 2, z0: r.z0, x1: r.x1, z1: r.z1 }, depth + 1);
    } else {
      wallRun(mWall, 'x', r.x0, r.x1, cut - T / 2, cut + T / 2, yw ?? y0, y0 + h,
        [{ at: r.x0 + (r.x1 - r.x0) * (0.3 + rr() * 0.4), w: DOOR, h: DOORH }]);
      split({ x0: r.x0, z0: r.z0, x1: r.x1, z1: cut - T / 2 }, depth + 1);
      split({ x0: r.x0, z0: cut + T / 2, x1: r.x1, z1: r.z1 }, depth + 1);
    }
  })({ x0, z0, x1, z1 }, 0);

  // ---- per-room ceiling fixture + the baked light that goes with it ----
  const lc = opts.lightCol || [1, 0.93, 0.78];
  for (const r of leaves) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, ly = y0 + h - 0.3;
    box(mTrim, cx - 0.5, ly, cz - 0.5, cx + 0.5, ly + 0.1, cz + 0.5);     // the visible fixture
    // Power is high because this is the ONLY light a sealed room gets: the sun is blocked by the
    // roof (real shadow map) and sky visibility integrates to nothing indoors.
    addLight(cx, ly - 0.25, cz, lc, Math.max(6, Math.hypot(r.x1 - r.x0, r.z1 - r.z0) * 0.9), opts.lightPow || 2.6);
  }
  return leaves;
}
// The outer shell: an entrance on the requested face at ground level, windows everywhere else on
// every storey — so an upper floor reads as inhabited from outside, and gives defenders firing
// positions rather than a blank box.
function _rbShell(mWall, x0, z0, x1, z1, y0, H, h, storeys, T, DOOR, opts, entAt) {
  const ent = opts.entrance || '-x';
  // The entrance is the widest opening in the block and the only way in, so it gets DOOR plus a
  // margin — and a lintel high enough to clear a bot standing on whatever is behind it.
  const doorOn = (a0, a1) => [{ at: entAt != null ? entAt : (a0 + a1) / 2, w: DOOR + 1.0, h: 3.4 }];
  for (let k = 0; k < storeys; k++) {
    const yk = y0 + k * h, ground = k === 0;
    const W2 = (a0, a1) => [{ at: a0 + (a1 - a0) * 0.28, w: 1.8, h: 1.4, sill: 1.5 },
                            { at: a0 + (a1 - a0) * 0.72, w: 1.8, h: 1.4, sill: 1.5 }];
    wallRun(mWall, 'x', x0, x1, z0 - T, z0, yk, yk + h, (ground && ent === '-z') ? doorOn(x0, x1) : W2(x0, x1));
    wallRun(mWall, 'x', x0, x1, z1, z1 + T, yk, yk + h, (ground && ent === '+z') ? doorOn(x0, x1) : W2(x0, x1));
    wallRun(mWall, 'z', z0, z1, x0 - T, x0, yk, yk + h, (ground && ent === '-x') ? doorOn(z0, z1) : W2(z0, z1));
    wallRun(mWall, 'z', z0, z1, x1, x1 + T, yk, yk + h, (ground && ent === '+x') ? doorOn(z0, z1) : W2(z0, z1));
  }
}

// an organic boulder: an icosphere (subdivided once, 80 faces) with deterministic per-vertex
// radial displacement, squashed vertically and sunk into the ground — the first geometry here
// with no right angles anywhere
function boulder(m, cx, cy, cz, r, seed2) {
  const t0 = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t0, 0], [1, t0, 0], [-1, -t0, 0], [1, -t0, 0], [0, -1, t0], [0, 1, t0], [0, -1, -t0], [0, 1, -t0], [t0, 0, -1], [t0, 0, 1], [-t0, 0, -1], [-t0, 0, 1]]
    .map(v => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; });
  const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const nv = V.slice(), mid = {};
  const gm = (a, b) => { const key = a < b ? a + '_' + b : b + '_' + a; if (mid[key] != null) return mid[key];
    const q = [(nv[a][0] + nv[b][0]) / 2, (nv[a][1] + nv[b][1]) / 2, (nv[a][2] + nv[b][2]) / 2]; const l = Math.hypot(...q);
    nv.push([q[0] / l, q[1] / l, q[2] / l]); mid[key] = nv.length - 1; return mid[key]; };
  const nf = [];
  for (const [a, b, c] of F) { const ab = gm(a, b), bc = gm(b, c), ca = gm(c, a);
    nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  const bump = nv.map(v => 0.74 + hash2(v[0] * 7.13 + v[2] * 3.7 + seed2, v[1] * 5.1 + seed2) * 0.5);
  const P = nv.map((v, qi) => [cx + v[0] * r * bump[qi] * 1.15, cy + v[1] * r * bump[qi] * 0.8, cz + v[2] * r * bump[qi] * 1.05]);
  for (const [a, b, c] of nf) tri(m, P[a], P[c], P[b]);
  SOLIDS.push([cx - r, cy - r * 0.8, cz - r, cx + r, cy + r * 0.8, cz + r]);
}

// heightfield ground: a triangle grid whose height comes from hFn(x, z). Since build 1092
// clipped-triangle rasterisation, sloped ground colliders are exact — a level can finally
// stand on rolling terrain instead of a slab.
function terrainGround(m, x0, z0, x1, z1, cell, hFn) {
  for (let z = z0; z < z1 - 0.01; z += cell) for (let x = x0; x < x1 - 0.01; x += cell) {
    const x2 = Math.min(x + cell, x1), z2 = Math.min(z + cell, z1);
    const A = [x, hFn(x, z), z], B = [x2, hFn(x2, z), z], C = [x2, hFn(x2, z2), z2], D = [x, hFn(x, z2), z2];
    tri(m, A, B, C); tri(m, A, C, D);   // this order faces +y through tri()'s negated-cross convention
  }
}

// ---- prop vocabulary -------------------------------------------------------------------
// Composed from the primitives so every prop gets colliders, AO and textures for free.
function tree(mBark, mLeaf, cx, cz, y, seed2, big = 1) {
  const rr = rng(seed2);
  const h = (4.2 + rr() * 1.8) * big, tr = (0.24 + rr() * 0.1) * big;
  cyl(mBark, cx, cz, y, y + h * 0.6, tr, 8, tr * 0.5);
  const n = 3 + (rr() * 2 | 0);
  for (let q = 0; q < n; q++) {
    const a = rr() * Math.PI * 2, d = rr() * 1.1 * big;
    boulder(mLeaf, cx + Math.cos(a) * d, y + h * 0.68 + rr() * h * 0.28, cz + Math.sin(a) * d,
      (1.0 + rr() * 0.6) * big, seed2 * 7 + q);
  }
}
function conifer(mBark, mLeaf, cx, cz, y, seed2, big = 1) {
  const rr = rng(seed2);
  const h = (5 + rr() * 2) * big;
  cyl(mBark, cx, cz, y, y + h * 0.32, 0.2 * big, 8, 0.14 * big);
  for (let q = 0; q < 3; q++) {                                      // stacked frustums
    const b0 = y + h * (0.24 + q * 0.24), b1 = y + h * (0.52 + q * 0.24);
    cyl(mLeaf, cx, cz, b0, b1, (1.5 - q * 0.42) * big, 9, (0.6 - q * 0.22) * big);
  }
  cyl(mLeaf, cx, cz, y + h * 0.96, y + h * 1.12, 0.28 * big, 7, 0.02);
}
function deadTree(mBark, cx, cz, y, seed2) {
  const rr = rng(seed2);
  const h = 3.6 + rr() * 2;
  let px = cx, pz = cz;
  for (let q = 0; q < 3; q++) {                                      // crooked, tapering trunk
    const y0 = y + h * q / 3, y1 = y + h * (q + 1) / 3;
    cyl(mBark, px, pz, y0, y1 + 0.05, 0.26 - q * 0.07, 7, 0.19 - q * 0.06);
    px += (rr() - 0.5) * 0.5; pz += (rr() - 0.5) * 0.5;
  }
  for (const a of [rr() * 6.3, rr() * 6.3]) {                        // stub limbs
    cyl(mBark, px + Math.cos(a) * 0.5, pz + Math.sin(a) * 0.5, y + h * 0.62, y + h * 0.62 + 0.9 + rr(), 0.09, 6, 0.03);
  }
}
function fenceRun(mWood, axis, a0, a1, off, y) {
  const step = 2.2, n = Math.max(1, Math.round((a1 - a0) / step));
  for (let q = 0; q <= n; q++) {
    const a = a0 + (a1 - a0) * q / n;
    if (axis === 'x') bevelCbox(mWood, a, y + 0.62, off, 0.16, 1.24, 0.16);
    else bevelCbox(mWood, off, y + 0.62, a, 0.16, 1.24, 0.16);
  }
  for (const ry of [0.42, 0.98]) {
    if (axis === 'x') box(mWood, a0, y + ry, off - 0.05, a1, y + ry + 0.12, off + 0.05);
    else box(mWood, off - 0.05, y + ry, a0, off + 0.05, y + ry + 0.12, a1);
  }
}
function lamppost(mMetal, mGlow, cx, cz, y, h = 4.2, armX = 0.9) {
  cyl(mMetal, cx, cz, y, y + h, 0.1, 8, 0.07);
  bevelCbox(mMetal, cx, y + 0.14, cz, 0.5, 0.28, 0.5);
  box(mMetal, cx, y + h - 0.08, cz - 0.06, cx + armX, y + h, cz + 0.06);
  box(mGlow, cx + armX - 0.42, y + h - 0.32, cz - 0.14, cx + armX + 0.1, y + h - 0.06, cz + 0.14);
}
function container(mBody, mDoor, cx, cz, y, along = 'x') {
  const L = 6.1, W = 2.45, H = 2.6;
  const hx = along === 'x' ? L / 2 : W / 2, hz = along === 'x' ? W / 2 : L / 2;
  box(mBody, cx - hx, y, cz - hz, cx + hx, y + H, cz + hz);
  box(mBody, cx - hx - 0.06, y + H - 0.14, cz - hz - 0.06, cx + hx + 0.06, y + H, cz + hz + 0.06);   // roof lip
  box(mBody, cx - hx - 0.06, y, cz - hz - 0.06, cx + hx + 0.06, y + 0.18, cz + hz + 0.06);           // skid rail
  const dx = along === 'x' ? hx : 0, dz = along === 'x' ? 0 : hz;                                    // door end
  for (const so of [-0.55, 0.55]) {                                                                  // lock rods
    const px = cx + dx * 1.02 + (along === 'x' ? 0 : so), pz = cz + dz * 1.02 + (along === 'x' ? so : 0);
    cyl(mDoor, px, pz, y + 0.2, y + H - 0.2, 0.05, 6);
  }
  if (along === 'x') box(mDoor, cx + hx, y + 0.2, cz - hz + 0.2, cx + hx + 0.05, y + H - 0.2, cz + hz - 0.2);
  else box(mDoor, cx - hx + 0.2, y + 0.2, cz + hz, cx + hx - 0.2, y + H - 0.2, cz + hz + 0.05);
}

// ---- procedural grass & foliage --------------------------------------------------------
// Grass is CARDS: alpha-cutout blade silhouettes on crossed vertical quads. The material is
// doubleSided + MASK (no blend-sort artifacts) and nocollide (build 1093: the engine skips
// nocollide* meshes in every collider and neutralises their raycast), so a whole meadow costs
// a few hundred triangles and never blocks a player, a bot, a sight line, or a bullet.
// The painter draws each blade as a quadratic curve, tapering, darker at the root (a baked
// AO gradient — grass shades itself), with per-blade hue decorrelation and a scatter of dry
// straw blades so the field never reads as one repeated green.
function grassCardTex(name, seed, S, opts = {}) {
  const t = new Tex(name, S); t.a = new Float64Array(S * S); t.noAux = true;
  const rr = rng(seed);
  // pre-fill rgb with a LIT mid-green: mipmaps average transparent texels' colour into distant
  // blades, so a dark fill turns far-away tufts into black silhouettes
  for (let i = 0; i < S * S; i++) { t.rgb[i * 3] = 0.30; t.rgb[i * 3 + 1] = 0.44; t.rgb[i * 3 + 2] = 0.17; }
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y | 0) * S + (x | 0);
    if (a > t.a[i]) { t.a[i] = a; t.rgb[i * 3] = r; t.rgb[i * 3 + 1] = g; t.rgb[i * 3 + 2] = b; }
  };
  // sparse enough that the silhouette keeps gaps — a dense pass reads as a solid green rectangle
  const NB = (opts.tall ? 60 : 85) * (S / 512) | 0;
  for (let bl = 0; bl < NB; bl++) {
    const x0 = S * (0.04 + rr() * 0.92), h = S * ((opts.tall ? 0.5 : 0.38) + rr() * 0.5);
    const lean = (rr() - 0.5) * 1.15, curve = (rr() - 0.5) * 1.8;
    const w0 = S * (0.007 + rr() * 0.009);
    // per-blade colour: green family with real hue spread, 15% dry straw outliers
    let cr, cg, cb;
    if (rr() < 0.15) { const d = 0.8 + rr() * 0.3; cr = 0.52 * d; cg = 0.45 * d; cb = 0.20 * d; }
    else { const g = 0.30 + rr() * 0.26; cr = g * (0.42 + rr() * 0.22); cg = g; cb = g * (0.22 + rr() * 0.14); }
    const steps = (h * 1.4) | 0;
    for (let s2 = 0; s2 <= steps; s2++) {
      const tt = s2 / steps;
      const x = x0 + lean * S * 0.16 * tt + curve * S * 0.10 * tt * tt;
      const y = S - 1 - h * tt;
      const hw = Math.max(0.5, w0 * (1 - tt * 0.92));
      const shade = 0.55 + 0.45 * tt;                       // root-to-tip AO gradient
      for (let dx = -hw - 1; dx <= hw + 1; dx++) {
        const a = sstep(hw + 0.8, hw - 0.8, Math.abs(dx));  // soft edge; MASK cutoff hardens it
        if (a > 0.03) px(x + dx, y, cr * shade, cg * shade, cb * shade, a);
      }
    }
  }
  if (opts.flowers) {                                       // a sprinkle of flower heads on stems
    const NF = 12 * (S / 512) | 0;
    for (let f = 0; f < NF; f++) {
      const x = S * (0.08 + rr() * 0.84), y = S * (0.12 + rr() * 0.4);
      const kind = rr();
      const [fr, fg, fb] = kind < 0.45 ? [0.95, 0.93, 0.82] : kind < 0.8 ? [0.95, 0.78, 0.18] : [0.72, 0.30, 0.55];
      for (let s2 = y; s2 < S; s2++) px(x + Math.sin(s2 * 0.05 + f) * 2, s2, 0.14, 0.24, 0.09, 0.9);   // stem
      const R = S * (0.008 + rr() * 0.006);
      for (let q = 0; q < 6; q++) {                          // petal blobs around a centre
        const a = q / 6 * Math.PI * 2 + rr() * 0.4, pxc = x + Math.cos(a) * R, pyc = y + Math.sin(a) * R * 0.8;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy) / R; if (d > 1) continue;
          px(pxc + dx, pyc + dy, fr * (0.75 + 0.25 * (1 - d)), fg * (0.75 + 0.25 * (1 - d)), fb, sstep(1, 0.7, d));
        }
      }
      for (let dy = -R * 0.5; dy <= R * 0.5; dy++) for (let dx = -R * 0.5; dx <= R * 0.5; dx++) {
        if (Math.hypot(dx, dy) <= R * 0.5) px(x + dx, y + dy, 0.55, 0.42, 0.10, 1);   // centre disc
      }
    }
  }
  return t;
}
// one tuft: 2-3 crossed cards with seeded rotation, size jitter and a slight lean.
// UVs put v=1 at the blade roots (image bottom) so the card reads upright.
function grassClump(m, cx, cz, y, seed2, size = 1) {
  const rr = rng(seed2);
  const n = 2 + (rr() * 2 | 0), a0 = rr() * Math.PI;
  for (let q = 0; q < n; q++) {
    const a = a0 + q * Math.PI / n + (rr() - 0.5) * 0.5;
    const w = (1.5 + rr() * 0.8) * size, h = (0.8 + rr() * 0.45) * size;
    const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
    const swx = (0.22 + (rr() - 0.5) * 0.18) * size, swz = (0.10 + (rr() - 0.5) * 0.18) * size;   // one prevailing wind + per-card jitter
    quad(m, [cx - dx, y - 0.05, cz - dz], [cx + dx, y - 0.05, cz + dz],
            [cx + dx + swx, y + h, cz + dz + swz], [cx - dx + swx, y + h, cz - dz + swz],
      [[0, 1], [1, 1], [1, 0], [0, 0]]);
  }
}
// scatter clumps over a rect, rejecting reserved rects [x0,z0,x1,z1] (ramps, lanes, pads).
// opts: { y | yAt(x,z), avoid: [rects], flowerM, flowerFrac, sMin, sMax, edge }
function scatterFoliage(m, x0, z0, x1, z1, n, seed2, opts = {}) {
  const rr = rng(seed2), avoid = opts.avoid || [];
  const yAt = opts.yAt || (() => opts.y || 0);
  const sMin = opts.sMin ?? 0.7, sMax = opts.sMax ?? 1.25;
  // low-frequency patch noise: lush clumps with thin gaps between them, and per-patch hue
  // (alt materials) — an even carpet of identical green is the procedural tell
  const vh = (a, b) => hash2(a * 3.17 + seed2 * 0.13, b * 7.71 - seed2 * 0.29);
  const vn = (x, z) => { const xf = x * 0.19, zf = z * 0.19, xi = Math.floor(xf), zi = Math.floor(zf);
    const fx = xf - xi, fz = zf - zi, sx2 = fx * fx * (3 - 2 * fx), sz2 = fz * fz * (3 - 2 * fz);
    return (vh(xi, zi) * (1 - sx2) + vh(xi + 1, zi) * sx2) * (1 - sz2) + (vh(xi, zi + 1) * (1 - sx2) + vh(xi + 1, zi + 1) * sx2) * sz2; };
  const mats = [m].concat(opts.alts || []);
  let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 22) {
    const x = x0 + rr() * (x1 - x0), z = z0 + rr() * (z1 - z0);
    const pv = vn(x, z);
    if (opts.patchy !== false && pv < 0.34) continue;
    if (avoid.some(r => x > r[0] - 0.7 && x < r[2] + 0.7 && z > r[1] - 0.7 && z < r[3] + 0.7)) continue;
    const mm = (opts.flowerM != null && rr() < (opts.flowerFrac ?? 0.22)) ? opts.flowerM
      : mats[Math.min(mats.length - 1, (pv * mats.length * 1.35) | 0)];
    grassClump(mm, x, z, yAt(x, z), (seed2 * 31 + placed * 7 + 1) | 0, (sMin + rr() * (sMax - sMin)) * (0.72 + pv * 0.5));
    placed++;
  }
  return placed;
}

// place a callback twice: as-is and rotated 180° about the origin (x,z -> -x,-z).
// The callback receives a transform that flips coordinates and swaps team materials.
function mirrored(fn) {
  fn((x, z) => [x, z], t => t.a);
  fn((x, z) => [-x, -z], t => t.b);
}

// a decal: one quad floated 2cm off a surface, uv-mapped into an atlas cell. The vertex
// patterns copy box()'s faces (proven winding); the uv corner order was worked out per face
// so wall artwork reads upright and floor artwork points -z at rot 0.
function decal(m, face, cx, cy, cz, w, h, cell, rot = 0) {
  const CELL = 0.25, PAD = 8 / 1024;
  const u0 = cell[0] * CELL + PAD, v0 = cell[1] * CELL + PAD, u1 = (cell[0] + 1) * CELL - PAD, v1 = (cell[1] + 1) * CELL - PAD;
  if (face === 'up') {
    let uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let q = 0; q < ((rot / 90) | 0); q++) uv = [uv[3], uv[0], uv[1], uv[2]];
    quad(m, [cx - w / 2, cy, cz - h / 2], [cx + w / 2, cy, cz - h / 2], [cx + w / 2, cy, cz + h / 2], [cx - w / 2, cy, cz + h / 2], uv);
    return;
  }
  const uv = [[u1, v1], [u0, v1], [u0, v0], [u1, v0]];
  const y0 = cy - h / 2, y1 = cy + h / 2;
  if (face === '-z') quad(m, [cx - w / 2, y0, cz], [cx + w / 2, y0, cz], [cx + w / 2, y1, cz], [cx - w / 2, y1, cz], uv);
  if (face === '+z') quad(m, [cx + w / 2, y0, cz], [cx - w / 2, y0, cz], [cx - w / 2, y1, cz], [cx + w / 2, y1, cz], uv);
  if (face === '-x') quad(m, [cx, y0, cz + w / 2], [cx, y0, cz - w / 2], [cx, y1, cz - w / 2], [cx, y1, cz + w / 2], uv);
  if (face === '+x') quad(m, [cx, y0, cz - w / 2], [cx, y0, cz + w / 2], [cx, y1, cz + w / 2], [cx, y1, cz - w / 2], uv);
}

// ----------------------------------------------------------------- material library ----
// Every family the painter can bake, one call away: libMat('brick') returns a material index,
// building and caching the texture set on first use. Layouts compose palettes from these, so
// any theme — industrial, castle, desert, sci-fi lab, lava cavern — is a palette away.
// TEXSIZE=512 in the environment halves every texture (the museum uses it to stay small).
const MATLIB = {
  concrete:  { s: 1024, make: (n, S) => concreteFinished(n, 11, S),  opts: { base: [0.62, 0.64, 0.66], rough: 0.95, scale: 7, nrm: 1.2 } },
  panels:    { s: 1024, make: (n, S) => panelsTex(n, 23, S),         opts: { base: [0.66, 0.7, 0.74], rough: 0.9, scale: 12, nrm: 1.4 } },
  metal:     { s: 1024, make: (n, S) => metalTex(n, 37, S),          opts: { base: [0.8, 0.84, 0.9], metal: 0.15, rough: 1, scale: 4, nrm: 1.2 } },
  deck:      { s: 1024, make: (n, S) => deckTex(n, 51, S),           opts: { base: [0.9, 0.93, 1], metal: 0.15, rough: 1, scale: 3, nrm: 1.6 } },
  crateTx:   { s: 512,  make: (n, S) => crateTex(n, 67, S),          opts: { base: [0.55, 0.52, 0.38], rough: 0.8, metal: 0.25, scale: 1, nrm: 1.8 } },
  hazard:    { s: 512,  make: (n, S) => hazardTex(n, 77, S),             opts: { base: [1, 1, 1], rough: 0.75, scale: 2, nrm: 0.8 } },
  brick:     { s: 1024, make: (n, S) => brickTex(n, 101, S),         opts: { base: [1, 1, 1], rough: 0.92, scale: 5, nrm: 1.6 } },
  brickPale: { s: 1024, make: (n, S) => brickTex(n, 103, S, [0.62, 0.55, 0.45]), opts: { base: [1, 1, 1], rough: 0.92, scale: 5, nrm: 1.6 } },
  stone:     { s: 1024, make: (n, S) => stoneBlocksTex(n, 107, S),   opts: { base: [1, 1, 1], rough: 0.95, scale: 6, nrm: 1.8 } },
  cobble:    { s: 1024, make: (n, S) => cobbleTex(n, 109, S),        opts: { base: [1, 1, 1], rough: 0.95, scale: 4, nrm: 2 } },
  rock:      { s: 1024, make: (n, S) => rockTex(n, 113, S),          opts: { base: [1, 1, 1], rough: 0.97, scale: 9, nrm: 2.2 } },
  dirt:      { s: 512,  make: (n, S) => dirtTex(n, 127, S),          opts: { base: [1, 1, 1], rough: 0.97, scale: 5, nrm: 1.4 } },
  grass:     { s: 512,  make: (n, S) => grassTex(n, 131, S),         opts: { base: [1, 1, 1], rough: 0.95, scale: 5, nrm: 1 } },
  sand:      { s: 512,  make: (n, S) => sandTex(n, 137, S),          opts: { base: [1, 1, 1], rough: 0.9, scale: 5, nrm: 1.2 } },
  planks:    { s: 1024, make: (n, S) => plankTex(n, 139, S),         opts: { base: [1, 1, 1], rough: 0.85, scale: 4, nrm: 1.4 } },
  plankGrey: { s: 1024, make: (n, S) => plankTex(n, 149, S, [0.5, 0.47, 0.42]), opts: { base: [1, 1, 1], rough: 0.9, scale: 4, nrm: 1.4 } },
  asphalt:   { s: 512,  make: (n, S) => asphaltTex(n, 151, S),       opts: { base: [1, 1, 1], rough: 1, scale: 8, nrm: 1.2 } },
  tiles:     { s: 512,  make: (n, S) => tilesTex(n, 157, S),         opts: { base: [1, 1, 1], rough: 1, scale: 3, nrm: 1 } },
  marble:    { s: 1024, make: (n, S) => marbleTex(n, 163, S),        opts: { base: [1, 1, 1], rough: 1, scale: 6, nrm: 0.6 } },
  plaster:   { s: 1024, make: (n, S) => plasterTex(n, 167, S),       opts: { base: [1, 1, 1], rough: 0.94, scale: 6, nrm: 1.4 } },
  corrugated:{ s: 512,  make: (n, S) => corrugatedTex(n, 173, S),    opts: { base: [1, 1, 1], metal: 0.2, rough: 1, scale: 3, nrm: 2.2 } },
  paintGreen:{ s: 1024, make: (n, S) => paintedMetalTex(n, 179, S),  opts: { base: [1, 1, 1], metal: 0.2, rough: 1, scale: 4, nrm: 1.2 } },
  paintRed:  { s: 1024, make: (n, S) => paintedMetalTex(n, 181, S, [0.55, 0.2, 0.16]), opts: { base: [1, 1, 1], metal: 0.2, rough: 1, scale: 4, nrm: 1.2 } },
  scifi:     { s: 1024, make: (n, S) => scifiPanelTex(n, 191, S),    opts: { base: [1, 1, 1], metal: 0.25, rough: 1, scale: 4, nrm: 1.4 } },
  scifiFloor:{ s: 1024, make: (n, S) => scifiFloorTex(n, 193, S),    opts: { base: [1, 1, 1], metal: 0.25, rough: 1, scale: 4, nrm: 1.4 } },
  lava:      { s: 512,  make: (n, S) => lavaTex(n, 197, S),          opts: { base: [1, 1, 1], rough: 0.95, scale: 6, nrm: 1.8 } },
  // build 1114
  sandstone: { s: 1024, make: (n, S) => sandstoneTex(n, 233, S),     opts: { base: [1, 1, 1], rough: 0.96, scale: 6, nrm: 1.9 } },
  sandRed:   { s: 1024, make: (n, S) => sandstoneTex(n, 239, S, [0.66, 0.4, 0.29]), opts: { base: [1, 1, 1], rough: 0.96, scale: 7, nrm: 1.9 } },
  snow:      { s: 512,  make: (n, S) => snowTex(n, 241, S),          opts: { base: [1, 1, 1], rough: 1, scale: 6, nrm: 1.5 } },
  ice:       { s: 1024, make: (n, S) => iceTex(n, 251, S),           opts: { base: [1, 1, 1], metal: 0.05, rough: 1, scale: 5, nrm: 1.3 } },
  bark:      { s: 512,  make: (n, S) => barkTex(n, 199, S),          opts: { base: [1, 1, 1], rough: 0.95, scale: 2.2, nrm: 2 } },
  leaves:    { s: 512,  make: (n, S) => leavesTex(n, 211, S),        opts: { base: [1, 1, 1], rough: 0.95, scale: 2.6, nrm: 1.4 } },
  // foliage cards: alpha-cutout, double-sided, and NOCOLLIDE (build 1093 engine convention)
  grassCard: { s: 512,  make: (n, S) => grassCardTex(n, 223, S),                  opts: { base: [1, 1, 1], rough: 0.92, metal: 0, mask: true, ds: true, nocollide: true } },
  flowerCard:{ s: 512,  make: (n, S) => grassCardTex(n, 227, S, { flowers: true }), opts: { base: [1, 1, 1], rough: 0.92, metal: 0, mask: true, ds: true, nocollide: true } },
  reedCard:  { s: 512,  make: (n, S) => grassCardTex(n, 229, S, { tall: true }),    opts: { base: [0.9, 0.95, 0.8], rough: 0.92, metal: 0, mask: true, ds: true, nocollide: true } },
};
const _libCache = {};
function libMat(id, over) {
  if (!MATLIB[id]) throw new Error('unknown material: ' + id);
  if (!over && _libCache[id] != null) return _libCache[id];
  const d = MATLIB[id], S = +(process.env.TEXSIZE || 0) || d.s, tn = 't_' + id;
  if (!TEXS[tn]) useTex(d.make(tn, S));
  const m = mat(over ? id + '*' : id, { tex: tn, ...d.opts, ...(over || {}) });
  if (!over) _libCache[id] = m;
  return m;
}

// ---------------------------------------------------------------------- palettes ----
function industrialPalette() {
  const decals = useTex(decalTex('decals'));
  return {
    floor: libMat('concrete', { base: [0.52, 0.55, 0.57] }),
    slab: libMat('deck'),
    wall: libMat('panels'),
    pillar: libMat('metal'),
    ramp: libMat('deck', { base: [0.82, 0.86, 0.94] }),
    parapet: libMat('metal', { base: [0.6, 0.65, 0.72], scale: 3 }),
    hazard: libMat('hazard'),
    crate: libMat('crateTx'),
    crate2: libMat('crateTx', { base: [0.5, 0.35, 0.26], rough: 0.85 }),
    // emissives stay untextured — the glow is the texture
    trim: mat('trim', { base: [0.22, 0.96, 0.68], glow: 0.9, rough: 0.5 }),
    teamA: mat('teamA', { base: [1, 0.55, 0.23], glow: 0.55, rough: 0.6 }),
    teamB: mat('teamB', { base: [0.29, 0.66, 1], glow: 0.55, rough: 0.6 }),
    // stains and worn paint, alpha-blended 2cm above whatever they sit on
    decals: mat('decals', { tex: decals, blend: true, rough: 0.5, metal: 0, base: [1, 1, 1] }),
  };
}

// ------------------------------------------------------------------ layout: keep ----
// "Crossfire Keep" — 79×79 walled arena. Ground floor with mirrored cover; a raised
// central deck (y 4.5) bridged to two wall galleries; a top perch (y 9) over the deck
// reached by two opposed ramps. Bases at N and S.
function buildKeep() {
  const P = industrialPalette();
  const W = 38;            // inner wall face at ±W
  const WALL_H = 13;
  const MID = 4.5, TOP = 9, T = 0.5;   // deck height, perch height, slab thickness

  // ground + perimeter
  box(P.floor, -W - 1.5, -T, -W - 1.5, W + 1.5, 0, W + 1.5);
  box(P.wall, -W - 1.5, 0, -W - 1.5, W + 1.5, WALL_H, -W);        // N
  box(P.wall, -W - 1.5, 0, W, W + 1.5, WALL_H, W + 1.5);          // S
  box(P.wall, -W - 1.5, 0, -W, -W, WALL_H, W);                    // W
  box(P.wall, W, 0, -W, W + 1.5, WALL_H, W);                      // E
  // articulation: pilasters every 9.5, a skirt course, a cap course — a wall with structure
  // instead of a flat extrusion (and the AO bake shades every join)
  for (let a = -28.5; a <= 28.5; a += 9.5) {
    cbox(P.wall, a, 6.1, -W + 0.3, 1.5, 12.2, 0.9); cbox(P.wall, a, 6.1, W - 0.3, 1.5, 12.2, 0.9);
    cbox(P.wall, -W + 0.3, 6.1, a, 0.9, 12.2, 1.5); cbox(P.wall, W - 0.3, 6.1, a, 0.9, 12.2, 1.5);
  }
  for (const [x0, z0, x1, z1] of [[-W, -W, W, -W + 0.55], [-W, W - 0.55, W, W], [-W, -W, -W + 0.55, W], [W - 0.55, -W, W, W]]) {
    box(P.parapet, x0, 0, z0, x1, 0.5, z1);                       // skirt
    box(P.parapet, x0, WALL_H - 0.45, z0, x1, WALL_H, z1);        // cap
  }
  // service pipes along the E and W walls, above gallery head height, with brackets
  for (const sx of [1, -1]) for (const [py, pr] of [[7.6, 0.24], [8.35, 0.16]]) {
    pipe(P.parapet, 'z', -30, 30, py, sx * (W - 0.55), pr);
    for (let bz = -28; bz <= 28; bz += 8) cbox(P.parapet, sx * (W - 0.35), py, bz, 0.7, pr * 2 + 0.14, 0.35);
  }

  // central deck (32×24 @ MID) on pillars, perch (14×8 @ TOP)
  cbox(P.slab, 0, MID - T / 2, 0, 32, T, 24);
  cbox(P.slab, 0, TOP - T / 2, 0, 14, T, 8);
  for (const px of [-14, 0, 14]) for (const pz of [-10, 10]) {     // columns: shaft + base + capital
    cyl(P.pillar, px, pz, 0.25, MID - T, 1.0, 14);
    bevelCbox(P.pillar, px, 0.14, pz, 2.6, 0.28, 2.6);
    cbox(P.pillar, px, MID - T - 0.14, pz, 2.4, 0.28, 2.4);
  }
  for (const px of [-6, 6]) for (const pz of [-3, 3]) {
    cyl(P.pillar, px, pz, MID, TOP - T, 0.62, 12);
    cbox(P.pillar, px, MID + 0.12, pz, 1.7, 0.24, 1.7);
  }
  // steel joists under the deck and perch — depth where you look up
  for (let jz = -10; jz <= 10; jz += 4) box(P.parapet, -16, MID - T - 0.32, jz - 0.14, 16, MID - T, jz + 0.14);
  for (let jx = -6; jx <= 6; jx += 3) box(P.parapet, jx - 0.12, TOP - T - 0.26, -4, jx + 0.12, TOP - T, 4);

  // perch ramps: deck edge (±16) climbing inward to the perch lip (±7). 9 run / 4.5 rise
  // = 0.5 per grid cell, inside the 0.6 step allowance.
  ramp(P.ramp, 7, -2, 16, 2, MID, TOP, MID, 'x');
  ramp(P.ramp, -16, -2, -7, 2, MID, MID, TOP, 'x');

  // ground -> deck ramps off the N and S deck edges (12 run / 4.5 rise = 0.375/cell)
  for (const x of [-10, 10]) {
    ramp(P.ramp, x - 2, 12, x + 2, 24, 0, MID, 0, 'z');     // S: high end at the deck edge
    ramp(P.ramp, x - 2, -24, x + 2, -12, 0, 0, MID, 'z');   // N, mirrored
  }

  // wall galleries (6 wide, along E and W walls) + two flat bridges to the deck per side
  for (const s of [1, -1]) {
    const gx0 = s > 0 ? 32 : -W, gx1 = s > 0 ? W : -32;
    box(P.slab, gx0, MID - T, -24, gx1, MID, 24);
    for (let jz = -22; jz <= 22; jz += 5.5) box(P.parapet, gx0, MID - T - 0.3, jz - 0.13, gx1, MID - T, jz + 0.13);
    for (const bz of [-9, 9]) { const bx0 = s > 0 ? 16 : -32, bx1 = s > 0 ? 32 : -16;
      box(P.slab, bx0, MID - T, bz - 2, bx1, MID, bz + 2);
      box(P.parapet, bx0, MID - T - 0.28, bz - 2, bx1, MID - T, bz - 1.75);   // bridge edge beams
      box(P.parapet, bx0, MID - T - 0.28, bz + 1.75, bx1, MID - T, bz + 2);
    }
    // gallery -> ground ramps at both ends (10 run / 4.5 rise = 0.45/cell)
    ramp(P.ramp, gx0 + 1, 24, gx1 - 1, 34, 0, MID, 0, 'z');
    ramp(P.ramp, gx0 + 1, -34, gx1 - 1, -24, 0, 0, MID, 'z');
  }

  // parapets (1.1 high) with gaps where ramps and bridges land
  // glow trim sits on TOP of each parapet segment — never spanning the gaps, where a
  // full-length bar would hang at chest height across every bridge and ramp landing
  for (const s of [1, -1]) {                                     // gallery inner edges
    const x0 = s > 0 ? 32 : -32.3, x1 = s > 0 ? 32.3 : -32;
    for (const [z0, z1] of [[-24, -11], [-7, 7], [11, 24]]) {
      box(P.parapet, x0, MID, z0, x1, MID + 1.1, z1);
      box(P.trim, x0, MID + 1.1, z0, x1, MID + 1.2, z1);
      for (const pz of [z0 + 0.25, (z0 + z1) / 2, z1 - 0.25])     // rail posts
        bevelCbox(P.parapet, (x0 + x1) / 2, MID + 0.65, pz, 0.42, 1.34, 0.42);
    }
  }
  mirrored((xz) => {                                             // deck N/S edges
    const zs = xz(0, 12)[1] > 0 ? [12, 12.3] : [-12.3, -12];
    for (const [x0, x1] of [[-16, -12], [-8, 8], [12, 16]]) {
      box(P.parapet, x0, MID, zs[0], x1, MID + 1.1, zs[1]);
      box(P.trim, x0, MID + 1.1, zs[0], x1, MID + 1.2, zs[1]);
    }
  });
  for (const s of [1, -1]) {                                     // deck E/W edges around bridges
    const x0 = s > 0 ? 16 : -16.3, x1 = s > 0 ? 16.3 : -16;
    for (const [z0, z1] of [[-12, -11], [-7, -2], [2, 7], [11, 12]]) box(P.parapet, x0, MID, z0, x1, MID + 1.1, z1);
  }
  cbox(P.trim, 0, TOP + 0.05, -4.05, 14.4, 0.1, 0.3);            // perch rim glow
  cbox(P.trim, 0, TOP + 0.05, 4.05, 14.4, 0.1, 0.3);

  // team bases: apron cover wall (1.2 high) with two exit gaps + colour band on the wall
  mirrored((xz, team) => {
    const south = xz(0, 1)[1] > 0, zs = south ? [26, 27] : [-27, -26];
    const tm = team({ a: P.teamA, b: P.teamB });
    for (const [x0, x1] of [[-14, -5], [-2, 2], [5, 14]]) box(P.parapet, x0, 0, zs[0], x1, 1.2, zs[1]);
    box(tm, -14, 1.2, zs[0], 14, 1.35, zs[1]);
    box(tm, -16, 3.2, south ? W - PROUD : -W - 0.15, 16, 4.4, south ? W + 0.15 : -W + PROUD); // wall band (build 1108: proud of the wall, never flush)
  });

  // ground cover, mirrored pairs (2×1.7 crates, some stacked)
  mirrored((xz, team) => {
    const spots = [[6, 17, 0], [22, 5, 0], [24, 18, 45], [10, -20, 30], [30, -14, 0]];
    for (const [sx, sz, rot] of spots) {
      const [x, z] = xz(sx, sz);
      const m = (sx + sz) % 3 ? P.crate : P.crate2;
      bevelCbox(m, x, 0.85, z, 2, 1.7, 2, true);
      if (!rot) bevelCbox(m === P.crate ? P.crate2 : P.crate, x + 0.15, 2.4, z - 0.1, 1.4, 1.4, 1.4, true);
    }
  });

  // decals: stains where things live, paint where players look. These are what stop the
  // tiling textures from reading as tiles.
  const D = P.decals;
  for (const [x, z] of [[6, 17], [-6, -17], [22, 5], [-22, -5]]) decal(D, 'up', x + 0.4, 0.02, z - 0.3, 3.4, 3.4, DECAL.OIL, ((x + z) & 1) * 90);
  decal(D, 'up', 0, MID + 0.02, 0, 9, 9, DECAL.RING);                       // deck centre: the contested mark
  decal(D, 'up', 0, TOP + 0.02, 0, 5.5, 5.5, DECAL.RING);                   // perch echo
  for (const s2 of [1, -1]) for (const bz of [-9, 9]) decal(D, 'up', s2 * 13.5, MID + 0.02, bz, 3, 2.4, DECAL.SCUFF, s2 > 0 ? 0 : 180);
  for (const x of [-10, 10]) {                                              // painted arrows at every ramp foot
    decal(D, 'up', x, 0.02, 25.6, 3.6, 3, DECAL.CHEV, 0);
    decal(D, 'up', x, 0.02, -25.6, 3.6, 3, DECAL.CHEV, 180);
  }
  for (const s2 of [1, -1]) { decal(D, 'up', s2 * 35, 0.02, 35.6, 3.4, 2.8, DECAL.CHEV, 0); decal(D, 'up', s2 * 35, 0.02, -35.6, 3.4, 2.8, DECAL.CHEV, 180); }
  decal(D, '-z', 0, 7.6, W - 0.04, 5, 6.5, DECAL.ONE);                      // team numbers on the base walls
  decal(D, '+z', 0, 7.6, -W + 0.04, 5, 6.5, DECAL.TWO);
  for (const z of [-18, 18]) { decal(D, '-x', W - 0.04, 6.2, z, 6, 7, DECAL.LEAK); decal(D, '+x', -W + 0.04, 6.2, z, 6, 7, DECAL.LEAK); }
  for (const s2 of [1, -1]) decal(D, 'up', s2 * 35, MID + 0.02, s2 * -5, 3, 3, DECAL.OIL, 90);
  return { name: 'Crossfire Keep' };
}

// ----------------------------------------------------------------- layout: spine ----
// "Twin Spine" — 88×64 arena for faster, lane-based fights. Two long parallel raised
// walkways (y 3.6) run E-W with a sunken centre killbox between them; short bunkers
// anchor each corner. Lower and longer than the keep: sightlines rule, verticality is
// a dodge, not a throne.
function buildSpine() {
  const P = industrialPalette();
  const HX = 44, HZ = 32, WALL_H = 11, MID = 3.6, T = 0.5;

  box(P.floor, -HX - 1.5, -T, -HZ - 1.5, HX + 1.5, 0, HZ + 1.5);
  box(P.wall, -HX - 1.5, 0, -HZ - 1.5, HX + 1.5, WALL_H, -HZ);
  box(P.wall, -HX - 1.5, 0, HZ, HX + 1.5, WALL_H, HZ + 1.5);
  box(P.wall, -HX - 1.5, 0, -HZ, -HX, WALL_H, HZ);
  box(P.wall, HX, 0, -HZ, HX + 1.5, WALL_H, HZ);
  for (let a = -40; a <= 40; a += 10) { cbox(P.wall, a, 5.2, -HZ + 0.3, 1.5, 10.4, 0.9); cbox(P.wall, a, 5.2, HZ - 0.3, 1.5, 10.4, 0.9); }
  for (let a = -28; a <= 28; a += 9.3) { cbox(P.wall, -HX + 0.3, 5.2, a, 0.9, 10.4, 1.5); cbox(P.wall, HX - 0.3, 5.2, a, 0.9, 10.4, 1.5); }
  for (const [x0, z0, x1, z1] of [[-HX, -HZ, HX, -HZ + 0.55], [-HX, HZ - 0.55, HX, HZ], [-HX, -HZ, -HX + 0.55, HZ], [HX - 0.55, -HZ, HX, HZ]]) {
    box(P.parapet, x0, 0, z0, x1, 0.5, z1);
    box(P.parapet, x0, WALL_H - 0.45, z0, x1, WALL_H, z1);
  }
  for (const sz of [1, -1]) for (const [py, pr] of [[6.4, 0.22], [7.1, 0.15]]) {
    pipe(P.parapet, 'x', -40, 40, py, sz * (HZ - 0.5), pr);
    for (let bx = -36; bx <= 36; bx += 9) cbox(P.parapet, bx, py, sz * (HZ - 0.32), 0.35, pr * 2 + 0.14, 0.64);
  }

  // the two spines: raised walkways at z=±10, 6 wide, 64 long, on repeating pillars
  for (const s of [1, -1]) {
    box(P.slab, -32, MID - T, s * 10 - 3, 32, MID, s * 10 + 3);
    for (let jx = -30; jx <= 30; jx += 5) box(P.parapet, jx - 0.13, MID - T - 0.3, s * 10 - 3, jx + 0.13, MID - T, s * 10 + 3);
    for (let px = -28; px <= 28; px += 14) {
      cyl(P.pillar, px, s * 10, 0.22, MID - T, 0.95, 14);
      bevelCbox(P.pillar, px, 0.12, s * 10, 2.4, 0.24, 2.4);
      cbox(P.pillar, px, MID - T - 0.13, s * 10, 2.2, 0.26, 2.2);
    }
    // parapet only on the killbox side — the outer side is an open drop for flanks
    const zi = s > 0 ? [7, 7.3] : [-7.3, -7];
    for (const [x0, x1] of [[-32, -20], [-12, 12], [20, 32]]) {
      box(P.parapet, x0, MID, zi[0], x1, MID + 1.1, zi[1]);
      box(P.trim, x0, MID + 1.1, zi[0], x1, MID + 1.2, zi[1]);   // per segment — the gaps are drop-down lips
    }
    // ramps up: one at each end (10 run / 3.6 rise = 0.36/cell), landing outward
    ramp(P.ramp, -42, s * 10 - 2, -32, s * 10 + 2, 0, 0, MID, 'x');
    ramp(P.ramp, 32, s * 10 - 2, 42, s * 10 + 2, 0, MID, 0, 'x');
  }
  // centre killbox: waist-high cross cover in hazard stripes + glow marker
  cbox(P.hazard, 0, 0.6, 0, 10, 1.2, 2);
  cbox(P.hazard, 0, 0.6, 0, 2, 1.2, 10);
  cbox(P.trim, 0, 1.25, 0, 2.4, 0.12, 2.4);

  // corner bunkers: L-walls (2.6 high — blocks sight, not a platform) + a crate nest
  mirrored((xz, team) => {
    for (const sxz of [[30, 22], [-30, 22]]) {
      const [x, z] = xz(sxz[0], sxz[1]);
      const dx = x > 0 ? -1 : 1, dz = z > 0 ? -1 : 1;
      box(P.wall, Math.min(x, x + dx * 10), 0, Math.min(z, z + dz * 1), Math.max(x, x + dx * 10), 2.6, Math.max(z, z + dz * 1));
      box(P.wall, Math.min(x, x + dx * 1), 0, Math.min(z, z + dz * 8), Math.max(x, x + dx * 1), 2.6, Math.max(z, z + dz * 8));
      bevelCbox((sxz[0] > 0) ? P.crate : P.crate2, x + dx * 4, 0.85, z + dz * 4, 2, 1.7, 2, true);
    }
    // team bands on the short walls
    const tm = team({ a: P.teamA, b: P.teamB });
    const east = xz(1, 0)[0] > 0;
    box(tm, east ? HX : -HX - 0.15, 2.8, -14, east ? HX + 0.15 : -HX, 4.0, 14);
  });

  // mid-field cover: crates, cargo containers as heavy cover, lampposts by the ramps
  mirrored((xz) => {
    for (const [sx, sz] of [[10, 20], [-16, 24], [22, 16]]) {
      const [x, z] = xz(sx, sz);
      bevelCbox((sx + sz) % 3 ? P.crate : P.crate2, x, 0.85, z, 2, 1.7, 2, true);
    }
    const [cx2, cz2] = xz(2, 24);
    container(libMat('paintRed'), P.parapet, cx2, cz2, 0, 'x');
    const [cx3, cz3] = xz(-24, -19);
    container(libMat('paintGreen'), P.parapet, cx3, cz3, 0, 'z');
    const [lx2, lz2] = xz(38, 16);
    lamppost(P.parapet, P.trim, lx2, lz2, 0);
  });

  // decals — see the keep: stains for life, paint for navigation
  const D = P.decals;
  decal(D, 'up', 0, 0.02, 0, 8, 8, DECAL.RING);
  for (const s2 of [1, -1]) for (const z of [10, -10]) decal(D, 'up', s2 * 40.5, 0.02, z, 3.4, 3, DECAL.CHEV, s2 > 0 ? 270 : 90);
  decal(D, '-x', HX - 0.04, 6.6, 0, 5, 6.5, DECAL.ONE);
  decal(D, '+x', -HX + 0.04, 6.6, 0, 5, 6.5, DECAL.TWO);
  for (const [x, z] of [[26, 18], [-26, -18], [10, 20], [-10, -20]]) decal(D, 'up', x, 0.02, z, 3.2, 3.2, DECAL.OIL, ((x + z) & 1) * 90);
  for (const s2 of [1, -1]) for (const x of [-14, 0, 14]) decal(D, 'up', x, MID + 0.02, s2 * 10, 10, 0.9, DECAL.LINE, 0);
  for (const x of [-14, 14]) { decal(D, '-z', x, 5.5, HZ - 0.04, 6, 7, DECAL.LEAK); decal(D, '+z', x, 5.5, -HZ + 0.04, 6, 7, DECAL.LEAK); }
  for (const [x, z, rr] of [[5, 5, 0], [-5, -5, 90]]) decal(D, 'up', x, 0.02, z, 3, 2.4, DECAL.SCUFF, rr);
  return { name: 'Twin Spine' };
}

// ---------------------------------------------------------------- layout: castle ----
// "The Old Yard" — a torch-lit castle courtyard in stone, cobble and timber. Two wall-walk
// galleries face each other across market stalls and a central fountain; 180° symmetric.
function buildCastle() {
  const stone = libMat('stone'), cobble = libMat('cobble'), planks = libMat('planks');
  const darkWood = libMat('plankGrey'), marble = libMat('marble'), tiles = libMat('tiles');
  const torch = mat('torch', { base: [1, 0.62, 0.25], glow: 1.0, rough: 0.5 });
  const teamA = mat('teamA', { base: [1, 0.55, 0.23], glow: 0.55, rough: 0.6 });
  const teamB = mat('teamB', { base: [0.29, 0.66, 1], glow: 0.55, rough: 0.6 });
  const D = mat('decals', { tex: useTex(decalTex('decals')), blend: true, rough: 0.5, metal: 0, base: [1, 1, 1] });
  const W = 34, TH = 1.8, WH = 10;

  box(cobble, -W - TH, -0.5, -W - TH, W + TH, 0, W + TH);                       // courtyard
  box(stone, -W - TH, 0, -W - TH, W + TH, WH, -W);                             // walls
  box(stone, -W - TH, 0, W, W + TH, WH, W + TH);
  box(stone, -W - TH, 0, -W, -W, WH, W);
  box(stone, W, 0, -W, W + TH, WH, W);
  for (let a = -30; a <= 30; a += 2.4) {                                        // crenellations
    cbox(stone, a, WH + 0.65, -W - TH / 2, 1.1, 1.3, 1.4); cbox(stone, a, WH + 0.65, W + TH / 2, 1.1, 1.3, 1.4);
    cbox(stone, -W - TH / 2, WH + 0.65, a, 1.4, 1.3, 1.1); cbox(stone, W + TH / 2, WH + 0.65, a, 1.4, 1.3, 1.1);
  }
  for (const tx of [-W, W]) for (const tz of [-W, W]) {                         // corner towers + crowns
    cyl(stone, tx, tz, 0, 13.5, 4.4, 16);
    for (let q = 0; q < 10; q++) { const a = q / 10 * Math.PI * 2;
      cbox(stone, tx + Math.cos(a) * 4.1, 14.1, tz + Math.sin(a) * 4.1, 1.0, 1.2, 1.0); }
    cbox(torch, tx, 12.6, tz > 0 ? tz - 4.55 : tz + 4.55, 0.5, 0.5, 0.25);
  }
  // wall-walk galleries on N and S walls, stairs descending toward centre
  mirrored((xz, team) => {
    const south = xz(0, 1)[1] > 0, zi = south ? [28.8, W - TH + 0.2] : [-(W - TH) - 0.2, -28.8];
    box(stone, -12, 5.0, zi[0], 12, 5.5, zi[1]);
    for (let jx = -10; jx <= 10; jx += 5) box(darkWood, jx - 0.14, 4.7, zi[0], jx + 0.14, 5.0, zi[1]);
    for (const sx2 of [1, -1]) ramp(stone, sx2 > 0 ? 12 : -24, zi[0], sx2 > 0 ? 24 : -12, zi[1], 0, sx2 > 0 ? 0 : 5.5, sx2 > 0 ? 5.5 : 0, 'x');
    const zr = south ? 28.9 : -28.9;
    for (let px = -11; px <= 11; px += 4.4) cbox(darkWood, px, 6.15, zr, 0.24, 1.3, 0.24);   // rail posts
    box(darkWood, -11, 6.7, zr - 0.09, 11, 6.95, zr + 0.09);                                 // rail beam
    const tm = team({ a: teamA, b: teamB });
    box(tm, -12, 7.6, south ? W - 0.15 : -W + PROUD, 12, 8.5, south ? W - PROUD : -W + 0.15); // team band (build 1108: 1cm was too thin a margin — PROUD is the shared rule)
    sign(south ? '-z' : '+z', 0, 3.2, south ? W - TH - 0.04 : -(W - TH) + 0.04, 1.5, south ? 'BASE 1' : 'BASE 2');
  });
  // central fountain: plinth, glossy basin, marble column
  cbox(stone, 0, 0.25, 0, 9, 0.5, 9);
  box(tiles, -3.4, 0.5, -3.4, 3.4, 0.62, 3.4);
  for (const [x0, z0, x1, z1] of [[-3.6, -3.6, 3.6, -3.1], [-3.6, 3.1, 3.6, 3.6], [-3.6, -3.6, -3.1, 3.6], [3.1, -3.6, 3.6, 3.6]])
    box(marble, x0, 0.5, z0, x1, 1.35, z1);
  cyl(marble, 0, 0, 0.6, 2.9, 0.7, 12);
  bevelCbox(marble, 0, 3.05, 0, 1.1, 0.34, 1.1);
  // market stalls (mirrored pairs) with counters, sloped roofs and barrels
  mirrored((xz) => {
    for (const [sx, sz, along] of [[16, -11, 'x'], [-2, 20, 'z']]) {
      const [x, z] = xz(sx, sz);
      for (const px of [-1.6, 1.6]) for (const pz of [-1.2, 1.2]) cbox(darkWood, x + px, 1.3, z + pz, 0.22, 2.6, 0.22);
      cbox(planks, x, 0.5, z + (z > 0 ? -1.3 : 1.3), 3.6, 1.0, 0.5);
      ramp(darkWood, x - 2, z - 1.7, x + 2, z + 1.7, 2.5, 3.15, 2.65, 'z');
      bevelCbox(planks, x + 0.8, 0.4, z, 0.9, 0.8, 0.9, true);
      cyl(darkWood, x - 1, z + (z > 0 ? 0.6 : -0.6), 0, 1.25, 0.52, 10);
      cyl(darkWood, x - 0.1, z + (z > 0 ? 0.9 : -0.9), 0, 1.05, 0.48, 10);
    }
    const [ax, az] = xz(16, -11);
    sign(az > 0 ? '-z' : '+z', ax, 3.6, az + (az > 0 ? -1.85 : 1.85), 0.85, 'ARMORY', [0.85, 0.7, 0.4]);
  });
  // barracks (mirrored): the first real BUILDINGS — doorway, windows, interior, and an
  // outside ramp onto a parapeted roof. wallRun turns walls into architecture.
  mirrored((xz) => {
    const [bx, bz] = xz(17, 13);                 // centre; footprint 12 x 8, walls to 4.6
    const x0 = bx - 6, x1 = bx + 6, z0 = bz - 4, z1 = bz + 4, WH2 = 4.6;
    const south = bz > 0;                        // door faces the courtyard
    const zDoor = south ? z0 : z1, zBack = south ? z1 : z0;
    wallRun(stone, 'x', x0, x1, zDoor - (south ? 0.45 : 0), zDoor + (south ? 0 : 0.45), 0, WH2,
      [{ at: bx, w: 3.2, h: 3.4 }, { at: bx - 4.2, w: 2.2, h: 1.5, sill: 1.4 }, { at: bx + 4.2, w: 2.2, h: 1.5, sill: 1.4 }]);
    wallRun(stone, 'x', x0, x1, zBack - (south ? 0 : 0.45), zBack + (south ? 0.45 : 0), 0, WH2,
      [{ at: bx - 3, w: 2.2, h: 1.5, sill: 1.4 }, { at: bx + 3, w: 2.2, h: 1.5, sill: 1.4 }]);
    wallRun(stone, 'z', z0, z1, x0 - 0.45 + (bx > 0 ? 0 : 0), x0, 0, WH2, [{ at: bz, w: 2.2, h: 1.5, sill: 1.4 }]);
    wallRun(stone, 'z', z0, z1, x1, x1 + 0.45, 0, WH2, []);
    box(planks, x0 - 0.45, WH2, z0 - 0.45, x1 + 0.45, WH2 + 0.35, z1 + 0.45);   // roof slab
    box(darkWood, x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, 0.12, z1 - 0.2);             // plank floor inside
    bevelCbox(planks, bx - 3.4, 0.62, bz + (south ? 1.6 : -1.6), 1.3, 1.24, 1.3, true);
    cbox(torch, bx, 3.9, zBack + (south ? 0.3 : -0.3), 0.4, 0.5, 0.24);
    // roof parapet (gap where the ramp lands) + the ramp itself along the east face
    const rz = south ? [z1 + 0.45, z1 + 0.75] : [z0 - 0.75, z0 - 0.45];
    box(stone, x0 - 0.45, WH2 + 0.35, south ? z0 - 0.75 : z1 + 0.45, x1 + 0.45, WH2 + 0.95, south ? z0 - 0.45 : z1 + 0.75);
    box(stone, x0 - 0.75, WH2 + 0.35, z0 - 0.45, x0 - 0.45, WH2 + 0.95, z1 + 0.45);
    box(stone, x1 + 0.45, WH2 + 0.35, south ? bz - 4.45 : bz - 4.45 + 0, x1 + 0.75, WH2 + 0.95, south ? bz + 1 : bz + 4.45);
    ramp(stone, x1 + 0.45, south ? z1 + 0.45 : z0 - 12.45, x1 + 3.85, south ? z1 + 12.45 : z0 - 0.45,
      0, south ? WH2 + 0.35 : 0, south ? 0 : WH2 + 0.35, 'z');
    sign(south ? '-z' : '+z', bx, 4.05, zDoor + (south ? -0.5 : 0.5), 0.7, 'BARRACKS', [0.85, 0.7, 0.4]);
  });

  // courtyard trees in stone planters, mirrored
  mirrored((xz) => {
    const [tx2, tz2] = xz(-24, -18);
    box(stone, tx2 - 1.6, 0, tz2 - 1.6, tx2 + 1.6, 0.55, tz2 + 1.6);
    tree(libMat('bark'), libMat('leaves'), tx2, tz2, 0.5, (tx2 * 13 + tz2) | 0);
  });

  // torches along the E and W walls; scattered cover
  for (let a = -27; a <= 27; a += 9) { cbox(torch, -W + 0.15, 4.2, a, 0.3, 0.55, 0.28); cbox(torch, W - 0.15, 4.2, a, 0.3, 0.55, 0.28); }
  mirrored((xz) => {
    for (const [sx, sz] of [[24, 6], [10, -22], [26, -18]]) { const [x, z] = xz(sx, sz);
      bevelCbox(planks, x, 0.7, z, 1.5, 1.4, 1.5, true); }
  });
  for (const s2 of [1, -1]) { decal(D, 'up', s2 * 20, 0.02, s2 * 14, 3, 2.4, DECAL.SCUFF, s2 > 0 ? 0 : 90);
    decal(D, s2 > 0 ? '-x' : '+x', s2 * (W - 0.04), 5.8, s2 * -12, 6, 7, DECAL.LEAK); }
  sign('-x', W - TH - 0.04 + TH, 6.5, 0, 1.2, 'THE OLD YARD', [0.8, 0.75, 0.6]);
  return { name: 'The Old Yard' };
}

// ---------------------------------------------------------------- layout: caldera ----
// "Caldera" — king-of-the-hill on a stepped stone mound inside a rock rim, with lava
// channels forcing bridge fights on both approaches. Lava is visual: add fire zones over
// the channels in the editor for damage.
function buildCaldera() {
  const rock = libMat('rock'), dirt = libMat('dirt'), stone = libMat('stone');
  const lava = libMat('lava'), planks = libMat('plankGrey');
  const warm = mat('warm', { base: [1, 0.55, 0.2], glow: 0.9, rough: 0.5 });
  const teamA = mat('teamA', { base: [1, 0.55, 0.23], glow: 0.55, rough: 0.6 });
  const teamB = mat('teamB', { base: [0.29, 0.66, 1], glow: 0.55, rough: 0.6 });
  const D = mat('decals', { tex: useTex(decalTex('decals')), blend: true, rough: 0.5, metal: 0, base: [1, 1, 1] });
  const H = 40, WH = 12;

  // rolling ground: value noise masked flat around every structure — the hill, channels,
  // pools, bases and walls all sit at 0, the open field undulates ±1
  const _tg = lattice(rng(777), 24);
  const wnoise = (x, z) => noiseAt(_tg, 24, ((x * 2.4 % 256) + 256) % 256, ((z * 2.4 % 256) + 256) % 256, 256);
  const rectOut = (x, z, rx0, rz0, rx1, rz1) => Math.max(rx0 - x, x - rx1, rz0 - z, z - rz1, 0);
  const th = (x, z) => {
    let m = Math.min(1, rectOut(x, z, -17, -29, 17, 29) / 5);                     // hill + channels + sign strips
    m = Math.min(m, rectOut(x, z, 19.5, -16.5, 32.5, -3.5) / 5);                  // pools
    m = Math.min(m, rectOut(x, z, -32.5, 3.5, -19.5, 16.5) / 5);
    m = Math.min(m, rectOut(x, z, H - 13, -14, H + 2, 14) / 5);                   // bases
    m = Math.min(m, rectOut(x, z, -H - 2, -14, -(H - 13), 14) / 5);
    m = Math.min(m, Math.max(0, (H - 4 - Math.max(Math.abs(x), Math.abs(z))) / 5));   // walls
    const n = wnoise(x, z) * 0.7 + wnoise(x * 2.3 + 91, z * 2.3 + 40) * 0.3;
    return (n - 0.5) * 2.0 * Math.max(0, m);
  };
  terrainGround(dirt, -H - 1.5, -H - 1.5, H + 1.5, H + 1.5, 2.1, th);
  box(rock, -H - 1.5, 0, -H - 1.5, H + 1.5, WH, -H);
  box(rock, -H - 1.5, 0, H, H + 1.5, WH, H + 1.5);
  box(rock, -H - 1.5, 0, -H, -H, WH, H);
  box(rock, H, 0, -H, H + 1.5, WH, H);
  for (let a = -32; a <= 32; a += 10.5) {                                       // rock buttresses
    cbox(rock, a, 5.5, -H + 0.5, 2.4, 11, 1.6); cbox(rock, a, 5.5, H - 0.5, 2.4, 11, 1.6);
    cbox(rock, -H + 0.5, 5.5, a, 1.6, 11, 2.4); cbox(rock, H - 0.5, 5.5, a, 1.6, 11, 2.4);
  }
  // the hill: three stone terraces, ramps alternating N/S then E/W then N/S
  box(stone, -12, 0, -12, 12, 1.7, 12);
  box(stone, -8, 1.7, -8, 8, 3.4, 8);
  box(stone, -4.5, 3.4, -4.5, 4.5, 5.1, 4.5);
  for (const s2 of [1, -1]) {
    ramp(stone, -2.5, s2 > 0 ? 12 : -16, 2.5, s2 > 0 ? 16 : -12, 0, s2 > 0 ? 1.7 : 0, s2 > 0 ? 0 : 1.7, 'z');
    ramp(stone, s2 > 0 ? 8 : -12, -2, s2 > 0 ? 12 : -8, 2, 1.7, s2 > 0 ? 3.4 : 1.7, s2 > 0 ? 1.7 : 3.4, 'x');
    ramp(stone, -1.75, s2 > 0 ? 4.5 : -8.5, 1.75, s2 > 0 ? 8.5 : -4.5, 3.4, s2 > 0 ? 5.1 : 3.4, s2 > 0 ? 3.4 : 5.1, 'z');
  }
  decal(D, 'up', 0, 5.12, 0, 7.5, 7.5, DECAL.RING);
  for (const s2 of [1, -1]) cbox(warm, 0, 5.35, s2 * 4.3, 8.6, 0.14, 0.22);     // hill crown glow
  for (const s2 of [1, -1]) cbox(warm, s2 * 4.3, 5.35, 0, 0.22, 0.14, 8.2);
  // lava channels across both N/S approaches, with a stone bridge each
  for (const s2 of [1, -1]) {
    const za = s2 > 0 ? 16 : -22, zb = s2 > 0 ? 22 : -16;                       // channel span
    box(lava, -14, -0.35, za, 14, 0.02, zb);
    box(rock, -14.6, 0, za - 0.6, -14, 0.34, zb + 0.6);                         // side curbs
    box(rock, 14, 0, za - 0.6, 14.6, 0.34, zb + 0.6);
    box(rock, -14, 0, za - 0.6, 14, 0.34, za);                                  // near/far curbs
    box(rock, -14, 0, zb, 14, 0.34, zb + 0.6);
    box(stone, -2, 0.02, za - 0.8, 2, 0.42, zb + 0.8);                          // bridge deck
    box(stone, -2.3, 0.42, za - 0.8, -2, 0.9, zb + 0.8);                        // bridge parapets
    box(stone, 2, 0.42, za - 0.8, 2.3, 0.9, zb + 0.8);
    sign('up', 0, 0.04, s2 * 26.5, 1.1, 'DANGER', [0.95, 0.75, 0.1], s2 > 0 ? 0 : 180);
  }
  // lava pools in the flanks + boulders as cover
  mirrored((xz) => {
    const [px, pz] = xz(26, -10);
    box(lava, px - 4, -0.35, pz - 3, px + 4, 0.02, pz + 3);
    box(rock, px - 4.6, 0, pz - 3.6, px + 4.6, 0.3, pz - 3);
    box(rock, px - 4.6, 0, pz + 3, px + 4.6, 0.3, pz + 3.6);
    box(rock, px - 4.6, 0, pz - 3, px - 4, 0.3, pz + 3);
    box(rock, px + 4, 0, pz - 3, px + 4.6, 0.3, pz + 3);
    for (const [bx, bz, r2] of [[14, 24, 1.4], [30, 2, 1.1], [20, -24, 1.7], [7, -27, 1.2]]) {
      const [x, z] = xz(bx, bz); boulder(rock, x, th(x, z) + r2 * 0.42, z, r2 * 1.45, (bx * 7 + bz) | 0);
    }
  });
  // scorched dead trees, mirrored
  mirrored((xz) => {
    for (const [tx2, tz2] of [[24, 26], [-8, 30], [33, -22]]) {
      const [x2, z2] = xz(tx2, tz2);
      deadTree(libMat('bark'), x2, z2, th(x2, z2) - 0.05, (tx2 * 7 + tz2) | 0);
    }
  });

  // bases E and W
  mirrored((xz, team) => {
    const east = xz(1, 0)[0] > 0, tm = team({ a: teamA, b: teamB });
    box(tm, east ? H - 0.15 : -H + 0.01, 5.2, -10, east ? H - 0.01 : -H + 0.15, 6.1, 10);
    sign(east ? '-x' : '+x', east ? H - 0.04 : -H + 0.04, 3.4, 0, 2.2, east ? '1' : '2');
    for (const [cx2, cz2] of [[H - 6, 6], [H - 6, -6]]) { const [x, z] = xz(cx2, cz2);
      bevelCbox(planks, x, 0.7, z, 1.6, 1.4, 1.6, true); }
  });
  return { name: 'Caldera' };
}

// ---------------------------------------------------------------- layout: museum ----
// A material showcase: every library family as a wall slab and a floor apron, in two
// facing rows with a walkway between. Generate with TEXSIZE=512 to keep the file small.
function buildMuseum() {
  const ids = Object.keys(MATLIB);
  const N = Math.ceil(ids.length / 2), GAP = 7.5, LEN = N * GAP + 6;
  const base = libMat('concrete', { base: [0.45, 0.47, 0.5] });
  const glow = mat('trim', { base: [0.22, 0.96, 0.68], glow: 0.9, rough: 0.5 });
  box(base, -LEN / 2, -0.5, -13, LEN / 2, 0, 13);
  ids.forEach((id, q) => {
    const row = q % 2 ? 1 : -1, x = -LEN / 2 + 4 + Math.floor(q / 2) * GAP;
    const m = libMat(id);
    box(m, x - 3, 0, row * 12 - 0.6 * row, x + 3, 5.2, row * 12 + 0.6 * row);       // display wall
    box(m, x - 3, 0.02, row * 4.4, x + 3, 0.07, row * 10.9);                        // floor apron
    box(glow, x - 3, 5.25, row * 12 - 0.2, x + 3, 5.4, row * 12 + 0.2);             // header light
  });
  box(glow, -LEN / 2 + 1, 0.02, -0.3, LEN / 2 - 1, 0.09, 0.3);                      // centreline
  // the props wing: the vocabulary on display beside the materials
  const WX = LEN / 2, bark = libMat('bark'), leaves = libMat('leaves');
  const grass2 = libMat('grass'), metal2 = libMat('metal'), planks2 = libMat('plankGrey');
  box(grass2, WX, -0.5, -13, WX + 46, 0, 13);
  tree(bark, leaves, WX + 5, -6, 0, 71);
  tree(bark, leaves, WX + 11, 6, 0, 72, 1.25);
  conifer(bark, leaves, WX + 17, -6, 0, 73);
  deadTree(bark, WX + 22, 5, 0, 74);
  fenceRun(planks2, 'x', WX + 26, WX + 34, -6, 0);
  lamppost(metal2, glow, WX + 30, 6, 0);
  container(libMat('paintRed'), metal2, WX + 39, -5, 0, 'x');
  container(libMat('paintGreen'), metal2, WX + 39, 5, 0, 'x');
  boulder(libMat('rock'), WX + 33, 0.5, 0, 1.3, 75);
  boulder(libMat('rock'), WX + 35, 0.35, 1.6, 0.8, 76);
  // procedural grass across the props-wing lawn — nocollide cards, walk straight through
  scatterFoliage(libMat('grassCard'), WX + 2, -12, WX + 44, 12, 150, 81, {
    flowerM: libMat('flowerCard'),
    avoid: [[WX + 3, -8, WX + 13, 8], [WX + 15, -8, WX + 24, 7], [WX + 25, -7.5, WX + 35, 7.5], [WX + 36, -7, WX + 42, 7]],
  });
  return { name: 'Material Museum (' + ids.length + ' families + props wing)' };
}

// ------------------------------------------------------------ layout: seeded arenas ----
// Not a fixed layout — a GENERATOR: `node tools/levelgen.mjs arena out.glb <seed> <theme> <size>`
// rolls a symmetric team arena from the seed. The central feature, side structures, cover set,
// props and foliage are all seeded choices, but every ramp is constraint-safe by construction
// (rise/run <= 0.45 under the build-1092 enemy rules) and everything mirrors 180° about the
// origin so neither team gets the long straw. Themes: industrial | castle | volcanic | garden
// (or 'auto' to let the seed pick). Prints a SCANS manifest — every ramp centreline — for the
// engine probe to verify bots can actually walk what was generated.
function arenaPalette(theme) {
  const D = mat('decals', { tex: useTex(decalTex('decals')), blend: true, rough: 0.5, metal: 0, base: [1, 1, 1] });
  const teamA = mat('teamA', { base: [1, 0.55, 0.23], glow: 0.32, rough: 0.6 });   // glow low enough that ACES keeps the hue
  const teamB = mat('teamB', { base: [0.29, 0.66, 1], glow: 0.32, rough: 0.6 });
  const base = { D, teamA, teamB, grassM: libMat('grassCard'), flowerM: libMat('flowerCard'), reedM: libMat('reedCard') };
  // build 1114: a theme is DATA, not a run of conditionals scattered down buildArena. Alongside its
  // materials each one names the treatments it wants — how the perimeter is dressed, whether the
  // wall/floor joinery pass runs and in what, which centrepiece, which yard cover, which foliage —
  // so adding the next theme is one entry here and one mood, not eight ternaries in the builder.
  if (theme === 'castle') return { ...base,
    ground: libMat('cobble'), wall: libMat('stone'), slab: libMat('stone'), deck: libMat('plankGrey'),
    ramp: libMat('stone'), pillar: libMat('stone'), parapet: libMat('stone'),
    cover: libMat('planks'), cover2: libMat('plankGrey'),
    trim: mat('torch', { base: [1, 0.62, 0.25], glow: 1.0, rough: 0.5 }), signC: [0.85, 0.7, 0.4], foliage: 'patchy',
    dress: 'crenels', joinery: ['stone', 'cobble'], plaza: 'monument', yard: 'planters',
    lightCol: [1, 0.78, 0.5], depot: 'BARRACKS', names: ['STONE', 'CROWN', 'RAVEN', 'OAK'] };
  if (theme === 'volcanic') return { ...base,
    ground: libMat('dirt'), wall: libMat('rock'), slab: libMat('stone'), deck: libMat('stone'),
    ramp: libMat('stone'), pillar: libMat('rock'), parapet: libMat('stone'),
    cover: libMat('rock'), cover2: libMat('stone'), lava: libMat('lava'),
    trim: mat('ember', { base: [1, 0.42, 0.12], glow: 0.6, rough: 0.6 }), signC: [1, 0.6, 0.3], foliage: 'scorched',
    dress: 'rubble', joinery: null, plaza: 'boulders', yard: 'boulders',
    lightCol: [1, 0.62, 0.3], depot: 'DEPOT', names: ['EMBER', 'ASH', 'BASALT', 'CINDER'] };
  if (theme === 'garden') return { ...base,
    ground: libMat('grass', { base: [0.74, 0.8, 0.62] }), wall: libMat('brickPale'), slab: libMat('stone'), deck: libMat('planks'),
    ramp: libMat('planks'), pillar: libMat('brickPale'), parapet: libMat('plankGrey'),
    cover: libMat('planks'), cover2: libMat('crateTx'), path: libMat('cobble'),
    trim: mat('lantern', { base: [0.95, 0.9, 0.6], glow: 0.8, rough: 0.5 }), signC: [0.9, 0.86, 0.7], foliage: 'lush',
    dress: 'capped', joinery: ['stone', 'dirt'], plaza: 'monument', yard: 'planters',
    lightCol: [1, 0.93, 0.78], depot: 'GREENHOUSE', names: ['MOSS', 'BLOOM', 'WILLOW', 'CLOVER'] };
  // ---- build 1114: three new themes -----------------------------------------------------
  if (theme === 'desert') return { ...base,   // sun-bleached sandstone: warm mid ground, pale ledges
    ground: libMat('sand'), wall: libMat('sandstone'), slab: libMat('sandRed'), deck: libMat('plankGrey', { base: [0.86, 0.82, 0.72] }),
    ramp: libMat('sandRed'), pillar: libMat('sandstone'), parapet: libMat('sandRed'),
    cover: libMat('crateTx', { base: [0.62, 0.52, 0.36] }), cover2: libMat('plankGrey', { base: [0.8, 0.72, 0.58] }),
    path: libMat('dirt', { base: [0.86, 0.76, 0.58] }),
    trim: mat('brazier', { base: [1, 0.72, 0.34], glow: 0.85, rough: 0.55 }), signC: [0.95, 0.88, 0.72], foliage: 'dunes',
    dress: 'ledges', joinery: ['sandRed', 'dirt'], plaza: 'monument', yard: 'crates',
    lightCol: [1, 0.86, 0.62], depot: 'CISTERN', names: ['DUST', 'MESA', 'SCARAB', 'KILN'] };
  if (theme === 'frost') return { ...base,    // snowfield: near-white ground, dark timber and stone
    ground: libMat('snow'), wall: libMat('stone', { base: [0.78, 0.82, 0.88] }), slab: libMat('ice'), deck: libMat('plankGrey', { base: [0.62, 0.62, 0.66] }),
    ramp: libMat('plankGrey', { base: [0.66, 0.66, 0.7] }), pillar: libMat('stone', { base: [0.74, 0.78, 0.85] }),
    parapet: libMat('plankGrey', { base: [0.58, 0.6, 0.66] }),
    cover: libMat('crateTx', { base: [0.5, 0.5, 0.52] }), cover2: libMat('rock', { base: [0.72, 0.76, 0.84] }),
    snow: libMat('snow'), ice: libMat('ice'),
    trim: mat('coldlamp', { base: [0.72, 0.88, 1], glow: 0.85, rough: 0.5 }), signC: [0.86, 0.92, 1], foliage: 'frozen',
    dress: 'drifts', joinery: ['stone', 'rock'], plaza: 'cairn', yard: 'boulders',
    lightCol: [0.85, 0.92, 1], depot: 'STORES', names: ['FROST', 'TUNDRA', 'PINE', 'SLEET'] };
  if (theme === 'facility') return { ...base, // the sci-fi set the painter has had all along, unused
    ground: libMat('scifiFloor'), wall: libMat('scifi'), slab: libMat('deck', { base: [0.6, 0.64, 0.7] }),
    deck: libMat('deck', { base: [0.6, 0.64, 0.7] }), ramp: libMat('deck', { base: [0.66, 0.7, 0.76] }),
    pillar: libMat('metal', { base: [0.34, 0.37, 0.42] }), parapet: libMat('metal', { base: [0.28, 0.32, 0.38], scale: 3 }),
    cover: libMat('crateTx', { base: [0.46, 0.5, 0.56], rough: 0.7 }), cover2: libMat('hazard'),
    trim: mat('strip', { base: [0.3, 0.9, 1], glow: 0.85, rough: 0.4 }), signC: [0.72, 0.94, 1], foliage: 'none',
    dress: 'ribs', joinery: ['metal', 'hazard'], plaza: 'core', yard: 'containers',
    lightCol: [0.8, 0.95, 1], depot: 'LAB', names: ['VECTOR', 'HALON', 'ORBIT', 'ATRIUM'] };
  return { ...base,   // industrial — hard value structure: dark floor, mid walls, light deck, dark steel
    ground: libMat('concrete', { base: [0.30, 0.31, 0.33], scale: 10 }), wall: libMat('panels', { base: [0.5, 0.52, 0.55] }),
    slab: libMat('deck', { base: [0.62, 0.64, 0.68] }),
    deck: libMat('deck', { base: [0.62, 0.64, 0.68] }), ramp: libMat('deck', { base: [0.66, 0.68, 0.72] }), pillar: libMat('metal', { base: [0.3, 0.32, 0.36] }),
    parapet: libMat('metal', { base: [0.26, 0.29, 0.33], scale: 3 }),
    cover: libMat('crateTx'), cover2: libMat('crateTx', { base: [0.5, 0.35, 0.26], rough: 0.85 }),
    trim: mat('trim', { base: [0.22, 0.96, 0.68], glow: 0.55, rough: 0.5 }), signC: [0.9, 0.88, 0.82], foliage: 'weeds',
    dress: 'buttress', joinery: ['concrete', 'asphalt'], plaza: 'mast', yard: 'containers',
    lightCol: [1, 0.93, 0.78], depot: 'DEPOT', names: ['IRON', 'CARGO', 'GRID', 'BOLT'] };
}
// Per-theme lighting mood: the bake rig (indirect radiance colours) and the runtime worldCfg
// colour script (warm key vs cool fill, fog matched to the horizon) travel together. The warm/cool
// temperature split between sun and shadow is most of what reads as "cinematic".
// build 1134: the mood's sky colours, as the engine's hex world settings.
//
// arenaMood already carries the sky it wants — light.skyZen / skyHor / groundAlb are the colours the
// LIGHTMAP BAKE integrates against. But the runtime block only ever emitted `skyColor` (the hemisphere
// light's tint) and `fogColor`, while the procedural dome is driven by skyZenith / skyHorizon /
// skyGround, which nothing set. So all seven themes rendered under DEFAULT_WORLD's one temperate noon
// sky: measured at the same pixel across seven arenas, the R:B ratio came back between 0.657 and 0.704
// — a single hue — with the NIGHT theme indistinguishable from high noon. And since engine build 1127
// derives fog from the dome, the authored fogColor was being thrown away too.
//
// Emitting the bake's own numbers means the sky the player sees and the sky the lightmap was baked
// against are the same sky, which is the only way the two can stop contradicting each other.
// _skyP() reads these through THREE.Color with legacyMode:false, i.e. it treats them as sRGB and
// linearises them — so a linear bake value has to be encoded on the way out.
const _lin2srgb = (c) => (c <= 0.0031308) ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
function skyHex(rgb) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(_lin2srgb(Math.max(0, Math.min(1, v))) * 255)));
  return (f(rgb[0]) << 16) | (f(rgb[1]) << 8) | f(rgb[2]);
}
// turb is haziness: the dome's horizon ramp is pow(1-y, 1.6 + (1-turb)*3.4), so LOW turb is a tight
// ramp (a clear sky with a hard horizon) and HIGH turb spreads it (haze). sunGlow widens the disc's
// halo, which is what a low sun through dust actually looks like.
function skyMood(zen, hor, gnd, turb, glow, size) {
  return { skyZenith: skyHex(zen), skyHorizon: skyHex(hor), skyGround: skyHex(gnd),
    skyTurb: turb, skySunGlow: glow, skySunSize: size };
}
// build 1143: a mood now describes the GROUND as well as the sky. `groundAlb` is already the ground's
// albedo — the number the lightmap bake integrates for the sun bounce — so handing the same value to the
// engine's own floor plane costs nothing and closes the most visible seam in a generated level: the
// imported ground stops at ±W and the engine's plane runs on to ±ARENA, so a desert arena sat on the
// engine default 0x4f5d66 (a cool grey-blue) butting straight against cream sand. The boundary walls get
// the same albedo at 55%, so the surround reads as the same world one value down rather than as a
// different one. Each theme's albedos are named ONCE here and used three times — by the bake, by the sky
// dome and now by the ground — because three copies of the same literal is how they end up disagreeing.
function groundMood(gnd, rough, metal) {
  return { floorColor: skyHex(gnd), floorRough: rough != null ? rough : 0.95, floorMetal: metal != null ? metal : 0.05,
    wallColor: skyHex(gnd.map((v) => v * 0.55)), wallRough: 0.85, wallMetal: 0.08 };
}
function arenaMood(theme) {
  if (theme === 'castle') {   // golden hour: low warm sun, long shadows, warm haze
    const zen = [0.14, 0.19, 0.34], hor = [0.50, 0.37, 0.28], gnd = [0.22, 0.19, 0.15];
    return {
      light: { sunAzim: 245, sunElev: 26, sunCol: [1, 0.72, 0.45], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 1.05, sunColor: 0xffd2a0, sunAzim: 245, sunElev: 26, sky: 0.35, skyColor: 0x92a6c8, ambient: 0.05,
        fogDensity: 0.005, fogColor: 0x8a7663, ssao: 0.95, exposure: 1.3, postBloom: 0.5, postVig: 0.34, postSat: 1.1,
        ...skyMood(zen, hor, gnd, 0.55, 1.5, 2.2), ...groundMood(gnd) } };
  }
  if (theme === 'volcanic') { // ashen overcast with ember accents
    const zen = [0.15, 0.145, 0.15], hor = [0.28, 0.25, 0.23], gnd = [0.16, 0.13, 0.10];
    return {
      light: { sunAzim: 130, sunElev: 38, sunCol: [1, 0.80, 0.60], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 0.75, sunColor: 0xffc9a0, sunAzim: 130, sunElev: 38, sky: 0.5, skyColor: 0x8e8d90, ambient: 0.06,
        fogDensity: 0.007, fogColor: 0x4a453f, ssao: 1.0, exposure: 1.25, postBloom: 0.7, postVig: 0.4, postSat: 1.04,
        ...skyMood(zen, hor, gnd, 0.8, 0.35, 1.2), ...groundMood(gnd, 0.9, 0.12) } };   // cooled lava keeps a faint sheen
  }
  if (theme === 'garden') {   // bright clear day; the ground bounce is green
    const zen = [0.18, 0.28, 0.50], hor = [0.38, 0.42, 0.48], gnd = [0.12, 0.18, 0.08];
    return {
      light: { sunAzim: 115, sunElev: 52, sunCol: [1, 0.94, 0.85], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 1.0, sunColor: 0xfff0da, sunAzim: 115, sunElev: 52, sky: 0.36, skyColor: 0xa5c0e0, ambient: 0.03,
        fogDensity: 0.004, fogColor: 0x9fb0c2, ssao: 0.85, exposure: 1.12, postBloom: 0.45, postVig: 0.3, postSat: 1.06,
        ...skyMood(zen, hor, gnd, 0.25, 0.9, 1.5), ...groundMood(gnd, 0.97, 0.0) } };   // turf is the most matte surface here
  }
  if (theme === 'desert') {   // high noon: a near-vertical sun, bleached shadows, dust haze.
    // The ground bounce is the loudest term in the whole rig here — sand throws a lot of warm light
    // back up, which is why desert shadows photograph open and golden rather than blue.
    const zen = [0.22, 0.34, 0.58], hor = [0.55, 0.52, 0.44], gnd = [0.42, 0.34, 0.22];
    return {
      light: { sunAzim: 160, sunElev: 72, sunCol: [1, 0.97, 0.9], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 1.25, sunColor: 0xfff6e2, sunAzim: 160, sunElev: 72, sky: 0.3, skyColor: 0xbcc9d8, ambient: 0.04,
        fogDensity: 0.0055, fogColor: 0xc2ab86, ssao: 0.9, exposure: 1.05, postBloom: 0.55, postVig: 0.36, postSat: 1.0,
        ...skyMood(zen, hor, gnd, 0.5, 1.1, 1.4), ...groundMood(gnd, 0.96, 0.0) } };   // sand: no specular at all
  }
  if (theme === 'frost') {    // late blue hour over snow: a low raking sun, everything else sky
    const zen = [0.20, 0.30, 0.55], hor = [0.42, 0.52, 0.68], gnd = [0.60, 0.64, 0.70];
    return {
      light: { sunAzim: 285, sunElev: 14, sunCol: [1, 0.85, 0.72], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 0.9, sunColor: 0xffdcbe, sunAzim: 285, sunElev: 14, sky: 0.55, skyColor: 0xb6cbe6, ambient: 0.05,
        fogDensity: 0.006, fogColor: 0xa9bdd4, ssao: 0.8, exposure: 1.2, postBloom: 0.6, postVig: 0.3, postSat: 0.94,
        ...skyMood(zen, hor, gnd, 0.45, 1.3, 2.0), ...groundMood(gnd, 0.8, 0.02) } };   // packed snow has a sheen
  }
  if (theme === 'facility') { // night on the pad: the sun is a rim light, the strips do the work
    const zen = [0.05, 0.07, 0.12], hor = [0.10, 0.14, 0.20], gnd = [0.10, 0.12, 0.14];
    return {
      light: { sunAzim: 40, sunElev: 12, sunCol: [0.62, 0.72, 0.9], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 0.4, sunColor: 0xa8c0e8, sunAzim: 40, sunElev: 12, sky: 0.2, skyColor: 0x2b3a4e, ambient: 0.05,
        fogDensity: 0.0075, fogColor: 0x16222e, ssao: 1.0, exposure: 1.35, postBloom: 0.95, postVig: 0.46, postSat: 1.12,
        ...skyMood(zen, hor, gnd, 0.3, 0.6, 1.6), ...groundMood(gnd, 0.7, 0.18) } };   // sealed apron: wet-looking
  }
  {                           // industrial: cool clear working day
    const zen = [0.16, 0.25, 0.45], hor = [0.34, 0.38, 0.45], gnd = [0.20, 0.21, 0.22];
    return {
      light: { sunAzim: 100, sunElev: 55, sunCol: [1, 0.95, 0.88], skyZen: zen, skyHor: hor, groundAlb: gnd },
      world: { sun: 1.1, sunColor: 0xfff2e0, sunAzim: 100, sunElev: 55, sky: 0.22, skyColor: 0xa8c2dd, ambient: 0.03,
        fogDensity: 0.0045, fogColor: 0x8d9aa8, ssao: 0.95, exposure: 1.15, postBloom: 0.5, postVig: 0.32, postSat: 1.08,
        ...skyMood(zen, hor, gnd, 0.3, 0.9, 1.5), ...groundMood(gnd, 0.9, 0.1) } };
  }
}
const ARENA_THEMES = ['industrial', 'castle', 'volcanic', 'garden', 'desert', 'frost', 'facility'];
function buildArena(seed, theme, size, footprint) {
  const rr = rng((seed * 9973 + 7) | 0);
  if (!ARENA_THEMES.includes(theme)) theme = ARENA_THEMES[(rr() * ARENA_THEMES.length) | 0];
  const FOOTPRINTS = ['square', 'cross', 'octagon', 'diagonal'];
  if (!FOOTPRINTS.includes(footprint)) footprint = (footprint === 'auto') ? FOOTPRINTS[(rr() * 4) | 0] : 'square';
  const W = size === 'small' ? 30 : size === 'large' ? 46 : 38;   // inner wall face at ±W
  const P = arenaPalette(theme);
  const WALL_H = 8 + ((rr() * 3) | 0), T = 0.5, MID = 4.5;
  const AV = [], SCANS = [], LATE = [];
  const reserve = (x0, z0, x1, z1) => AV.push([x0, z0, x1, z1]);
  // Wall-foot decoration (tumbled rock, snow banked against the wall) is chosen while the perimeter
  // is being dressed — long before the galleries, buildings and bases have reserved their ground.
  // Placed there and then, a boulder lands on a gallery ramp and shoves every bot that tries to
  // climb it. So the dressing only PROPOSES: each piece waits here with its radius and is dropped
  // later, once there is something to test it against.
  const later = (x, z, r, fn) => LATE.push([x, z, r, fn]);
  const scan = (ax, az, bx, bz) => SCANS.push([ax, az, bx, bz].map(v => +v.toFixed(1)));

  // ---- floor + perimeter wall, theme-dressed ----
  box(P.ground, -W - 1.5, -T, -W - 1.5, W + 1.5, 0, W + 1.5);
  box(P.wall, -W - 1.5, 0, -W - 1.5, W + 1.5, WALL_H, -W);
  box(P.wall, -W - 1.5, 0, W, W + 1.5, WALL_H, W + 1.5);
  box(P.wall, -W - 1.5, 0, -W, -W, WALL_H, W);
  box(P.wall, W, 0, -W, W + 1.5, WALL_H, W);
  if (P.dress === 'crenels') {
    for (let a = -W + 4; a <= W - 4; a += 2.4) {
      cbox(P.wall, a, WALL_H + 0.65, -W - 0.75, 1.1, 1.3, 1.4); cbox(P.wall, a, WALL_H + 0.65, W + 0.75, 1.1, 1.3, 1.4);
      cbox(P.wall, -W - 0.75, WALL_H + 0.65, a, 1.4, 1.3, 1.1); cbox(P.wall, W + 0.75, WALL_H + 0.65, a, 1.4, 1.3, 1.1);
    }
    for (const tx of [-W, W]) for (const tz of [-W, W]) cyl(P.wall, tx, tz, 0, WALL_H + 3.4, 4.2, 16);
  } else if (P.dress === 'buttress') {
    // build 1108: the buttresses stand fully INSIDE the wall face (centre 0.4 from it, half-depth
    // 0.4). At 0.35 they poked 5 cm into the wall volume, so their tops and the wall's top shared
    // both the plane y=WALL_H and a sliver of footprint — a thin coplanar strip that flashed.
    for (let a = -W + 8; a <= W - 8; a += 10) {
      cbox(P.pillar, a, WALL_H / 2, -W + 0.4, 1.4, WALL_H, 0.8); cbox(P.pillar, a, WALL_H / 2, W - 0.4, 1.4, WALL_H, 0.8);
      cbox(P.pillar, -W + 0.4, WALL_H / 2, a, 0.8, WALL_H, 1.4); cbox(P.pillar, W - 0.4, WALL_H / 2, a, 0.8, WALL_H, 1.4);
    }
    for (const sx of [1, -1]) pipe(P.parapet, 'z', -W + 6, W - 6, WALL_H - 1.3, sx * (W - 0.55), 0.22);
  } else if (P.dress === 'rubble') {
    const rb = rng(seed * 131 + 3);
    for (let q = 0; q < 10; q++) {                                  // tumbled rocks at the wall feet
      const a = rb() * Math.PI * 2, d = W - 1.6 - rb() * 1.2;
      const bx2 = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? Math.sign(Math.cos(a)) * d : (rb() * 2 - 1) * (W - 8);
      const bz2 = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (rb() * 2 - 1) * (W - 8) : Math.sign(Math.sin(a)) * d;
      const cy = 0.4 + rb() * 0.4, R = 1.0 + rb() * 1.1;
      later(bx2, bz2, R, () => boulder(P.cover, bx2, cy, bz2, R, seed * 17 + q));
    }
    box(P.trim, -W, 0, -W - 0.1, W, 0.35, -W + PROUD); box(P.trim, -W, 0, W - PROUD, W, 0.35, W + 0.1);   // ember seams (build 1108: proud, not flush)
  } else if (P.dress === 'ledges') {                                 // desert: stepped sandstone buttresses
    // Two-step corbels rather than one slab: a sandstone wall reads by its courses, and the setback
    // catches a hard shadow line under a near-vertical sun, which is the whole look of the theme.
    for (let a = -W + 7; a <= W - 7; a += 8.5) for (const [o, hw, hh] of [[0.55, 1.9, 0.62], [1.15, 1.2, 0.34]]) {
      cbox(P.parapet, a, WALL_H * hh, -W + o, hw, WALL_H * hh * 2, o * 2 - 0.06);
      cbox(P.parapet, a, WALL_H * hh, W - o, hw, WALL_H * hh * 2, o * 2 - 0.06);
      cbox(P.parapet, -W + o, WALL_H * hh, a, o * 2 - 0.06, WALL_H * hh * 2, hw);
      cbox(P.parapet, W - o, WALL_H * hh, a, o * 2 - 0.06, WALL_H * hh * 2, hw);
    }
    for (const sx of [1, -1]) for (const sz of [1, -1])              // braziers on the corners
      cyl(P.trim, sx * (W - 3.5), sz * (W - 3.5), 0.9, 1.2, 0.55, 10);
  } else if (P.dress === 'drifts') {                                 // frost: snow banked against the wall
    const rb = rng(seed * 137 + 5);
    for (let q = 0; q < 16; q++) {
      const a = rb() * Math.PI * 2, d = W - 1.2 - rb() * 1.4;
      const along = (rb() * 2 - 1) * (W - 6);
      const hor = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      const dx2 = hor ? Math.sign(Math.cos(a)) * d : along, dz2 = hor ? along : Math.sign(Math.sin(a)) * d;
      const cy = 0.15 + rb() * 0.3, R = 1.4 + rb() * 1.6;
      later(dx2, dz2, R, () => boulder(P.snow, dx2, cy, dz2, R, seed * 19 + q));
    }
    for (const sx of [1, -1]) for (const sz of [1, -1]) lamppost(P.parapet, P.trim, sx * (W - 3), sz * (W - 3), 0, 4.6, 0.9 * -sx);
  } else if (P.dress === 'ribs') {                                   // facility: structural ribs + light strips
    for (let a = -W + 6; a <= W - 6; a += 6) {
      for (const [sx2, sz2] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const cx2 = sz2 ? a : sx2 * (W - 0.45), cz2 = sz2 ? sz2 * (W - 0.45) : a;
        cbox(P.pillar, cx2, WALL_H / 2, cz2, sz2 ? 1.0 : 0.9, WALL_H, sz2 ? 0.9 : 1.0);
        cbox(P.trim, cx2, WALL_H - 1.4, cz2, sz2 ? 0.7 : 0.55, 0.18, sz2 ? 0.55 : 0.7);
      }
    }
    // a continuous strip at head height: the light that makes a night facility legible
    for (const s2 of [1, -1]) { box(P.trim, -W + 1, 2.6, s2 > 0 ? W - PROUD - 0.08 : -W + PROUD, W - 1, 2.78, s2 > 0 ? W - PROUD : -W + PROUD + 0.08);
      box(P.trim, s2 > 0 ? W - PROUD - 0.08 : -W + PROUD, 2.6, -W + 1, s2 > 0 ? W - PROUD : -W + PROUD + 0.08, 2.78, W - 1); }
  } else {                                                          // garden: capped brick + lantern posts
    // cap = four rim strips, MITRED (build 1108): the E/W strips stop where the N/S strips begin.
    // Overlapping them put two up-facing tops at the same height in each corner — coplanar, so the
    // GPU flipped between them as the camera moved.
    box(P.parapet, -W - 1.6, WALL_H, -W - 1.6, W + 1.6, WALL_H + 0.4, -W + 0.1);
    box(P.parapet, -W - 1.6, WALL_H, W - 0.1, W + 1.6, WALL_H + 0.4, W + 1.6);
    box(P.parapet, -W - 1.6, WALL_H, -W + 0.1, -W + 0.1, WALL_H + 0.4, W - 0.1);
    box(P.parapet, W - 0.1, WALL_H, -W + 0.1, W + 1.6, WALL_H + 0.4, W - 0.1);
    for (const sx of [1, -1]) for (const sz of [1, -1]) lamppost(P.parapet, P.trim, sx * (W - 3), sz * (W - 3), 0, 4.6, 0.9 * -sx);
  }
  // ---- trim pass: plinth, floor border, cornice. "Never let two materials meet naked" — the
  // wall-floor seam gets a darker plinth strip + a contrasting border band, and the wall top a
  // proud cornice line. This is most of what kills the blockout read.
  if (P.joinery) {                                                  // rock walls are organic, no joinery
    const PL = { concrete: { base: [0.35, 0.37, 0.39], rough: 0.98, scale: 3 }, metal: { base: [0.24, 0.27, 0.31], rough: 0.9, scale: 3 },
      sandRed: { base: [0.82, 0.7, 0.56], rough: 0.98, scale: 3 }, stone: { base: [0.72, 0.68, 0.62], rough: 0.98, scale: 3 } };
    const BD = { cobble: { base: [0.8, 0.78, 0.75] }, rock: { base: [0.66, 0.7, 0.78] } };
    const plinth = libMat(P.joinery[0], PL[P.joinery[0]]);
    const border = libMat(P.joinery[1], BD[P.joinery[1]]);
    // build 1108: every ring is MITRED — the E/W runs stop where the N/S runs begin. Overlapping
    // them stacked two identical up-facing tops in each corner (coplanar => the flashing patch).
    box(plinth, -W, 0, -W, W, 0.55, -W + 0.16); box(plinth, -W, 0, W - 0.16, W, 0.55, W);
    box(plinth, -W, 0, -W + 0.16, -W + 0.16, 0.55, W - 0.16); box(plinth, W - 0.16, 0, -W + 0.16, W, 0.55, W - 0.16);
    box(border, -W, 0, -W + 0.16, W, 0.045, -W + 0.85); box(border, -W, 0, W - 0.85, W, 0.045, W - 0.16);
    box(border, -W, 0, -W + 0.85, -W + 0.85, 0.045, W - 0.85); box(border, W - 0.85, 0, -W + 0.85, W, 0.045, W - 0.85);
    box(plinth, -W, WALL_H - 0.92, -W, W, WALL_H - 0.62, -W + 0.14); box(plinth, -W, WALL_H - 0.92, W - 0.14, W, WALL_H - 0.62, W);
    box(plinth, -W, WALL_H - 0.92, -W + 0.14, -W + 0.14, WALL_H - 0.62, W - 0.14); box(plinth, W - 0.14, WALL_H - 0.92, -W + 0.14, W, WALL_H - 0.62, W - 0.14);
  }
  // motivated weathering: leak streaks bleeding down from the cornice line
  for (const s of [1, -1]) { decal(P.D, s > 0 ? '-x' : '+x', s * (W - 0.05), WALL_H * 0.55, s * -14, 5, WALL_H * 0.7, DECAL.LEAK);
    decal(P.D, s > 0 ? '-z' : '+z', s * -19, WALL_H * 0.5, s * (W - 0.05), 4, WALL_H * 0.62, DECAL.LEAK); }

  // ---- central feature: deck | hill | plaza ----
  const cf = (rr() * 3) | 0;
  if (cf === 0) {          // raised deck on pillars, two point-symmetric ramps
    cbox(P.slab, 0, MID - T / 2, 0, 28, T, 20);
    for (const px of [-10, 10]) for (const pz of [-6, 6]) {
      cyl(P.pillar, px, pz, 0.25, MID - T, 0.9, 12);
      bevelCbox(P.pillar, px, 0.14, pz, 2.3, 0.28, 2.3);
    }
    ramp(P.ramp, 4, 10, 8, 22, 0, MID, 0, 'z');
    ramp(P.ramp, -8, -22, -4, -10, 0, 0, MID, 'z');
    reserve(-15, -11, 15, 11); reserve(3, 9, 9, 23); reserve(-9, -23, -3, -9);
    scan(6, 23, 6, 4); scan(-6, -23, -6, -4);
    for (const s of [1, -1]) {                                     // E/W edge parapets + glow
      box(P.parapet, s > 0 ? 14 : -14.3, MID, -10, s > 0 ? 14.3 : -14, MID + 1.15, 10);
      box(P.trim, s > 0 ? 14 : -14.3, MID + 1.15, -10, s > 0 ? 14.3 : -14, MID + 1.25, 10);
    }
    for (const [x0, x1, zs] of [[-14, 2, 1], [10, 14, 1], [-14, -10, -1], [-2, 14, -1]])
      box(P.parapet, x0, MID, zs * 10 - (zs > 0 ? 0 : 0.3), x1, MID + 1.15, zs * 10 + (zs > 0 ? 0.3 : 0));
    decal(P.D, 'up', 0, MID + 0.02, 0, 8, 8, DECAL.RING);
  } else if (cf === 1) {   // stepped hill: two tiers, E/W ramps to tier 1, N/S to tier 2
    box(P.slab, -13, 0, -12, 13, 2.25, 12);
    box(P.slab, -8, 2.25, -5, 8, MID - 0.14, 5);     // stone body: big shaded faces stay stone
    box(P.deck, -8, MID - 0.14, -5, 8, MID, 5);      // deck material as the walking cap only
    ramp(P.ramp, 13, -3, 22, 3, 0, 2.25, 0, 'x');
    ramp(P.ramp, -22, -3, -13, 3, 0, 0, 2.25, 'x');
    ramp(P.ramp, 2, 5, 6, 12, 2.25, MID, 2.25, 'z');
    ramp(P.ramp, -6, -12, -2, -5, 2.25, 2.25, MID, 'z');
    reserve(-14, -13, 14, 13); reserve(12, -4, 23, 4); reserve(-23, -4, -12, 4);
    scan(23, 0, 14, 0); scan(-23, 0, -14, 0);                      // ground -> tier-1 ramps
    scan(4, 11, 4, 6); scan(-4, -11, -4, -6);                      // tier-1 -> summit ramps
    decal(P.D, 'up', 0, MID + 0.02, 0, 7, 7, DECAL.RING);
  } else {                 // plaza: walkable plinth with a theme centrepiece + diagonal baffles
    cbox(P.slab, 0, 0.25, 0, 9, 0.5, 9);
    if (P.plaza === 'boulders') { boulder(P.cover, 0, 1.4, 0, 1.9, seed * 5 + 1); boulder(P.cover, 0.9, 2.6, -0.5, 1.1, seed * 5 + 2);
      box(P.trim, -1.6, 0.5, -1.6, 1.6, 0.62, 1.6); }
    else if (P.plaza === 'mast') { cyl(P.pillar, 0, 0, 0.5, 5.4, 0.85, 12); cbox(P.trim, 0, 5.6, 0, 1.4, 0.35, 1.4); }
    else if (P.plaza === 'core') {                                   // facility: a lit reactor column
      cyl(P.pillar, 0, 0, 0.5, 1.1, 2.2, 14);
      cyl(P.trim, 0, 0, 1.1, 4.6, 1.5, 14);
      cyl(P.pillar, 0, 0, 4.6, 5.4, 1.9, 14, 1.2);
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + 0.78;
        cbox(P.parapet, Math.cos(a) * 3.1, 1.5, Math.sin(a) * 3.1, 0.5, 3, 0.5); }
    }
    else if (P.plaza === 'cairn') {                                  // frost: a stack under a snow cap
      for (const [cy, r2, sd] of [[0.9, 1.7, 1], [2.2, 1.25, 2], [3.2, 0.8, 3]]) boulder(P.cover2, 0, cy, 0, r2, seed * 5 + sd);
      boulder(P.snow, 0, 3.9, 0, 0.75, seed * 5 + 4);
      box(P.trim, -1.9, 0.5, -1.9, 1.9, 0.6, 1.9);
    }
    else { box(libMat('tiles'), -2.6, 0.5, -2.6, 2.6, 0.62, 2.6);    // monument: a plinth and a column
      cyl(libMat('marble'), 0, 0, 0.6, 2.7, 0.62, 12); bevelCbox(libMat('marble'), 0, 2.85, 0, 1.0, 0.3, 1.0); }
    for (const s of [1, -1]) { box(P.parapet, s * 6, 0.5, s * -9, s * 9 + (s > 0 ? 0.45 : -0.45), 1.6, s * -6);
      box(P.parapet, s * -9, 0.5, s * 6, s * -6, 1.6, s * 9 + (s > 0 ? 0.45 : -0.45)); }
    reserve(-10, -10, 10, 10);
    decal(P.D, 'up', 0, 0.52, 0, 8.5, 8.5, DECAL.RING);
  }

  // ---- side structures along E/W: galleries | buildings | open yards ----
  let ss = (rr() * 3) | 0;
  if (ss === 1 && W < 36) ss = 0;                                  // buildings need elbow room
  if (ss === 0) {          // wall galleries with end ramps
    const G = 3.6, gz = Math.min(20, W - 22);
    for (const s of [1, -1]) {
      const gx0 = s > 0 ? W - 6 : -W, gx1 = s > 0 ? W : -W + 6;
      box(P.slab, gx0, G - T, -gz, gx1, G, gz);
      ramp(P.ramp, gx0 + 0.5, gz, gx1 - 0.5, gz + 10, 0, G, 0, 'z');
      ramp(P.ramp, gx0 + 0.5, -gz - 10, gx1 - 0.5, -gz, 0, 0, G, 'z');
      const ix = s > 0 ? W - 6 : -W + 6;                           // inner edge parapet, gapped mid
      for (const [z0, z1] of [[-gz, -3], [3, gz]]) {
        box(P.parapet, ix - (s > 0 ? 0.3 : 0), G, z0, ix + (s > 0 ? 0 : 0.3), G + 1.15, z1);
        box(P.trim, ix - (s > 0 ? 0.3 : 0), G + 1.15, z0, ix + (s > 0 ? 0 : 0.3), G + 1.25, z1);
      }
      reserve(Math.min(gx0, gx1) - 1, -gz - 11, Math.max(gx0, gx1) + 1, gz + 11);
      scan(s * (W - 3), gz + 9, s * (W - 3), 0);
    }
  } else if (ss === 1) {   // build 1111/1113: real BUILDINGS — rooms, doorways, lit interiors,
    // and, half the time, a second storey reached by the switchback stairwell inside. Build 1112
    // shipped that stairwell disabled because the probe found bots shoved at all 31 sample points;
    // build 1113 found why (the lanes were narrower than the engine's collider grid allows — see
    // BOT_LANE) and turned it on.
    const twoUp = rr() < 0.5;
    const STO = 3.7, bzE = ((rr() * 10) | 0) - 5;
    const bx = W - 10.5, WH2 = twoUp ? STO * 2 : 4.6;
    for (const s of [1, -1]) {
      const cx2 = s * bx, cz2 = s * bzE;
      // deep enough (20) that the stairwell still gets a real flight between its two landings: the
      // landings cost RB_LAND each, and what is left has to hold 3.7 of rise under the ramp limit
      const x0 = cx2 - 8, x1 = cx2 + 8, z0 = cz2 - 10, z1 = cz2 + 10;
      const xd = s > 0 ? x0 : x1;                                  // door face looks at the courtyard
      // the stair bay sits on the SAME face as the entrance, so both copies of the pair present the
      // same face to the middle of the map — a 180°-symmetric arena cannot put one team's stairs on
      // the courtyard and the other's against the perimeter wall
      const rooms = roomBlock(P.wall, libMat('plankGrey'), P.trim, x0, z0, x1, z1, 0, twoUp ? STO : 4.6,
        (seed * 97 + s * 13) | 0, { entrance: s > 0 ? '-x' : '+x', depth: 2, minRoom: 5.5,
          storeys: twoUp ? 2 : 1, baySide: s > 0 ? '-x' : '+x',
          lightCol: P.lightCol });
      // furnish: a crate in the largest room, so the interior is worth entering
      const big = rooms.slice().sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
      if (big) bevelCbox(P.cover, (big.x0 + big.x1) / 2, 0.74, (big.z0 + big.z1) / 2, 1.24, 1.24, 1.24, true);
      let rz0, rz1;
      if (twoUp) {
        // no outside ramp: 7.75 of rise would need a 18-unit run. The internal stairs go all the
        // way to the roof, so the height advantage is earned by going INSIDE.
        rz0 = z0; rz1 = z1;
        for (const sc of rooms.stairScans) scan(...sc);            // every flight and every landing
      } else {
        rz0 = s > 0 ? z1 + 0.45 : z0 - 12.45; rz1 = s > 0 ? z1 + 12.45 : z0 - 0.45;
        ramp(P.ramp, cx2 - 1.8, rz0, cx2 + 1.8, rz1, 0, s > 0 ? WH2 + 0.35 : 0, s > 0 ? 0 : WH2 + 0.35, 'z');
        scan(cx2, s > 0 ? rz1 + 1 : rz0 - 1, cx2, s > 0 ? rz0 - 10 : rz1 + 10);
      }
      box(P.parapet, xd - (s > 0 ? 0.45 : -0.45) * 0.66, WH2 + 0.35, z0 - 0.45, xd + (s > 0 ? 0 : 0.45) * 0.66, WH2 + 1.5, z1 + 0.45);
      sign(s > 0 ? '-x' : '+x', xd + (s > 0 ? -0.5 : 0.5), 3.95, cz2, 0.62, P.depot, P.signC);
      reserve(x0 - 1.4, Math.min(rz0, z0) - 1, x1 + 1.4, Math.max(rz1, z1) + 1);
    }
  } else {                 // open yards: big theme cover at mid-wall
    for (const s of [1, -1]) {
      const yx = s * (W - 7), yz = s * 4;
      if (P.yard === 'containers') { container(s > 0 ? libMat('paintRed') : libMat('paintGreen'), P.pillar, yx, yz, 0, 'z');
        container(P.cover2 === P.cover ? P.cover : libMat('corrugated'), P.pillar, yx - s * 3.5, yz - s * 7, 0, 'x'); }
      else if (P.yard === 'boulders') { boulder(P.cover, yx, 1.1, yz, 2.1, seed * 23 + s * 3); boulder(P.cover, yx - s * 2.4, 0.7, yz - s * 3.4, 1.3, seed * 23 + s * 5); }
      else if (P.yard === 'crates') {                                // desert: a stores dump under an awning
        for (const [ox, oz, hy] of [[0, 0, 0.9], [2.3, -1.1, 0.9], [1.1, 0.9, 2.5]])
          bevelCbox(P.cover, yx + s * ox, hy, yz + s * oz, 1.7, 1.7, 1.7, true);
        for (const px of [-2.2, 2.2]) for (const pz of [-2.2, 2.2]) cbox(P.cover2, yx + px, 1.8, yz + pz, 0.25, 3.6, 0.25);
        box(P.cover2, yx - 2.5, 3.6, yz - 2.5, yx + 2.5, 3.75, yz + 2.5);
      }
      else { for (const px of [-1.6, 1.6]) for (const pz of [-1.2, 1.2]) cbox(P.cover2, yx + px, 1.3, yz + pz, 0.22, 2.6, 0.22);
        ramp(P.cover, yx - 2, yz - 1.7, yx + 2, yz + 1.7, 2.5, 3.15, 2.65, 'z');
        cyl(P.cover2, yx - 1, yz + 0.8, 0, 1.25, 0.52, 10); bevelCbox(P.cover, yx + 0.9, 0.5, yz - 0.6, 1.0, 1.0, 1.0, true); }
      reserve(yx - 5, yz - 5, yx + 5, yz + 5);
    }
  }

  // ---- team bases N/S: apron cover walls, colour band, sign ----
  mirrored((xz, team) => {
    const south = xz(0, 1)[1] > 0, zs = south ? [W - 9, W - 8] : [-(W - 8), -(W - 9)];
    const tm = team({ a: P.teamA, b: P.teamB });
    for (const [x0, x1] of [[-12, -4], [-1.5, 1.5], [4, 12]]) box(P.parapet, x0, 0, zs[0], x1, 1.2, zs[1]);
    box(tm, -12, 1.2, zs[0], 12, 1.35, zs[1]);
    // build 1108: PROUD of the wall face by PROUD, never flush with it. A band whose visible face
    // sat exactly on the wall plane z-fought with it: identical depth, so the two surfaces swapped
    // in patches as the camera moved (the "flashing overlapping mesh"). Same rule as the decals.
    box(tm, -14, WALL_H * 0.4, south ? W - PROUD : -W - 0.15, 14, WALL_H * 0.4 + 1.1, south ? W + 0.15 : -W + PROUD);
    sign(south ? '-z' : '+z', 0, 3.4, south ? W - 0.04 : -W + 0.04, 1.3, south ? 'BASE 1' : 'BASE 2', P.signC);
  });
  reserve(-13, W - 10, 13, W); reserve(-13, -W, 13, -W + 10);

  // ---- footprint: the play space need not be a square (build 1110) ----
  // Corner masses in the wall material, capped at wall height, carve a cross / octagon / diagonal
  // out of the square, always 180°-symmetric so neither team gets the long straw.
  // Placed HERE, after the central feature, side structures and bases have reserved their
  // footprints, and each candidate mass is shrunk until it clears them — otherwise a large arena's
  // gallery ramp (which reaches |z| = 30) would end up buried inside a corner block: an unwalkable
  // ramp and a pile of coincident faces. If even the smallest mass would collide, that corner is
  // simply left square.
  if (footprint !== 'square') {
    const corners = footprint === 'diagonal' ? [[1, 1], [-1, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const C0 = Math.round(W * (footprint === 'diagonal' ? 0.5 : footprint === 'cross' ? 0.42 : 0.36));
    const rect = (sx, sz, ax, bx, az, bz) => [
      Math.min(sx * (W - ax), sx * (W - bx)), Math.min(sz * (W - az), sz * (W - bz)),
      Math.max(sx * (W - ax), sx * (W - bx)), Math.max(sz * (W - az), sz * (W - bz))];
    const stepsFor = (C) => footprint === 'octagon'
      ? [[C, C * 2 / 3, C / 3, 0], [C * 2 / 3, C / 3, C * 2 / 3, 0], [C / 3, 0, C, 0]]   // disjoint 3-step chamfer
      : [[C, 0, C, 0]];
    const hits = (r) => AV.some(a => r[0] < a[2] + 1 && r[2] > a[0] - 1 && r[1] < a[3] + 1 && r[3] > a[1] - 1);
    for (const [sx, sz] of corners) {
      let C = 0;
      for (const f of [1, 0.75, 0.5]) {                 // shrink until the corner is clear
        const c = C0 * f;
        if (!stepsFor(c).some(s => hits(rect(sx, sz, ...s)))) { C = c; break; }
      }
      if (!C) continue;
      for (const s of stepsFor(C)) {
        const r = rect(sx, sz, ...s);
        box(P.wall, r[0], 0, r[1], r[2], WALL_H, r[3]);
        reserve(r[0] - 1.5, r[1] - 1.5, r[2] + 1.5, r[3] + 1.5);
      }
    }
  }

  // ---- garden paths (before cover, so lanes stay clear) ----
  if (P.path != null) {
    box(P.path, -2.2, 0, -W + 1, 2.2, 0.06, W - 1);
    box(P.path, -W + 1, 0, -2.2, W - 1, 0.06, 2.2);
    reserve(-2.6, -W, 2.6, W); reserve(-W, -2.6, W, 2.6);
  }

  // ---- the deferred wall-foot decoration, now that there is something to test against ----
  for (const [lx, lz, lr, fn] of LATE) {
    if (AV.some(a => lx > a[0] - lr && lx < a[2] + lr && lz > a[1] - lr && lz < a[3] + lr)) continue;
    fn(); reserve(lx - lr * 0.7, lz - lr * 0.7, lx + lr * 0.7, lz + lr * 0.7);
  }

  // ---- seeded mirrored cover, rejection-sampled against everything reserved ----
  const rc = rng((seed * 613 + 29) | 0);
  const nCover = W > 40 ? 7 : 5;
  let placed = 0, guard = 0;
  while (placed < nCover && guard++ < 90) {
    const sx = (rc() * 2 - 1) * (W - 6), sz = (rc() * 2 - 1) * (W - 13);
    // BOTH copies are tested, not just the candidate. The reserved rects are only approximately
    // point-symmetric — a footprint corner mass shrinks per corner, and the two side buildings carry
    // their own seeds — so a position clear on one side could put its mirror image inside a ramp
    // mouth. That is exactly what dropped a stacked crate across the west tier-1 ramp on large
    // stepped-hill arenas while the east ramp stayed clean.
    const clear = (px, pz) => !AV.some(r => px > r[0] - 1.8 && px < r[2] + 1.8 && pz > r[1] - 1.8 && pz < r[3] + 1.8);
    if (!clear(sx, sz) || !clear(-sx, -sz)) continue;
    const stack = rc() < 0.4, kind = rc();
    for (const [x, z] of [[sx, sz], [-sx, -sz]]) {
      if (P.yard === 'boulders' && P.foliage !== 'frozen') boulder(kind < 0.5 ? P.cover : P.cover2, x, 0.7, z, 1.2 + kind, seed * 7 + placed * 3 + (x > 0 ? 1 : 0));
      else {
        bevelCbox(kind < 0.5 ? P.cover : P.cover2, x, 0.85, z, 2, 1.7, 2, true);
        if (stack) bevelCbox(kind < 0.5 ? P.cover2 : P.cover, x + 0.15, 2.4, z - 0.1, 1.4, 1.4, 1.4, true);
      }
      decal(P.D, 'up', x + 0.4, 0.03, z - 0.3, 3.2, 3.2, DECAL.OIL, (placed & 1) * 90);
    }
    reserve(sx - 1.6, sz - 1.6, sx + 1.6, sz + 1.6); reserve(-sx - 1.6, -sz - 1.6, -sx + 1.6, -sz + 1.6);
    placed++;
  }

  // ---- foliage: the theme decides how alive the arena is ----
  const F = P.foliage;
  if (F === 'lush') {
    const rt = rng((seed * 389 + 5) | 0);
    let trees = 0, tg = 0;                                          // mirrored tree pairs in planters
    while (trees < 3 && tg++ < 40) {
      const tx = (rt() * 2 - 1) * (W - 8), tz = (rt() * 2 - 1) * (W - 14);
      if (AV.some(r => tx > r[0] - 2.2 && tx < r[2] + 2.2 && tz > r[1] - 2.2 && tz < r[3] + 2.2)) continue;
      for (const [x, z] of [[tx, tz], [-tx, -tz]]) {
        box(P.wall, x - 1.5, 0, z - 1.5, x + 1.5, 0.5, z + 1.5);
        (rt() < 0.5 ? tree : conifer)(libMat('bark'), libMat('leaves'), x, z, 0.5, (seed * 41 + trees * 9 + (x > 0 ? 1 : 0)) | 0);
      }
      reserve(tx - 2, tz - 2, tx + 2, tz + 2); reserve(-tx - 2, -tz - 2, -tx + 2, -tz + 2);
      trees++;
    }
    scatterFoliage(P.grassM, -W + 1.5, -W + 1.5, W - 1.5, W - 1.5, (W * W / 5) | 0, (seed * 3 + 11) | 0,
      { flowerM: P.flowerM, avoid: AV, sMin: 0.7, sMax: 1.45,
        alts: [libMat('grassCard', { base: [0.84, 0.96, 0.7] }), libMat('grassCard', { base: [1, 0.93, 0.78] })] });
  } else if (F === 'patchy') {                                      // castle: green creeps in at the edges
    for (const [x0, z0, x1, z1] of [[-W + 1, -W + 1, W - 1, -W + 7], [-W + 1, W - 7, W - 1, W - 1],
                                    [-W + 1, -W + 7, -W + 7, W - 7], [W - 7, -W + 7, W - 1, W - 7]])
      scatterFoliage(P.grassM, x0, z0, x1, z1, ((x1 - x0) * (z1 - z0) / 14) | 0, (seed * 3 + 13) | 0,
        { flowerM: P.flowerM, flowerFrac: 0.12, avoid: AV, sMin: 0.55, sMax: 1.0 });
  } else if (F === 'scorched') {                                    // volcanic: dry reeds + dead trees
    const rd = rng(seed * 57 + 1);
    for (const s of [1, -1]) deadTree(libMat('bark'), s * (W - 12), s * -(W - 16), 0, seed * 61 + s);
    scatterFoliage(P.reedM, -W + 2, -W + 2, W - 2, W - 2, W | 0, (seed * 3 + 17) | 0,
      { avoid: AV, sMin: 0.5, sMax: 0.9 });
    if (P.lava != null) for (const s of [1, -1]) {                  // corner lava pools (visual)
      box(P.lava, s * (W - 9), 0.02, s * (W - 9), s * (W - 3), 0.1, s * (W - 3));
      reserve(Math.min(s * (W - 9), s * (W - 3)), Math.min(s * (W - 9), s * (W - 3)),
        Math.max(s * (W - 9), s * (W - 3)), Math.max(s * (W - 9), s * (W - 3)));
    }
  } else if (F === 'dunes') {                                       // desert: drifted sand and dry scrub
    const rs = rng(seed * 71 + 3), bark3 = libMat('bark', { base: [0.86, 0.78, 0.62] });
    for (const s of [1, -1]) {                                      // sand piled into the lee corners
      for (let q = 0; q < 4; q++) boulder(P.ground, s * (W - 4 - rs() * 7), 0.1 + rs() * 0.25, s * -(W - 4 - rs() * 7),
        1.8 + rs() * 2.2, seed * 29 + q * 5 + (s > 0 ? 1 : 0));
      deadTree(bark3, s * (W - 13), s * -(W - 17), 0, seed * 67 + s);
    }
    scatterFoliage(P.reedM, -W + 2, -W + 2, W - 2, W - 2, (W / 1.5) | 0, (seed * 3 + 29) | 0,
      { avoid: AV, sMin: 0.4, sMax: 0.75 });
  } else if (F === 'frozen') {                                      // frost: bare conifers and dry reeds
    const rf = rng(seed * 83 + 7);
    // hoisted: libMat(id, override) mints a NEW material every call, so asking for the same tinted
    // bark inside the loop would emit one material (and one primitive) per tree
    const bark2 = libMat('bark', { base: [0.6, 0.58, 0.58] }), leaf2 = libMat('leaves', { base: [0.62, 0.72, 0.7] });
    let trees = 0, tg = 0;
    while (trees < 3 && tg++ < 40) {
      const tx = (rf() * 2 - 1) * (W - 8), tz = (rf() * 2 - 1) * (W - 14);
      if (AV.some(r => tx > r[0] - 2.2 && tx < r[2] + 2.2 && tz > r[1] - 2.2 && tz < r[3] + 2.2)) continue;
      for (const [x, z] of [[tx, tz], [-tx, -tz]]) {
        conifer(bark2, leaf2, x, z, 0, (seed * 43 + trees * 9 + (x > 0 ? 1 : 0)) | 0);
        boulder(P.snow, x, 0.12, z, 1.5 + rf() * 0.8, seed * 47 + trees * 3 + (x > 0 ? 1 : 0));   // snow round its foot
      }
      reserve(tx - 2, tz - 2, tx + 2, tz + 2); reserve(-tx - 2, -tz - 2, -tx + 2, -tz + 2);
      trees++;
    }
    scatterFoliage(P.reedM, -W + 2, -W + 2, W - 2, W - 2, (W / 2) | 0, (seed * 3 + 31) | 0,
      { avoid: AV, sMin: 0.35, sMax: 0.65 });
  } else if (F === 'none') {                                        // facility: swept, nothing grows
    for (const s of [1, -1]) decal(P.D, 'up', s * (W - 9), 0.03, s * -(W - 12), 5, 4.4, DECAL.LINE, s > 0 ? 0 : 180);
  } else {                                                          // industrial: weeds in the seams
    scatterFoliage(P.reedM, -W + 1, -W + 1, W - 1, -W + 3, 8, seed * 3 + 19, { sMin: 0.4, sMax: 0.7 });
    scatterFoliage(P.reedM, -W + 1, W - 3, W - 1, W - 1, 8, seed * 3 + 23, { sMin: 0.4, sMax: 0.7 });
  }

  // ---- signage + ramp-foot chevrons ----
  const N1 = P.names;
  const N2 = ['YARD', 'RING', 'COURT', 'CROSS', 'HOLLOW', 'RUN'];
  const arenaName = N1[(rr() * N1.length) | 0] + ' ' + N2[(rr() * N2.length) | 0];
  sign('-x', W - 0.04, WALL_H * 0.62, 0, 1.2, arenaName, P.signC);
  for (const sc of SCANS.slice(0, 2)) decal(P.D, 'up', sc[0], 0.03, sc[1], 3.2, 2.8, DECAL.CHEV, Math.abs(sc[1]) > Math.abs(sc[0]) ? (sc[1] > 0 ? 0 : 180) : (sc[0] > 0 ? 90 : 270));

  const MOOD = arenaMood(theme);
  // Where a player belongs. An arena is not a prop: dropped at the origin it puts its CENTRE at the
  // level's default spawn, and every footprint this generator builds puts a structure there — KILN
  // RUN's central mass has its underside at y 2.25, so a 1.7-high player spawned at (0,0) stands in
  // a 0.55 m undercroft, sealed from the sun, looking at the inside of a rock. That is what every
  // generated-arena screenshot was until this build. The two base rooms (z = ±(W-4), reserved by
  // the team-base pass and open to the sky) are where a match actually starts, so say so and let
  // the editor put the player there. Ordered: [0] is BASE 1, [1] is BASE 2.
  return { name: `${arenaName} (seed ${seed} · ${theme} · ${size}${footprint !== 'square' ? ' · ' + footprint : ''})`,
    scans: SCANS, spawns: [[0, W - 4], [0, -(W - 4)]], light: MOOD.light, world: MOOD.world };
}

// -------------------------------------------------------------- baked lighting (AO) ----
// Texel-level ambient occlusion, raytraced at build time against the level's own solids and
// baked into a LIGHTMAP: every face gets its own cell in an atlas (8x8 interior + 1px gutter),
// addressed by a second UV set and wired as glTF occlusionTexture/texCoord 1 — which three.js
// maps to aoMap. Physically nicer than the old per-vertex COLOR_0 bake it replaces: texture-
// resolution gradients, and AO no longer darkens direct sunlight, only ambient.
// A uniform XZ grid over the solids accelerates the rays (2D DDA); without it a full level
// bake is minutes, with it seconds.
let LM = null;   // { px: Float64Array A*A*3 (linear RGB), A, intensity } after bake
function bakeLightmap(light) {
  if (!PATCHES.length) return;
  // build 1095 pipeline: this is no longer an AO bake — it is an RGB *radiance* bake of the
  // indirect light: coloured sky visibility (blue-grey shade) + one bounce of sun off the ground
  // (warm up-light), with short-range contact occlusion folded in. The engine moves it from
  // aoMap to lightMap (extras.rumpusLightmap) and the dynamic sun supplies direct light and
  // shadows on top — the classic baked-GI / dynamic-key split.
  const LR = light || {};
  const azr = ((LR.sunAzim == null ? 110 : LR.sunAzim) * Math.PI) / 180;
  const elr = ((LR.sunElev == null ? 48 : LR.sunElev) * Math.PI) / 180;
  const sunD = [Math.sin(azr) * Math.cos(elr), Math.sin(elr), Math.cos(azr) * Math.cos(elr)];
  const sunC = LR.sunCol || [1.0, 0.93, 0.84];          // warm key for the bounce
  const zen  = LR.skyZen || [0.16, 0.24, 0.42];         // cool fill from above...
  const hor  = LR.skyHor || [0.30, 0.34, 0.42];         // ...brightening toward the horizon
  const gAlb = LR.groundAlb || [0.22, 0.20, 0.15];      // what the ground bounces
  const wAlb = LR.wallAlb || [0.30, 0.29, 0.27];        // what walls bounce
  const skyAvg = [(zen[0] + hor[0]) / 2, (zen[1] + hor[1]) / 2, (zen[2] + hor[2]) / 2];
  const CELL = 10, INT = 8;
  const perRow1 = Math.floor(1024 / CELL);
  const A = PATCHES.length <= perRow1 * perRow1 ? 1024 : 2048;
  const perRow = Math.floor(A / CELL);
  if (PATCHES.length > perRow * perRow) throw new Error('lightmap atlas overflow: ' + PATCHES.length);
  LM = { px: new Float64Array(A * A * 3).fill(1), A, intensity: 1 };
  // ---- acceleration grid over XZ ----
  let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
  for (const b of SOLIDS) { mnx = Math.min(mnx, b[0]); mnz = Math.min(mnz, b[2]); mxx = Math.max(mxx, b[3]); mxz = Math.max(mxz, b[5]); }
  const GC = 7, GW = Math.max(1, Math.ceil((mxx - mnx) / GC)), GH = Math.max(1, Math.ceil((mxz - mnz) / GC));
  const gcell = Array.from({ length: GW * GH }, () => []);
  SOLIDS.forEach((b, si) => {
    const x0 = Math.max(0, ((b[0] - mnx) / GC) | 0), x1 = Math.min(GW - 1, ((b[3] - mnx) / GC) | 0);
    const z0 = Math.max(0, ((b[2] - mnz) / GC) | 0), z1 = Math.min(GH - 1, ((b[5] - mnz) / GC) | 0);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) gcell[gz * GW + gx].push(si);
  });
  const stamp = new Int32Array(SOLIDS.length).fill(-1);
  let raySerial = 0;
  const MAXT = 10;
  const slab = (b, ox, oy, oz, dx, dy, dz, tMax) => {
    let t0 = 0.05, t1 = tMax;
    for (let a2 = 0; a2 < 3; a2++) {
      const o = a2 === 0 ? ox : a2 === 1 ? oy : oz, d = a2 === 0 ? dx : a2 === 1 ? dy : dz;
      const mn = b[a2], mx = b[a2 + 3];
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return Infinity; continue; }
      let ta = (mn - o) / d, tb = (mx - o) / d;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return Infinity;
    }
    return t0;
  };
  const rayT = (ox, oy, oz, dx, dy, dz) => {   // distance to nearest hit; MAXT if clear
    raySerial++;
    let best = MAXT;
    let gx = ((ox - mnx) / GC) | 0, gz = ((oz - mnz) / GC) | 0;
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : (((gx + (dx > 0 ? 1 : 0)) * GC + mnx) - ox) / dx;
    let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : (((gz + (dz > 0 ? 1 : 0)) * GC + mnz) - oz) / dz;
    const tDX = Math.abs(GC / (dx || 1e-9)), tDZ = Math.abs(GC / (dz || 1e-9));
    let t = 0;
    for (let it = 0; it < 12 && t < best; it++) {
      if (gx >= 0 && gx < GW && gz >= 0 && gz < GH) {
        for (const si of gcell[gz * GW + gx]) {
          if (stamp[si] === raySerial) continue;
          stamp[si] = raySerial;
          const th2 = slab(SOLIDS[si], ox, oy, oz, dx, dy, dz, best);
          if (th2 < best) best = th2;
        }
      }
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDX; gx += stepX; }
      else { t = tMaxZ; tMaxZ += tDZ; gz += stepZ; }
      if ((gx < 0 && stepX < 0) || (gx >= GW && stepX > 0)) break;
      if ((gz < 0 && stepZ < 0) || (gz >= GH && stepZ > 0)) break;
    }
    return best;
  };
  const DIRS = [];
  for (let q = 0; q < 32; q++) {
    const t2 = (q + 0.5) / 32, ph = Math.acos(1 - 2 * t2), th3 = q * 2.399963;
    DIRS.push([Math.sin(ph) * Math.cos(th3), Math.cos(ph), Math.sin(ph) * Math.sin(th3)]);
  }
  // ---- bake every patch into its cell ----
  PATCHES.forEach((pt, pi) => {
    const p = prim(pt.m);
    if (!p.uv2) p.uv2 = new Float64Array(p.pos.length / 3 * 2).fill(0);
    const cx = (pi % perRow) * CELL, cy = ((pi / perRow) | 0) * CELL;
    const V = [];
    for (let q = 0; q < pt.n; q++) V.push([p.pos[(pt.base + q) * 3], p.pos[(pt.base + q) * 3 + 1], p.pos[(pt.base + q) * 3 + 2]]);
    const nx = p.nrm[pt.base * 3], ny = p.nrm[pt.base * 3 + 1], nz = p.nrm[pt.base * 3 + 2];
    // uv2: interior rect (quads) or interior right triangle (tris), half-texel inset
    if (pt.n === 4) {
      const u0 = (cx + 1) / A, v0 = (cy + 1) / A, u1 = (cx + 1 + INT) / A, v1 = (cy + 1 + INT) / A;
      const UV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (let q = 0; q < 4; q++) { p.uv2[(pt.base + q) * 2] = UV[q][0]; p.uv2[(pt.base + q) * 2 + 1] = UV[q][1]; }
    } else {
      const UV = [[(cx + 1) / A, (cy + 1) / A], [(cx + 1 + INT) / A, (cy + 1) / A], [(cx + 1) / A, (cy + 1 + INT) / A]];
      for (let q = 0; q < 3; q++) { p.uv2[(pt.base + q) * 2] = UV[q][0]; p.uv2[(pt.base + q) * 2 + 1] = UV[q][1]; }
    }
    const downFacing = ny < -0.75;
    for (let j = 1; j <= INT; j++) for (let i2 = 1; i2 <= INT; i2++) {   // pass 1: interior
      { const fi = i2, fj = j;
        const oi = ((cy + j) * A + cx + i2) * 3;
        if (downFacing) {   // undersides: dim ground bounce, slightly warm
          LM.px[oi] = skyAvg[0] * 0.28 + gAlb[0] * 0.30; LM.px[oi + 1] = skyAvg[1] * 0.28 + gAlb[1] * 0.30; LM.px[oi + 2] = skyAvg[2] * 0.28 + gAlb[2] * 0.30;
          continue;
        }
        const fu = (fi - 0.5) / INT, fv = (fj - 0.5) / INT;
        let px2, py2, pz2;
        if (pt.n === 4) {
          const ax2 = V[0][0] + (V[1][0] - V[0][0]) * fu, ay2 = V[0][1] + (V[1][1] - V[0][1]) * fu, az2 = V[0][2] + (V[1][2] - V[0][2]) * fu;
          const bx2 = V[3][0] + (V[2][0] - V[3][0]) * fu, by2 = V[3][1] + (V[2][1] - V[3][1]) * fu, bz2 = V[3][2] + (V[2][2] - V[3][2]) * fu;
          px2 = ax2 + (bx2 - ax2) * fv; py2 = ay2 + (by2 - ay2) * fv; pz2 = az2 + (bz2 - az2) * fv;
        } else {
          let wu = fu, wv = fv;
          if (wu + wv > 1) { const ex = (wu + wv - 1) / 2; wu -= ex; wv -= ex; }   // clamp to the triangle
          px2 = V[0][0] + (V[1][0] - V[0][0]) * wu + (V[2][0] - V[0][0]) * wv;
          py2 = V[0][1] + (V[1][1] - V[0][1]) * wu + (V[2][1] - V[0][1]) * wv;
          pz2 = V[0][2] + (V[1][2] - V[0][2]) * wu + (V[2][2] - V[0][2]) * wv;
        }
        const ox = px2 + nx * 0.06, oy = py2 + ny * 0.06, oz = pz2 + nz * 0.06;
        let r = 0, g2 = 0, b2 = 0, wsum = 0, contact = 0;
        for (const d of DIRS) {
          const dt = d[0] * nx + d[1] * ny + d[2] * nz;
          if (dt < 0.12) continue;
          wsum += dt;
          const t = rayT(ox, oy, oz, d[0], d[1], d[2]);
          if (t >= MAXT) {
            if (d[1] >= 0) {           // open sky: gradient by elevation
              const f = d[1];
              r += dt * (hor[0] + (zen[0] - hor[0]) * f); g2 += dt * (hor[1] + (zen[1] - hor[1]) * f); b2 += dt * (hor[2] + (zen[2] - hor[2]) * f);
            } else {                   // escaped below the horizon: distant sunlit ground
              r += dt * gAlb[0] * sunC[0] * 0.8; g2 += dt * gAlb[1] * sunC[1] * 0.8; b2 += dt * gAlb[2] * sunC[2] * 0.8;
            }
          } else {
            if (t < 1.4) contact += dt * (1 - t / 1.4);   // short-range hit doubles as cavity/contact AO
            // one bounce: is the hit point in the sun? (offset back along the ray, nudged up)
            const hx = ox + d[0] * t, hy = oy + d[1] * t, hz = oz + d[2] * t;
            const sv = rayT(hx - d[0] * 0.08, hy - d[1] * 0.08 + 0.03, hz - d[2] * 0.08, sunD[0], sunD[1], sunD[2]) >= MAXT ? 1 : 0;
            const alb = hy < 0.7 ? gAlb : wAlb;
            const bf = 0.55 * sv + 0.12;                  // sunlit bounce, plus faint sky-lit bounce
            r += dt * alb[0] * sunC[0] * bf; g2 += dt * alb[1] * sunC[1] * bf; b2 += dt * alb[2] * sunC[2] * bf;
          }
        }
        if (wsum > 0) { r /= wsum; g2 /= wsum; b2 /= wsum; }
        const ao = Math.max(0.25, 1 - 1.15 * (wsum ? contact / wsum : 0));   // crease definition
        const m2 = 1.2 * ao;                                                 // 1.2 = infinite-bounce compensation
        r *= m2; g2 *= m2; b2 *= m2;
        // local lights: N·L with inverse-square-ish falloff, one shadow ray each. This is what
        // makes an interior readable — and the shadow ray is what throws a lit patch through a
        // doorway onto the floor outside instead of glowing through the wall.
        for (const L of LIGHTS) {
          const lx = L.x - px2, ly = L.y - py2, lz = L.z - pz2;
          const d2 = lx * lx + ly * ly + lz * lz; if (d2 > L.r * L.r) continue;
          const dl = Math.sqrt(d2) || 1e-4;
          const nd = (lx * nx + ly * ny + lz * nz) / dl; if (nd <= 0.02) continue;
          const f = 1 - dl / L.r, att = f * f;                               // smooth cutoff at range
          // rayT reports MAXT when it finds nothing, so "th >= MAXT" means CLEAR, not "a hit 10
          // units away" — without that check every light past 10 units would read as shadowed.
          const th = rayT(ox, oy, oz, lx / dl, ly / dl, lz / dl);
          if (th < MAXT && th < dl - 0.06) continue;   // in shadow
          const g3 = nd * att * L.p * ao;
          r += L.c[0] * g3; g2 += L.c[1] * g3; b2 += L.c[2] * g3;
        }
        r = Math.max(r, 0.015); g2 = Math.max(g2, 0.015); b2 = Math.max(b2, 0.02);
        LM.px[oi] = r; LM.px[oi + 1] = g2; LM.px[oi + 2] = b2;
      }
    }
    for (let j = 0; j < CELL; j++) for (let i2 = 0; i2 < CELL; i2++) {   // pass 2: gutter ring
      const fi = Math.min(Math.max(i2, 1), INT), fj = Math.min(Math.max(j, 1), INT);
      if (i2 === fi && j === fj) continue;
      const src2 = ((cy + fj) * A + cx + fi) * 3, dst = ((cy + j) * A + cx + i2) * 3;
      LM.px[dst] = LM.px[src2]; LM.px[dst + 1] = LM.px[src2 + 1]; LM.px[dst + 2] = LM.px[src2 + 2];
    }
  });
  // normalise into 0..1 for the PNG; the scale factor rides along as lightMapIntensity
  let mx2 = 0; for (let i3 = 0; i3 < LM.px.length; i3++) if (LM.px[i3] > mx2) mx2 = LM.px[i3];
  if (mx2 > 1) { for (let i3 = 0; i3 < LM.px.length; i3++) LM.px[i3] /= mx2; LM.intensity = +mx2.toFixed(3); }
}

// ------------------------------------------------------------------- GLB writing ----
function writeGLB(out) {
  const bufs = [], views = [], accessors = [], primitives = [], foliagePrims = [];
  const _lmMats = new Set();
  let off = 0;
  const push = (buf, target) => {
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
    bufs.push(buf); off += buf.length;
    while (off % 4) { bufs.push(Buffer.alloc(1)); off++; }
    return views.length - 1;
  };
  prims.forEach((p, mi) => {
    if (!p) return;
    const pos = new Float32Array(p.pos), nrm = new Float32Array(p.nrm), uv = new Float32Array(p.uv), idx = new Uint32Array(p.idx);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    const vPos = push(Buffer.from(pos.buffer), 34962), vNrm = push(Buffer.from(nrm.buffer), 34962);
    const vUV = push(Buffer.from(uv.buffer), 34962), vIdx = push(Buffer.from(idx.buffer), 34963);
    accessors.push({ bufferView: vPos, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx });
    accessors.push({ bufferView: vNrm, componentType: 5126, count: nrm.length / 3, type: 'VEC3' });
    accessors.push({ bufferView: vUV, componentType: 5126, count: uv.length / 2, type: 'VEC2' });
    accessors.push({ bufferView: vIdx, componentType: 5125, count: idx.length, type: 'SCALAR' });
    const attrs = { POSITION: accessors.length - 4, NORMAL: accessors.length - 3, TEXCOORD_0: accessors.length - 2 };
    let extra = 0;
    if (p.uv2) { const u2 = new Float32Array(p.uv2);
      const vU2 = push(Buffer.from(u2.buffer), 34962);
      accessors.push({ bufferView: vU2, componentType: 5126, count: u2.length / 2, type: 'VEC2' });
      attrs.TEXCOORD_1 = accessors.length - 1; extra = 1; _lmMats.add(mi); }
    // nocollide materials (grass cards, foliage) go to a separate node the engine's build-1093
    // convention recognises by name — no collider boxes, no raycast hits, pure decoration
    (MATS[mi].nocollide ? foliagePrims : primitives)
      .push({ attributes: attrs, indices: accessors.length - 1 - extra, material: mi });
  });

  // bake textures: base colour at full res (RGBA for the decal atlas); metallic-roughness and
  // normal maps at half res — their content is lower-frequency, and noisy normals are what
  // refuse to compress, so half-res aux maps are where the file size goes
  const images = [], textures = [], texIdx = {};   // name -> { base, mr, nrm } texture indices
  const addImg = (png, sampler = 0) => { const v = push(png); images.push({ bufferView: v, mimeType: 'image/png' });
    textures.push({ sampler, source: images.length - 1 }); return textures.length - 1; };
  for (const [name, t] of Object.entries(TEXS)) {
    const S = t.S;
    let basePng;
    if (t.a) { const px = new Float64Array(S * S * 4);
      for (let i = 0; i < S * S; i++) { px[i * 4] = t.rgb[i * 3]; px[i * 4 + 1] = t.rgb[i * 3 + 1]; px[i * 4 + 2] = t.rgb[i * 3 + 2]; px[i * 4 + 3] = t.a[i]; }
      basePng = pngEncode(toBytes(px), S, S, 4);
    } else basePng = pngEncode(toBytes(t.rgb), S, S, 3);
    const e = { base: addImg(basePng), mr: null, nrm: null };
    if (!t.noAux) {
      const down = (px2, S2) => { let q = px2, ss = S2, div = +(process.env.TEXAUX || 2);
        while (div > 1) { q = halfPx(q, ss, 3); ss >>= 1; div >>= 1; } return [q, ss]; };
      if (t.mr) { const px = new Float64Array(S * S * 3);
        for (let i = 0; i < S * S; i++) { px[i * 3 + 1] = t.mr[i * 2]; px[i * 3 + 2] = t.mr[i * 2 + 1]; }
        const [q1, s1] = down(px, S); e.mr = addImg(pngEncode(toBytes(q1), s1, s1, 3)); }
      // normal strength scales with resolution so world-space relief stays constant
      const [q2, s2] = down(normalPx(t.h, S, 2.2 * S / 256), S);
      e.nrm = addImg(pngEncode(toBytes(q2), s2, s2, 3));
      if (t.em) e.em = addImg(pngEncode(toBytes(t.em), S, S, 3));   // mostly black -> compresses tiny
    }
    texIdx[name] = e;
  }
  // the baked radiance lightmap: RGB, sRGB-encoded (banding-friendly in the shade), its own UV
  // channel, clamped un-mipped sampler (1px gutters are only bilinear-safe at mip 0)
  let lmTex = null;
  if (LM) { const px = new Float64Array(LM.A * LM.A * 3);
    for (let i = 0; i < px.length; i++) px[i] = Math.pow(Math.max(0, Math.min(1, LM.px[i])), 1 / 2.2);
    lmTex = addImg(pngEncode(toBytes(px), LM.A, LM.A, 3), 1); }
  const _skip = (env, n) => (process.env[env] || '').split(',').includes(n);   // debug bisection
  const materials = MATS.map(md => {
    const g = { name: md.name, pbrMetallicRoughness: { baseColorFactor: [...md.base, 1], metallicFactor: md.metal, roughnessFactor: md.rough } };
    if (md.tex) { const ti = texIdx[md.tex];
      if (!_skip('NOTEX', md.name)) g.pbrMetallicRoughness.baseColorTexture = { index: ti.base };
      if (ti.mr != null && !_skip('NOMR', md.name)) g.pbrMetallicRoughness.metallicRoughnessTexture = { index: ti.mr };
      if (ti.nrm != null && !_skip('NONRM', md.name)) g.normalTexture = { index: ti.nrm, scale: md.nrm }; }
    if (md.blend) g.alphaMode = 'BLEND';
    if (md.mask) { g.alphaMode = 'MASK'; g.alphaCutoff = 0.32; }   // cutout foliage; low cutoff keeps distant mips alive
    if (md.ds) g.doubleSided = true;
    if (lmTex != null && !process.env.NOLM && _lmMats.has(MATS.indexOf(md))) {
      g.occlusionTexture = { index: lmTex, texCoord: 1 };                       // old engines: reads .r as plain AO
      g.extras = { rumpusLightmap: LM.intensity || 1 };                         // build 1095 engines: adopt as radiance lightMap
    }
    if (md.tex && texIdx[md.tex].em != null) { g.emissiveTexture = { index: texIdx[md.tex].em }; g.emissiveFactor = [1, 1, 1]; }
    else if (md.glow) g.emissiveFactor = md.base.map(v => v * md.glow);
    return g;
  });

  const meshes = [{ primitives }], nodes = [{ mesh: 0, name: 'level' }];
  if (foliagePrims.length) { meshes.push({ primitives: foliagePrims }); nodes.push({ mesh: 1, name: 'nocollide-foliage' }); }
  const json = {
    asset: { version: '2.0', generator: 'rumpus-levelgen' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes,
    meshes, materials,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
               { magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],   // lightmap atlas: clamp, no mips
    images, textures,
    buffers: [{ byteLength: off }], bufferViews: views, accessors,
  };
  let jbuf = Buffer.from(JSON.stringify(json)); while (jbuf.length % 4) jbuf = Buffer.concat([jbuf, Buffer.from(' ')]);
  const bin = Buffer.concat(bufs);
  const total = 12 + 8 + jbuf.length + 8 + bin.length;
  const head = Buffer.alloc(12 + 8); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  head.writeUInt32LE(jbuf.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
  const bhead = Buffer.alloc(8); bhead.writeUInt32LE(bin.length, 0); bhead.writeUInt32LE(0x004E4942, 4);
  writeFileSync(out, Buffer.concat([head, jbuf, bhead, bin]));
  let tris = 0; prims.forEach(p => { if (p) tris += p.idx.length / 3; });
  return { bytes: total, tris };
}

// -------------------------------------------------------------------------- main ----
const LAYOUTS = { keep: buildKeep, spine: buildSpine, museum: buildMuseum, castle: buildCastle, caldera: buildCaldera };
if (!_LG_HOST) {   // CLI only — in the browser the host calls buildArena/bakeLightmap/writeGLB itself
const which = process.argv[2], out = process.argv[3];
if (which === 'tex') {   // fast iteration: node tools/levelgen.mjs tex <library-id> <out.png>
  const id = process.argv[3], outPng = process.argv[4];
  if (!MATLIB[id] || !outPng) { console.error('tex ids: ' + Object.keys(MATLIB).join(' ')); process.exit(1); }
  const S2 = +(process.env.TEXSIZE || 0) || 512;
  const t = MATLIB[id].make('t_' + id, S2);
  if (t.a) { const px = new Float64Array(S2 * S2 * 4);
    for (let i = 0; i < S2 * S2; i++) { px[i * 4] = t.rgb[i * 3]; px[i * 4 + 1] = t.rgb[i * 3 + 1]; px[i * 4 + 2] = t.rgb[i * 3 + 2]; px[i * 4 + 3] = t.a[i]; }
    writeFileSync(outPng, pngEncode(toBytes(px), S2, S2, 4));
  } else writeFileSync(outPng, pngEncode(toBytes(t.rgb), S2, S2, 3));
  console.log(id, '->', outPng, S2 + 'px');
  process.exit(0);
}
if ((which !== 'arena' && !LAYOUTS[which]) || !out) {
  console.error('usage: node tools/levelgen.mjs <' + Object.keys(LAYOUTS).join('|') + '> <out.glb>');
  console.error('       node tools/levelgen.mjs arena <out.glb> [seed] [' + ARENA_THEMES.join('|') + '|auto] [small|medium|large] [square|cross|octagon|diagonal|auto]');
  process.exit(1);
}
const info = which === 'arena'
  ? buildArena((+process.argv[4] || 1) | 0, process.argv[5] || 'auto', process.argv[6] || 'medium', process.argv[7] || 'square')
  : LAYOUTS[which]();
const t0 = process.hrtime.bigint();
bakeLightmap(info.light);
const aoMs = Number(process.hrtime.bigint() - t0) / 1e6 | 0;
const w = writeGLB(out);
console.log(`${info.name} -> ${out}  (${(w.bytes / 1024).toFixed(0)} KB, ${w.tris} tris, ${MATS.length} materials, ${Object.keys(TEXS).length} texture sets, lightmap ${LM ? LM.A : 0}px / ${PATCHES.length} patches in ${aoMs} ms over ${SOLIDS.length} solids)`);
if (info.scans) console.log('SCANS ' + JSON.stringify(info.scans));
if (info.spawns) console.log('SPAWNS ' + JSON.stringify(info.spawns));
if (info.world) console.log('WORLD ' + JSON.stringify(info.world));
}
