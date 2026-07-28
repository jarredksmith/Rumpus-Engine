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

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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
  constructor(name, S) { this.name = name; this.S = S; this.rgb = new Float64Array(S * S * 3); this.h = new Float64Array(S * S); this.mr = null; this.a = null; this.noAux = false; }
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
  t.each((x, y, i) => {
    const m = mottle(x, y), b = blotch(x, y);
    t.tint(i, 0.86 + m * 0.24 - Math.max(0, b - 0.62) * 0.5);
    if (r() < 0.012) t.tint(i, r() < 0.5 ? 0.78 : 1.14);
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
      const i = (((fy * k + dy) | 0 + S) % S) * S + (((fx * k + dx) | 0) + S) % S; t.tint(i, 0.62); t.h[i] -= 0.9;
    }
  }
  return finish(t, seed, { cavDark: 0.34, cavK: 1.8 });
}
function metalTex(name, seed, S) {   // brushed panels, seams, rivets — and rust where water sits
  const r = rng(seed), t = new Tex(name, S), k = S / 256, P = S / 2;
  t.fill([0.68, 0.7, 0.73]).mrInit(0.9, 0.62);
  const brushRow = new Float64Array(S); for (let y = 0; y < S; y++) brushRow[y] = r();
  const brush = fbm(r, S, [[64, 1], [128, 0.8], [320, 0.5]]);
  const rustN = fbm(r, S, [[24, 1], [96, 0.7]]);
  const seamD = (v) => Math.min(v % P, P - (v % P));
  t.each((x, y, i) => {
    const b = brush(x, y) * 0.5 + brushRow[y] * 0.5;
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
      const i = (((py + dy) | 0 + S) % S) * S + (((px + 16 * k + dx) | 0) % S);
      t.h[i] += (5 * k * k - d2) * 0.28 / (k * k); t.tint(i, 1.06); t.mr[i * 2] = 0.4; }
  }
  for (let q = 0; q < 4; q++) {                                     // rust streaks bleeding down from rivets
    const sx = ((Math.floor(r() * (S / (32 * k))) * 32 + 16) * k) | 0, sy = (r() < 0.5 ? 8 * k : P + 12 * k) | 0, len = (30 + r() * 70) * k;
    for (let d = 0; d < len; d++) { const fall = 1 - d / len;
      const i = (((sy + d) | 0) % S) * S + ((sx + ((r() - 0.5) * 2) | 0) + S) % S;
      t.mix(i, [0.4, 0.23, 0.12], 0.5 * fall); t.mr[i * 2] = Math.min(1, t.mr[i * 2] + 0.25 * fall); }
  }
  for (let q = 0; q < 14 * k; q++) {                                // scratches: bright, glossy
    let x = r() * S, y = r() * S; const a = r() * Math.PI, len = (10 + r() * 40) * k, ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 0; d < len; d++) { const i = ((Math.round(y + sa * d) + S) % S) * S + (Math.round(x + ca * d) + S) % S;
      t.tint(i, 1.12); t.mr[i * 2] = 0.35; }
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
    const inStud = lx > 8 * k && lx < 56 * k && ly > 7 * k && ly < 25 * k;
    const rim = !inStud && lx > 6 * k && lx < 58 * k && ly > 5 * k && ly < 27 * k;
    const w = wear(x, y);
    if (inStud) { t.h[i] = 0.85; t.tint(i, 1.08 + w * 0.14); t.mr[i * 2] = 0.6 + w * 0.22; }
    else if (rim) { t.h[i] = 0.4; t.tint(i, 1.15); t.mr[i * 2] = 0.35; t.mr[i * 2 + 1] = 0.85; }   // worn bare rim
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
    for (let d = 0; d < 22 * k; d++) { const i = (((by + 5 * k + d) | 0) % S) * S + ((bx + ((r() - 0.5) * 2 * k)) | 0 + S) % S;
      t.mix(i, [0.38, 0.22, 0.12], 0.4 * (1 - d / (22 * k))); }     // rust bleeding off each bolt
  }
  for (let q = 0; q < 3; q++) {
    const y0 = (96 + q * 22) * k;
    for (let x = 70 * k; x < 130 * k; x++) for (let w = 0; w < 8 * k; w++) { const i = ((y0 + w) | 0) * S + (x | 0); t.tint(i, 0.55); }
  }
  return finish(t, seed, { cavDark: 0.36, edgeLight: 0.24 });
}
function hazardTex(name, S) {   // 45° chevrons, chipped and scuffed
  const r = rng(77), t = new Tex(name, S), k = S / 256;
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
  return finish(t, 77, {});
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
    blend: !!opts.blend });
  return MATS.length - 1;
}

