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
// Everything is deterministic (seeded PRNG) and tileable (lattice noise wraps), because
// these textures repeat across whole walls.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const S = 256;   // texture size
function lattice(r, n) { const g = new Float64Array(n * n); for (let i = 0; i < n * n; i++) g[i] = r(); return g; }
function noiseAt(g, n, x, y) {   // bilinear, smoothstep, wrapping -> tileable
  const fx = x * n / S, fy = y * n / S;
  const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
  let tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm(r, octaves) {   // returns sampler(x,y) in ~[0,1]
  const layers = octaves.map(([n, w]) => [lattice(r, n), n, w]);
  const tot = octaves.reduce((s, o) => s + o[1], 0);
  return (x, y) => layers.reduce((s, [g, n, w]) => s + noiseAt(g, n, x, y) * w, 0) / tot;
}
class Tex {
  constructor(name) { this.name = name; this.rgb = new Float64Array(S * S * 3); this.h = new Float64Array(S * S); this.mr = null; }
  fill(c) { for (let i = 0; i < S * S; i++) { this.rgb[i * 3] = c[0]; this.rgb[i * 3 + 1] = c[1]; this.rgb[i * 3 + 2] = c[2]; } return this; }
  each(fn) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fn(x, y, y * S + x); return this; }
  tint(i, k) { this.rgb[i * 3] *= k; this.rgb[i * 3 + 1] *= k; this.rgb[i * 3 + 2] *= k; }
  mrInit(metal, rough) { this.mr = new Float64Array(S * S * 2); for (let i = 0; i < S * S; i++) { this.mr[i * 2] = rough; this.mr[i * 2 + 1] = metal; } return this; }
}
function pngRGB(px, w, h) {   // px: Float64Array w*h*3 in 0..1
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { const ro = y * (w * 3 + 1); raw[ro] = 0;
    for (let i = 0; i < w * 3; i++) raw[ro + 1 + i] = Math.max(0, Math.min(255, Math.round(px[y * w * 3 + i] * 255))); }
  const chunk = (t, d) => { const c = Buffer.concat([Buffer.from(t), d]); const out = Buffer.alloc(c.length + 8);
    out.writeUInt32BE(d.length, 0); c.copy(out, 4); out.writeInt32BE(crc32(c), c.length + 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
let _crcT = null;
function crc32(buf) {
  if (!_crcT) { _crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c; } }
  let c = -1; for (const b of buf) c = _crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) | 0;
}
function normalPNG(h, strength) {   // tangent-space normal map from the height field, wrapping
  const px = new Float64Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * strength;
    const dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * S + x) * 3;
    px[i] = (-dx / l) * 0.5 + 0.5; px[i + 1] = (-dy / l) * 0.5 + 0.5; px[i + 2] = (1 / l) * 0.5 + 0.5;
  }
  return pngRGB(px, S, S);
}
function mrPNG(mr) {   // glTF: roughness in G, metallic in B
  const px = new Float64Array(S * S * 3);
  for (let i = 0; i < S * S; i++) { px[i * 3] = 0; px[i * 3 + 1] = mr[i * 2]; px[i * 3 + 2] = mr[i * 2 + 1]; }
  return pngRGB(px, S, S);
}

