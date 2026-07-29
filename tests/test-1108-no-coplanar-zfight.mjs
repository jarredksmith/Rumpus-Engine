// build 1108: no two visible surfaces may share a plane — the "overlapping mesh that flashes".
//
// Decorative bands (team colour bands, ember seams) were placed EXACTLY flush with the arena
// wall's inner face, and the four trim rings (plinth / floor border / cornice / cap) overlapped
// each other at the corners. Two front-facing surfaces at identical depth have no winner: the GPU
// picks per pixel and the choice flips as the camera moves. Worse, the team band was losing
// outright — it was invisible head-on.
//
// The fix is a shared PROUD offset plus mitred rings, but the durable guard is this test: it
// builds every theme and asserts that no two coplanar, same-facing, axis-aligned faces from
// DIFFERENT materials overlap in area. Any future decoration laid flush trips it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, done } from './harness.mjs';

const lgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs');
const lgSrc = readFileSync(lgPath, 'utf8').replace(/^#![^\n]*\n/, '');

assert(/const PROUD = 0\.05;/.test(lgSrc), 'the shared stand-off constant exists');
assert(/box\(tm, -14, WALL_H \* 0\.4, south \? W - PROUD : -W - 0\.15, 14, WALL_H \* 0\.4 \+ 1\.1, south \? W \+ 0\.15 : -W \+ PROUD\);/.test(lgSrc),
  'the arena team band stands proud of the wall');
assert(/box\(P\.trim, -W, 0, -W - 0\.1, W, 0\.35, -W \+ PROUD\); box\(P\.trim, -W, 0, W - PROUD, W, 0\.35, W \+ 0\.1\);/.test(lgSrc),
  'the volcanic ember seams stand proud too');

// ---------------------------------------------------------------- executable: the real geometry
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const host = { deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} };
const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { buildArena, prims, MATS, SOLIDS };');

// One axis-aligned TRIANGLE -> {axis, plane, dir, rect} when it lies in a constant-axis plane.
// Triangles must be read through the index buffer: a quad stores 4 vertices, so walking raw
// vertices in threes fabricates faces that straddle two quads (and thus phantom overlaps).
function faceOf(p, t) {
  const i = [p.idx[t], p.idx[t+1], p.idx[t+2]];
  const v = k => [p.pos[i[k]*3], p.pos[i[k]*3+1], p.pos[i[k]*3+2]];
  const A = v(0), B = v(1), C = v(2);
  const n = [p.nrm[i[0]*3], p.nrm[i[0]*3+1], p.nrm[i[0]*3+2]];
  for (const ax of [0, 1, 2]) {
    if (Math.abs(Math.abs(n[ax]) - 1) > 1e-4) continue;              // not axis-aligned on this axis
    if (Math.abs(A[ax]-B[ax]) > 1e-6 || Math.abs(A[ax]-C[ax]) > 1e-6) continue;
    const u = [0,1,2].filter(k => k !== ax);
    return { axis: ax, plane: A[ax], dir: n[ax] > 0 ? 1 : -1, u,
      ctr: [(A[0]+B[0]+C[0])/3, (A[1]+B[1]+C[1])/3, (A[2]+B[2]+C[2])/3],
      lo: [Math.min(A[u[0]],B[u[0]],C[u[0]]), Math.min(A[u[1]],B[u[1]],C[u[1]])],
      hi: [Math.max(A[u[0]],B[u[0]],C[u[0]]), Math.max(A[u[1]],B[u[1]],C[u[1]])] };
  }
  return null;
}
const overlapArea = (a, b) => {
  const w = Math.min(a.hi[0], b.hi[0]) - Math.max(a.lo[0], b.lo[0]);
  const h = Math.min(a.hi[1], b.hi[1]) - Math.max(a.lo[1], b.lo[1]);
  return (w > 1e-4 && h > 1e-4) ? w * h : 0;
};

process.env.TEXSIZE = '64';   // the painters run either way; keep them cheap
let checkedThemes = 0, checkedFaces = 0, buried = null;
for (const theme of ['industrial', 'castle', 'volcanic', 'garden', 'desert', 'frost', 'facility']) {
  const api = await factory(host, { from:()=>{}, alloc:()=>{}, concat:()=>{} }, { env: process.env, argv: [] });
  api.buildArena(5, theme, 'medium');
  // a face is buried if a point just past it is inside any solid (shrunk, so merely touching a
  // face's own box doesn't count)
  // STEP must exceed SHRINK, or a face lying exactly on a solid's boundary probes to a point the
  // shrunken box no longer contains and reads as "exposed" when it is in fact sealed.
  const S = api.SOLIDS, STEP = 0.02, SHRINK = 0.005;
  buried = (f) => {
    const q = f.ctr.slice(); q[f.axis] += f.dir * STEP;
    for (const b of S) {
      if (q[0] > b[0] + SHRINK && q[0] < b[3] - SHRINK && q[1] > b[1] + SHRINK && q[1] < b[4] - SHRINK
       && q[2] > b[2] + SHRINK && q[2] < b[5] - SHRINK) return true;
    }
    return false;
  };
  // bucket every axis-aligned face by (axis, plane, facing); keep the material index with it
  const buckets = new Map();
  api.prims.forEach((p, mi) => {
    if (!p || (api.MATS[mi] && (api.MATS[mi].blend || api.MATS[mi].mask))) return;   // decals/foliage are meant to layer
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const f = faceOf(p, t); if (!f) continue;
      // Only EXPOSED faces can fight. In a box world, geometry butted against something shares the
      // contact plane by construction: a crate's bottom lies on the floor, a plinth's back lies on
      // the wall. Those faces are sealed inside solid volume where no camera reaches them. Step a
      // hair along the normal and ask the generator's own occluder list whether we're still inside
      // something — if so, this face is buried and its coincidences are harmless.
      if (buried(f)) continue;
      checkedFaces++;
      const key = f.axis + '|' + f.plane.toFixed(4) + '|' + f.dir;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(Object.assign(f, { mi }));
    }
  });
  const clashes = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (list[a].mi === list[b].mi) continue;              // same material = one surface, subdivided
      const ov = overlapArea(list[a], list[b]);
      if (ov > 0.02) clashes.push({ key, ov: +ov.toFixed(2),
        m: api.MATS[list[a].mi].name + ' vs ' + api.MATS[list[b].mi].name,
        at: '[' + list[a].lo.map(v=>v.toFixed(1)) + ']..[' + list[a].hi.map(v=>v.toFixed(1)) + ']' });
    }
  }
  const worst = clashes.sort((x, y) => y.ov - x.ov)[0];
  eq(clashes.length, 0, theme + ': no coplanar same-facing overlap' +
    (worst ? ' (worst: ' + worst.m + ', ' + worst.ov + ' m² on plane ' + worst.key + ' rect ' + worst.at + ')' : ''));
  checkedThemes++;
}
eq(checkedThemes, 7, 'every theme checked');
assert(checkedFaces > 4000, 'the sweep actually looked at the geometry (' + checkedFaces + ' faces)');

done('build 1108: nothing is laid flush against anything else — no z-fighting');
