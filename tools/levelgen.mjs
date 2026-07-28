#!/usr/bin/env node
// RUMPUS ENGINE level generator — emits a .glb you import as a full-level model.
//
//   node tools/levelgen.mjs <layout> <out.glb>     layouts: keep, spine
//
// Everything here is shaped by what build 1089 established about how an imported model
// becomes a collider:
//   - the voxel grid lands on ~1.0-unit cells for an arena this size, with ~0.35-unit
//     vertical slots; STEP (the shared step allowance) is 0.6
//   - enemies get a clearance capsule of radius 0.9 whose body band starts STEP above
//     their feet — so ramps must rise gently per cell, corridors must be ≥ 4 wide, and
//     nothing waist-high should sit where bots need to path
//   - surfaceTopUnder raycasts real triangles for floor height, so sloped ramp tops walk
//     smoothly; only the push test sees the voxelised columns
//
// Multiplayer intent: 180° rotational symmetry (fair for two teams), no dead ends (every
// space has ≥ 2 exits), three heights with the power position exposed from below, and
// cover placed in mirrored pairs.

import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------- geometry builder ----
const MATS = [];
function mat(name, hex, opts = {}) {
  const c = [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
  MATS.push({
    name,
    pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: opts.metal ?? 0.05, roughnessFactor: opts.rough ?? 0.92 },
    ...(opts.glow ? { emissiveFactor: c.map(v => v * opts.glow) } : {}),
  });
  return MATS.length - 1;
}

const prims = [];   // per-material: { pos:[], nrm:[], idx:[] }
function prim(m) { return prims[m] || (prims[m] = { pos: [], nrm: [], idx: [] }); }
// The a→b→c→d labels below run clockwise seen from outside, so both emitters flip:
// negated normal, reversed winding. (Caught by the engine probe — with front faces
// pointing inward, surfaceTopUnder raycasts landed on every slab's underside.)
function quad(m, a, b, c, d) {
  const p = prim(m);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
  const base = p.pos.length / 3;
  for (const vtx of [a, b, c, d]) { p.pos.push(...vtx); p.nrm.push(...n); }
  p.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
function tri(m, a, b, c) {
  const p = prim(m);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
  const base = p.pos.length / 3;
  for (const vtx of [a, b, c]) { p.pos.push(...vtx); p.nrm.push(...n); }
  p.idx.push(base, base + 2, base + 1);
}

// axis-aligned box from min/max corners
function box(m, x0, y0, z0, x1, y1, z1) {
  const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1];
  const E = [x0, y1, z0], F = [x1, y1, z0], G = [x1, y1, z1], H = [x0, y1, z1];
  quad(m, E, F, G, H);            // top  (+y)
  quad(m, D, C, B, A);            // bottom (-y)
  quad(m, A, B, F, E);            // north (-z)
  quad(m, C, D, H, G);            // south (+z)
  quad(m, D, A, E, H);            // west (-x)
  quad(m, B, C, G, F);            // east (+x)
}
// centred convenience
function cbox(m, cx, cy, cz, sx, sy, sz) { box(m, cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2); }

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
// mirrored min/max box helper (rotating corners swaps which is min/max)
function mbox(m, x0, y0, z0, x1, y1, z1) {
  box(m, x0, y0, z0, x1, y1, z1);
  box(m, -x1, y0, -z1, -x0, y1, -z0);
}

// ---------------------------------------------------------------------- palettes ----
function industrialPalette() {
  return {
    floor: mat('floor', 0x39404a),
    slab: mat('slab', 0x424b56),
    wall: mat('wall', 0x4a5561),
    pillar: mat('pillar', 0x556270),
    ramp: mat('ramp', 0x515e6b),
    parapet: mat('parapet', 0x2e353d),
    crate: mat('crate', 0x7a5f3f, { rough: 0.98 }),
    crate2: mat('crate2', 0x5d6b5a, { rough: 0.98 }),
    trim: mat('trim', 0x38f5b5, { glow: 0.9, rough: 0.5 }),
    teamA: mat('teamA', 0xff8c3a, { glow: 0.55, rough: 0.6 }),
    teamB: mat('teamB', 0x4aa8ff, { glow: 0.55, rough: 0.6 }),
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
      cbox(m, x, 0.85, z, 2, 1.7, 2);
      if (!rot) cbox(m === P.crate ? P.crate2 : P.crate, x + 0.15, 2.4, z - 0.1, 1.4, 1.4, 1.4);
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
  // centre killbox: waist-high cross cover + glow marker
  cbox(P.parapet, 0, 0.6, 0, 10, 1.2, 2);
  cbox(P.parapet, 0, 0.6, 0, 2, 1.2, 10);
  cbox(P.trim, 0, 1.25, 0, 2.4, 0.12, 2.4);

  // corner bunkers: L-walls (2.6 high — blocks sight, not a platform) + a crate nest
  mirrored((xz, team) => {
    for (const sxz of [[30, 22], [-30, 22]]) {
      const [x, z] = xz(sxz[0], sxz[1]);
      const dx = x > 0 ? -1 : 1, dz = z > 0 ? -1 : 1;
      box(P.wall, Math.min(x, x + dx * 10), 0, Math.min(z, z + dz * 1), Math.max(x, x + dx * 10), 2.6, Math.max(z, z + dz * 1));
      box(P.wall, Math.min(x, x + dx * 1), 0, Math.min(z, z + dz * 8), Math.max(x, x + dx * 1), 2.6, Math.max(z, z + dz * 8));
      cbox((sxz[0] > 0) ? P.crate : P.crate2, x + dx * 4, 0.85, z + dz * 4, 2, 1.7, 2);
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
      cbox((sx + sz) % 3 ? P.crate : P.crate2, x, 0.85, z, 2, 1.7, 2);
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
    const pos = new Float32Array(p.pos), nrm = new Float32Array(p.nrm), idx = new Uint32Array(p.idx);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    const vPos = push(Buffer.from(pos.buffer), 34962), vNrm = push(Buffer.from(nrm.buffer), 34962), vIdx = push(Buffer.from(idx.buffer), 34963);
    accessors.push({ bufferView: vPos, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx });
    accessors.push({ bufferView: vNrm, componentType: 5126, count: nrm.length / 3, type: 'VEC3' });
    accessors.push({ bufferView: vIdx, componentType: 5125, count: idx.length, type: 'SCALAR' });
    primitives.push({ attributes: { POSITION: accessors.length - 3, NORMAL: accessors.length - 2 }, indices: accessors.length - 1, material: mi });
  });
  const json = {
    asset: { version: '2.0', generator: 'rumpus-levelgen' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'level' }],
    meshes: [{ primitives }], materials: MATS,
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
console.log(`${info.name} -> ${out}  (${(w.bytes / 1024).toFixed(0)} KB, ${w.tris} tris, ${MATS.length} materials)`);