// ---- the texture set -------------------------------------------------------------------
function concreteTex(name, seed) {
  const r = rng(seed), t = new Tex(name).fill([0.66, 0.66, 0.65]);
  const mottle = fbm(r, [[8, 1], [16, 0.6], [32, 0.35], [64, 0.2]]);
  const blotch = fbm(r, [[4, 1], [8, 0.7]]);
  t.each((x, y, i) => {
    const m = mottle(x, y), b = blotch(x, y);
    t.tint(i, 0.86 + m * 0.24 - Math.max(0, b - 0.62) * 0.5);
    if (r() < 0.012) t.tint(i, r() < 0.5 ? 0.78 : 1.14);           // speckle
    t.h[i] = m;
  });
  return t;
}
function panelsTex(name, seed) {   // concrete cast in big panels: seams, form-tie holes, weep stains
  const t = concreteTex(name, seed), r = rng(seed ^ 0xBEEF);
  const seam = (v) => { const d = Math.min(v % 128, 128 - (v % 128)); return d < 2 ? 0.55 : d < 5 ? 0.88 : 1; };
  t.each((x, y, i) => { const s = Math.min(seam(y), seam(x + 64)); t.tint(i, s); if (s < 1) t.h[i] -= (1 - s) * 0.8; });
  for (let k = 0; k < 5; k++) {                                     // weep stains falling from seams
    const sx = Math.floor(r() * S), sy = (Math.floor(r() * 2) * 128) % S, len = 26 + r() * 60;
    for (let d = 0; d < len; d++) for (let w = -1; w <= 1; w++) {
      const i = ((sy + d) % S) * S + (sx + w + S) % S;
      t.tint(i, 1 - 0.16 * (1 - d / len) * (w ? 0.5 : 1));
    }
  }
  for (const [fx, fy] of [[32, 32], [96, 32], [160, 32], [224, 32], [32, 160], [96, 160], [160, 160], [224, 160]]) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4) {
      const i = ((fy + dy + S) % S) * S + (fx + dx + S) % S; t.tint(i, 0.62); t.h[i] -= 0.9;   // form-tie holes
    }
  }
  return t;
}
function metalTex(name, seed) {   // brushed panels with seams + rivets; MR map carries the variation
  const r = rng(seed), t = new Tex(name).fill([0.68, 0.7, 0.73]).mrInit(0.9, 0.62);
  const brushRow = new Float64Array(S); for (let y = 0; y < S; y++) brushRow[y] = r();
  const brush = fbm(r, [[64, 1], [128, 0.8]]);
  const seam = (v) => { const d = Math.min(v % 128, 128 - (v % 128)); return d < 2 ? 0.62 : 1; };
  t.each((x, y, i) => {
    const b = brush(x, y) * 0.5 + brushRow[y] * 0.5;
    t.tint(i, 0.92 + b * 0.14);
    const s = Math.min(seam(x), seam(y));
    if (s < 1) { t.tint(i, s); t.h[i] -= 0.7; t.mr[i * 2] = 0.8; }
    else { t.h[i] = b * 0.35; t.mr[i * 2] = 0.55 + b * 0.25; }
  });
  for (let px = 0; px < S; px += 32) for (const py of [6, 122, 134, 250]) {   // rivet rows beside seams
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const d2 = dx * dx + dy * dy; if (d2 > 5) continue;
      const i = ((py + dy + S) % S) * S + (px + 16 + dx) % S;
      t.h[i] += (5 - d2) * 0.28; t.tint(i, 1.06); t.mr[i * 2] = 0.45; }
  }
  for (let k = 0; k < 14; k++) {                                    // scratches
    let x = r() * S, y = r() * S; const a = r() * Math.PI, len = 10 + r() * 40, ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 0; d < len; d++) { const i = ((Math.round(y + sa * d) + S) % S) * S + (Math.round(x + ca * d) + S) % S;
      t.tint(i, 1.12); t.mr[i * 2] = 0.42; }
  }
  return t;
}
function deckTex(name, seed) {   // walkway plate: raised oblong studs in offset rows, worn tops
  const r = rng(seed), t = new Tex(name).fill([0.62, 0.64, 0.67]).mrInit(0.5, 0.75);
  const wear = fbm(r, [[16, 1], [64, 0.5]]);
  t.each((x, y, i) => {
    const row = Math.floor(y / 32), lx = (x + (row % 2) * 32) % 64, ly = y % 32;
    const inStud = lx > 8 && lx < 56 && ly > 7 && ly < 25;
    const w = wear(x, y);
    if (inStud) { t.h[i] = 0.85; t.tint(i, 1.1 + w * 0.15); t.mr[i * 2] = 0.6 + w * 0.22; }
    else { t.h[i] = 0; t.tint(i, 0.9 + w * 0.1); t.mr[i * 2] = 0.82; }
  });
  return t;
}
function crateTex(name, seed) {   // one crate face: raised frame, recessed panel, corner bolts
  const r = rng(seed), t = new Tex(name).fill([0.62, 0.6, 0.56]);
  const grime = fbm(r, [[8, 1], [32, 0.6]]);
  const F = 30;                                                     // frame width in px
  t.each((x, y, i) => {
    const g = grime(x, y), ex = Math.min(x, S - 1 - x), ey = Math.min(y, S - 1 - y), e = Math.min(ex, ey);
    if (e > F) { t.tint(i, 0.72 + g * 0.18); t.h[i] = 0; }          // recessed panel
    else { t.tint(i, 0.95 + g * 0.12); t.h[i] = 0.9 - (e > F - 4 ? (e - (F - 4)) * 0.2 : 0); }
    if (e > F && e < F + 3) t.tint(i, 0.6);                         // shadow line inside the frame
  });
  for (const bx of [15, S - 15]) for (const by of [15, S - 15])     // corner bolts
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d2 = dx * dx + dy * dy; if (d2 > 18) continue;
      const i = (by + dy) * S + bx + dx; t.h[i] += (18 - d2) * 0.06; t.tint(i, 1.12); }
  for (let k = 0; k < 3; k++) {                                     // stencil dashes
    const y0 = 96 + k * 22; for (let x = 70; x < 130; x++) for (let w = 0; w < 8; w++) {
      if (rng(seed + k)() < 0) break; const i = (y0 + w) * S + x; t.tint(i, 0.55); }
  }
  return t;
}
function hazardTex(name) {   // 45° chevrons, worn
  const r = rng(77), t = new Tex(name).fill([0.9, 0.72, 0.12]);
  const wear = fbm(r, [[16, 1], [64, 0.7]]);
  t.each((x, y, i) => {
    if (((x + y) % 64) < 28) { t.rgb[i * 3] = 0.13; t.rgb[i * 3 + 1] = 0.13; t.rgb[i * 3 + 2] = 0.14; }
    const w = wear(x, y); t.tint(i, 0.8 + w * 0.35); t.h[i] = w * 0.3;
  });
  return t;
}