const prims = [];   // per-material: { pos:[], nrm:[], uv:[], idx:[] }
function prim(m) { return prims[m] || (prims[m] = { pos: [], nrm: [], uv: [], idx: [] }); }
// The a→b→c→d labels below run clockwise seen from outside, so both emitters flip:
// negated normal, reversed winding. (Caught by the engine probe — with front faces
// pointing inward, surfaceTopUnder raycasts landed on every slab's underside.)
// UVs: planar projection along the face's dominant axis, in world units / material scale —
// or explicit per-vertex UVs (unitUV) for objects whose texture must land on their edges.
function _uvFor(n, s, v) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [v[0] / s, v[2] / s];
  if (ax >= az) return [v[2] / s, v[1] / s];
  return [v[0] / s, v[1] / s];
}
function quad(m, a, b, c, d, unitUV) {
  const p = prim(m), s = MATS[m].scale;
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  let n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
  const base = p.pos.length / 3;
  const uvs = unitUV || [a, b, c, d].map(vtx => _uvFor(n, s, vtx));
  [a, b, c, d].forEach((vtx, k) => { p.pos.push(...vtx); p.nrm.push(...n); p.uv.push(uvs[k][0], uvs[k][1]); });
  p.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
function tri(m, a, b, c) {
  const p = prim(m), s = MATS[m].scale;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
  const base = p.pos.length / 3;
  [a, b, c].forEach(vtx => { p.pos.push(...vtx); p.nrm.push(...n); const q = _uvFor(n, s, vtx); p.uv.push(q[0], q[1]); });
  p.idx.push(base, base + 2, base + 1);
}
const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];
function box(m, x0, y0, z0, x1, y1, z1, unit) {
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
function ramp(m, x0, z0, x1, z1, yBase, yAtMin, yAtMax, axis) {
  let E, F, G, H;   // top corners at (x0,z0) (x1,z0) (x1,z1) (x0,z1)
  if (axis === 'x') { E = [x0, yAtMin, z0]; F = [x1, yAtMax, z0]; G = [x1, yAtMax, z1]; H = [x0, yAtMin, z1]; }
  else              { E = [x0, yAtMin, z0]; F = [x1, yAtMin, z0]; G = [x1, yAtMax, z1]; H = [x0, yAtMax, z1]; }
  const A = [x0, yBase, z0], B = [x1, yBase, z0], C = [x1, yBase, z1], D = [x0, yBase, z1];
  quad(m, E, F, G, H);   // sloping top
  quad(m, D, C, B, A);   // underside
  quad(m, A, B, F, E);   // z0 side (zero-area where top meets base — harmless)
  quad(m, C, D, H, G);   // z1 side
  quad(m, D, A, E, H);   // x0 end
  quad(m, B, C, G, F);   // x1 end
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

// ---------------------------------------------------------------------- palettes ----
function industrialPalette() {
  const concrete = useTex(concreteFinished('concrete', 11, 1024));
  const panels = useTex(panelsTex('panels', 23, 1024));
  const metal = useTex(metalTex('metal', 37, 1024));
  const deck = useTex(deckTex('deck', 51, 1024));
  const crate = useTex(crateTex('crate', 67, 512));
  const hazard = useTex(hazardTex('hazard', 512));
  const decals = useTex(decalTex('decals'));
  return {
    // architecture: world-planar UVs, density set per material
    floor: mat('floor', { tex: concrete, base: [0.52, 0.55, 0.57], rough: 0.95, scale: 7, nrm: 1.2 }),
    slab: mat('slab', { tex: deck, base: [0.92, 0.95, 1], metal: 0.15, rough: 1, scale: 3, nrm: 1.6 }),
    wall: mat('wall', { tex: panels, base: [0.66, 0.7, 0.74], rough: 0.9, scale: 12, nrm: 1.4 }),
    pillar: mat('pillar', { tex: metal, base: [0.82, 0.86, 0.92], metal: 0.15, rough: 1, scale: 4, nrm: 1.2 }),
    ramp: mat('ramp', { tex: deck, base: [0.82, 0.86, 0.94], metal: 0.15, rough: 1, scale: 3, nrm: 1.6 }),
    parapet: mat('parapet', { tex: metal, base: [0.6, 0.65, 0.72], metal: 0.15, rough: 1, scale: 3, nrm: 1.2 }),
    hazard: mat('hazard', { tex: hazard, base: [1, 1, 1], rough: 0.75, scale: 2, nrm: 0.8 }),
    // discrete objects: unit UVs, tinted per variant off one texture
    crate: mat('crate', { tex: crate, base: [0.55, 0.52, 0.38], rough: 0.8, metal: 0.25, scale: 1, nrm: 1.8 }),
    crate2: mat('crate2', { tex: crate, base: [0.5, 0.35, 0.26], rough: 0.85, metal: 0.25, scale: 1, nrm: 1.8 }),
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

  // central deck (32×24 @ MID) on pillars, perch (14×8 @ TOP)
  cbox(P.slab, 0, MID - T / 2, 0, 32, T, 24);
  cbox(P.slab, 0, TOP - T / 2, 0, 14, T, 8);
  for (const px of [-14, 0, 14]) for (const pz of [-10, 10]) cbox(P.pillar, px, (MID - T) / 2, pz, 2, MID - T, 2);
  for (const px of [-6, 6]) for (const pz of [-3, 3]) cbox(P.pillar, px, MID + (TOP - MID - T) / 2, pz, 1.4, TOP - MID - T, 1.4);

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
    for (const bz of [-9, 9]) box(P.slab, s > 0 ? 16 : -32, MID - T, bz - 2, s > 0 ? 32 : -16, MID, bz + 2);
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
    box(tm, -16, 3.2, south ? W : -W - 0.15, 16, 4.4, south ? W + 0.15 : -W); // wall band
  });

  // ground cover, mirrored pairs (2×1.7 crates, some stacked)
  mirrored((xz, team) => {
    const spots = [[6, 17, 0], [22, 5, 0], [24, 18, 45], [10, -20, 30], [30, -14, 0]];
    for (const [sx, sz, rot] of spots) {
      const [x, z] = xz(sx, sz);
      const m = (sx + sz) % 3 ? P.crate : P.crate2;
      cbox(m, x, 0.85, z, 2, 1.7, 2, true);
      if (!rot) cbox(m === P.crate ? P.crate2 : P.crate, x + 0.15, 2.4, z - 0.1, 1.4, 1.4, 1.4, true);
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

  // the two spines: raised walkways at z=±10, 6 wide, 64 long, on repeating pillars
  for (const s of [1, -1]) {
    box(P.slab, -32, MID - T, s * 10 - 3, 32, MID, s * 10 + 3);
    for (let px = -28; px <= 28; px += 14) cbox(P.pillar, px, (MID - T) / 2, s * 10, 2, MID - T, 2);
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
      cbox((sxz[0] > 0) ? P.crate : P.crate2, x + dx * 4, 0.85, z + dz * 4, 2, 1.7, 2, true);
    }
    // team bands on the short walls
    const tm = team({ a: P.teamA, b: P.teamB });
    const east = xz(1, 0)[0] > 0;
    box(tm, east ? HX : -HX - 0.15, 2.8, -14, east ? HX + 0.15 : -HX, 4.0, 14);
  });

  // mid-field cover between spine and wall, mirrored
  mirrored((xz) => {
    for (const [sx, sz] of [[10, 20], [-16, 24], [22, 16]]) {
      const [x, z] = xz(sx, sz);
      cbox((sx + sz) % 3 ? P.crate : P.crate2, x, 0.85, z, 2, 1.7, 2, true);
    }
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

// ------------------------------------------------------------------- GLB writing ----
function writeGLB(out) {
  const bufs = [], views = [], accessors = [], primitives = [];
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
    primitives.push({ attributes: { POSITION: accessors.length - 4, NORMAL: accessors.length - 3, TEXCOORD_0: accessors.length - 2 },
      indices: accessors.length - 1, material: mi });
  });

  // bake textures: base colour at full res (RGBA for the decal atlas); metallic-roughness and
  // normal maps at half res — their content is lower-frequency, and noisy normals are what
  // refuse to compress, so half-res aux maps are where the file size goes
  const images = [], textures = [], texIdx = {};   // name -> { base, mr, nrm } texture indices
  const addImg = (png) => { const v = push(png); images.push({ bufferView: v, mimeType: 'image/png' });
    textures.push({ sampler: 0, source: images.length - 1 }); return textures.length - 1; };
  for (const [name, t] of Object.entries(TEXS)) {
    const S = t.S;
    let basePng;
    if (t.a) { const px = new Float64Array(S * S * 4);
      for (let i = 0; i < S * S; i++) { px[i * 4] = t.rgb[i * 3]; px[i * 4 + 1] = t.rgb[i * 3 + 1]; px[i * 4 + 2] = t.rgb[i * 3 + 2]; px[i * 4 + 3] = t.a[i]; }
      basePng = pngEncode(toBytes(px), S, S, 4);
    } else basePng = pngEncode(toBytes(t.rgb), S, S, 3);
    const e = { base: addImg(basePng), mr: null, nrm: null };
    if (!t.noAux) {
      if (t.mr) { const px = new Float64Array(S * S * 3);
        for (let i = 0; i < S * S; i++) { px[i * 3 + 1] = t.mr[i * 2]; px[i * 3 + 2] = t.mr[i * 2 + 1]; }
        e.mr = addImg(pngEncode(toBytes(halfPx(px, S, 3)), S >> 1, S >> 1, 3)); }
      // normal strength scales with resolution so world-space relief stays constant
      e.nrm = addImg(pngEncode(toBytes(halfPx(normalPx(t.h, S, 2.2 * S / 256), S, 3)), S >> 1, S >> 1, 3));
    }
    texIdx[name] = e;
  }
  const _skip = (env, n) => (process.env[env] || '').split(',').includes(n);   // debug bisection
  const materials = MATS.map(md => {
    const g = { name: md.name, pbrMetallicRoughness: { baseColorFactor: [...md.base, 1], metallicFactor: md.metal, roughnessFactor: md.rough } };
    if (md.tex) { const ti = texIdx[md.tex];
      if (!_skip('NOTEX', md.name)) g.pbrMetallicRoughness.baseColorTexture = { index: ti.base };
      if (ti.mr != null && !_skip('NOMR', md.name)) g.pbrMetallicRoughness.metallicRoughnessTexture = { index: ti.mr };
      if (ti.nrm != null && !_skip('NONRM', md.name)) g.normalTexture = { index: ti.nrm, scale: md.nrm }; }
    if (md.blend) g.alphaMode = 'BLEND';
    if (md.glow) g.emissiveFactor = md.base.map(v => v * md.glow);
    return g;
  });

  const json = {
    asset: { version: '2.0', generator: 'rumpus-levelgen' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'level' }],
    meshes: [{ primitives }], materials,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
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
const LAYOUTS = { keep: buildKeep, spine: buildSpine };
const which = process.argv[2], out = process.argv[3];
if (!LAYOUTS[which] || !out) {
  console.error('usage: node tools/levelgen.mjs <' + Object.keys(LAYOUTS).join('|') + '> <out.glb>');
  process.exit(1);
}
const info = LAYOUTS[which]();
const w = writeGLB(out);
console.log(`${info.name} -> ${out}  (${(w.bytes / 1024).toFixed(0)} KB, ${w.tris} tris, ${MATS.length} materials, ${Object.keys(TEXS).length} texture sets)`);