// ---------------------------------------------------------------- geometry builder ----
const MATS = [];    // material specs, resolved into glTF at write time
const TEXS = {};    // name -> Tex
function useTex(t) { TEXS[t.name] = t; return t.name; }
function mat(name, opts = {}) {
  MATS.push({ name, base: opts.base || [1, 1, 1], metal: opts.metal ?? 0.05, rough: opts.rough ?? 0.92,
    tex: opts.tex || null, nrm: opts.nrm ?? 1.0, glow: opts.glow || null, scale: opts.scale || 4 });
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
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
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

// ---------------------------------------------------------------------- palettes ----
function industrialPalette() {
  const concrete = useTex(concreteTex('concrete', 11));
  const panels = useTex(panelsTex('panels', 23));
  const metal = useTex(metalTex('metal', 37));
  const deck = useTex(deckTex('deck', 51));
  const crate = useTex(crateTex('crate', 67));
  const hazard = useTex(hazardTex('hazard'));
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

  // bake every referenced texture set into embedded PNGs (base + optional MR + normal)
  const images = [], textures = [], texIdx = {};   // name -> { base, mr, nrm } texture indices
  for (const [name, t] of Object.entries(TEXS)) {
    const add = (png) => { const v = push(png); images.push({ bufferView: v, mimeType: 'image/png' });
      textures.push({ sampler: 0, source: images.length - 1 }); return textures.length - 1; };
    texIdx[name] = { base: add(pngRGB(t.rgb, S, S)), mr: t.mr ? add(mrPNG(t.mr)) : null, nrm: add(normalPNG(t.h, 2.2)) };
  }
  const _skip = (env, n) => (process.env[env] || '').split(',').includes(n);   // debug bisection
  const materials = MATS.map(md => {
    const g = { name: md.name, pbrMetallicRoughness: { baseColorFactor: [...md.base, 1], metallicFactor: md.metal, roughnessFactor: md.rough } };
    if (md.tex) { const ti = texIdx[md.tex];
      if (!_skip('NOTEX', md.name)) g.pbrMetallicRoughness.baseColorTexture = { index: ti.base };
      if (ti.mr != null && !_skip('NOMR', md.name)) g.pbrMetallicRoughness.metallicRoughnessTexture = { index: ti.mr };
      if (!_skip('NONRM', md.name)) g.normalTexture = { index: ti.nrm, scale: md.nrm }; }
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
