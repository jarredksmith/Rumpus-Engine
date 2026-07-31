// build 1113: the multi-storey stairwell bots can actually climb — and why build 1112's could not.
//
// The generator was authoring to the wrong arithmetic. An imported model's collider is a ~1-unit
// COLUMN GRID, and a column is solid for its whole width as soon as a triangle touches it, so every
// surface stands up to a full cell proud of where it was modelled — and a face lying exactly ON a
// cell boundary (which round-numbered architecture does constantly) costs the entire next cell.
// Measured on the generated buildings: a 0.45-thick wall collides 2.0 thick, and the 2.56-wide
// entrance left 1.0 of gap. An enemy resolves against those boxes with a 0.9 clearance radius, so
// every opening loses up to 2 * GRID_PAD before its 1.8 of body even gets a look in.
//
// So build 1112's 3.5-wide stair lanes were never passable, its doorways were never passable, and
// widening the shaft "not helping" was a red herring — the probe scan line ran down a lane centre
// that the shell wall's collider had already eaten. Three fixes, all here:
//   1. lanes and doorways are sized from BOT_LANE (2*GRID_PAD + 2*BOT_R = 3.8), not by eye
//   2. flights are constant-thickness SLABS, so the flight beside you is not a wall along its run
//   3. every flight arrives on a LANDING spanning the whole bay, so the switchback crossover and
//      the step-off onto the storey happen on flat ground, where the build-1094 exemption applies
//
// This test is not a source pin: it builds the real geometry, runs breach.html's OWN
// buildModelGridBoxes over its triangles, and replays the engine's enemy obstacle resolution.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const lgSrc = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs'), 'utf8')
  .replace(/^#![^\n]*\n/, '');

// ---------------------------------------------------------------- the rule, written down
assert(/const GRID_PAD = 1\.0, BOT_R = 0\.9;/.test(lgSrc), 'the collider-grid pad and the bot radius are named constants');
assert(/const BOT_LANE = 2 \* GRID_PAD \+ 2 \* BOT_R;/.test(lgSrc), '...and the minimum passable width derives from them');
assert(/const DOOR = opts\.door \|\| \(BOT_LANE \+ 0\.4\)/.test(lgSrc), 'doorways are sized by that rule');
assert(/const RB_LAND = 2 \* \(GRID_PAD \+ BOT_R\)/.test(lgSrc), '...and so is landing depth');
assert(/const bayW = storeys > 1 \? \(opts\.bay \|\| 9\) : 0;/.test(lgSrc), 'the stair bay is 9 — two lanes that each clear BOT_LANE');
assert(/const twoUp = rr\(\) < 0\.5;/.test(lgSrc), 'the arena actually builds multi-storey blocks now');
assert(/baySide: s > 0 \? '-x' : '\+x'/.test(lgSrc),
  'and the mirrored pair puts its stairs on the same face — 180° symmetry means both teams get the same building');
// the grid resolution this whole file is reasoning about, straight from the engine
assert(/const MGRID_CELL = 1\.0, MGRID_SLOT = 0\.35;/.test(gameSource()), 'GRID_PAD tracks the engine cell size');

// ---------------------------------------------------------------- build the real block
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const host = { deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} };
process.env.TEXSIZE = '64';
const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { roomBlock, prims, MATS, SOLIDS, mat };');

// ---------------------------------------------------------------- the engine's own collider grid
const V3 = class { constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  fromBufferAttribute(a,i){ this.x=a.array[i*3]; this.y=a.array[i*3+1]; this.z=a.array[i*3+2]; return this; }
  applyMatrix4(){ return this; } };
const Box3 = class { constructor(min,max){ this.min=min; this.max=max; } };
// the grid's constants come from the SOURCE, not restated here — build 1148 added two more and a
// hardcoded copy would have silently diverged from what the engine actually runs
const gridConsts = [/const MGRID_CELL = [^;]+;/, /const MGRID_BITS = [^;]+;/, /const MGRID_FOOT_BYTES = [^;]+;/, /const MGRID_MIN_THICK = [^;]+;/]
  .map(re=>{ const m=gameSource().match(re); assert(m, 'the grid constant ' + re + ' is declared in one place'); return m[0]; }).join('\n');
assert(/const MGRID_CELL = 1\.0, MGRID_SLOT = 0\.35;/.test(gameSource()), 'cell and slot are declared together, so one match carries both');
const buildGrid = new Function('THREE','_mgA','_mgB','_mgC','IS_COARSE',
  `${gridConsts}\n${[extractFunction('_mgridGatherTris'), extractFunction('_mgridCore'), extractFunction('_mgridOpts'), extractFunction('_mgridWrap'), extractFunction('buildModelGridBoxes')].join('\n')}\nreturn buildModelGridBoxes;`
)({ Vector3: V3, Box3 }, new V3(), new V3(), new V3(), false);

// every emitted triangle, in world space, read through the index buffer
function trisOf(api) {
  const out = [];
  api.prims.forEach((p, mi) => {
    if (!p || (api.MATS[mi] && api.MATS[mi].nocollide)) return;
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const v = k => { const i = p.idx[t + k]; return [p.pos[i*3], p.pos[i*3+1], p.pos[i*3+2]]; };
      out.push([...v(0), ...v(1), ...v(2)]);
    }
  });
  return out;
}
// vertical-line queries against those triangles: the engine's surfaceTopUnder, minus the raycaster
function triHeight(t, x, z) {
  const d = (t[5]-t[8])*(t[0]-t[6]) + (t[6]-t[3])*(t[2]-t[8]);
  if (Math.abs(d) < 1e-12) return null;
  const l1 = ((t[5]-t[8])*(x-t[6]) + (t[6]-t[3])*(z-t[8])) / d;
  const l2 = ((t[8]-t[2])*(x-t[6]) + (t[0]-t[6])*(z-t[8])) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) return null;
  return l1*t[1] + l2*t[4] + l3*t[7];
}
function makeWorld(tris) {
  const cell = 2;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of tris) { x0 = Math.min(x0, t[0], t[3], t[6]); x1 = Math.max(x1, t[0], t[3], t[6]);
                          z0 = Math.min(z0, t[2], t[5], t[8]); z1 = Math.max(z1, t[2], t[5], t[8]); }
  const nx = Math.ceil((x1-x0)/cell)+1, nz = Math.ceil((z1-z0)/cell)+1, grid = new Array(nx*nz);
  const gx = x => Math.max(0, Math.min(nx-1, Math.floor((x-x0)/cell)));
  const gz = z => Math.max(0, Math.min(nz-1, Math.floor((z-z0)/cell)));
  tris.forEach((t, i) => {
    for (let a = gx(Math.min(t[0],t[3],t[6])); a <= gx(Math.max(t[0],t[3],t[6])); a++)
      for (let b = gz(Math.min(t[2],t[5],t[8])); b <= gz(Math.max(t[2],t[5],t[8])); b++)
        (grid[a*nz+b] || (grid[a*nz+b] = [])).push(i);
  });
  return { topUnder(x, z, ceilY) {
    const list = grid[gx(x)*nz + gz(z)]; let top = -Infinity;
    if (list) for (const i of list) { const y = triHeight(tris[i], x, z); if (y != null && y <= ceilY && y > top) top = y; }
    return top;
  } };
}
// the engine's enemy obstacle pass (build 1089 body band, build 1094 step exemption), verbatim in shape
const STEP = 0.6, eR = 0.9;
function pushedAt(world, boxes, x, z, standY) {
  const py = standY + 1.4, feet = py - 1.4 + STEP, head = py + 0.55;
  let px = x, pz = z;
  for (const b of boxes) {
    if (b.max.y < feet || b.min.y > head) continue;
    const cx = Math.max(b.min.x, Math.min(px, b.max.x)), cz = Math.max(b.min.z, Math.min(pz, b.max.z));
    const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
    if (!(d < eR && d > 1e-4)) continue;
    if (b.max.y - (py - 1.4) < STEP + 0.5) {
      const st = world.topUnder(cx - dx/d*0.1, cz - dz/d*0.1, b.max.y + 0.05);
      if (st > -Infinity && b.max.y - st < 0.85) continue;
    }
    const push = eR - d; px += dx/d*push; pz += dz/d*push;
  }
  return Math.hypot(px - x, pz - z) > 1e-6;
}
// walkable reachability: BFS over (x, z, level). A neighbour counts if its surface is within STEP
// above / `drop` below and an enemy standing there is not shoved.
function reach(world, boxes, sx, sz, bounds, step = 0.5) {
  const s0 = world.topUnder(sx, sz, 1e9), y0 = s0 > -Infinity ? s0 : 0;
  const seen = new Set([`${sx},${sz}`]), q = [[sx, sz, y0]];
  let hi = y0;
  while (q.length) {
    const [x, z, y] = q.shift();
    for (const [dx, dz] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const nx = +(x+dx).toFixed(2), nz = +(z+dz).toFixed(2);
      if (nx < bounds[0] || nx > bounds[2] || nz < bounds[1] || nz > bounds[3]) continue;
      // nothing modelled here = the arena floor the block always stands on, at y = 0
      const hit = world.topUnder(nx, nz, y + STEP), ny = hit > -Infinity ? hit : 0;
      if (ny > y + STEP || ny < y - 1.2) continue;
      const k = nx + ',' + nz + ',' + Math.round(ny * 2);
      if (seen.has(k)) continue;
      seen.add(k);
      if (pushedAt(world, boxes, nx, nz, ny)) continue;
      if (ny > hi) hi = ny;
      q.push([nx, nz, ny]);
    }
  }
  return { hi, cells: seen.size };
}

// ---------------------------------------------------------------- the two-storey block, both hands
const X0 = -8, X1 = 8, Z0 = -10, Z1 = 10, H = 3.7, ST = 2;
for (const side of ['-x', '+x']) {
  const api = await factory(host, { from:()=>{}, alloc:()=>{}, concat:()=>{} }, { env: process.env, argv: [] });
  const mW = api.mat('w', {}), mF = api.mat('f', {}), mT = api.mat('t', { glow: 0.8 });
  const rooms = api.roomBlock(mW, mF, mT, X0, Z0, X1, Z1, 0, H, 4242,
    { entrance: side, baySide: side, storeys: ST, depth: 2, minRoom: 5.5 });
  const tris = trisOf(api);
  const world = makeWorld(tris);
  let mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
  for (const t of tris) for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) {
    mn[q] = Math.min(mn[q], t[k*3+q]); mx[q] = Math.max(mx[q], t[k*3+q]); }
  const arr = new Float32Array(tris.flat());
  const boxes = buildGrid({ traverse(f) { f({ isMesh: true, visible: true,
    geometry: { index: null, attributes: { position: { count: arr.length/3, array: arr } } },
    updateWorldMatrix(){}, matrixWorld: {} }); } }, { min: new V3(...mn), max: new V3(...mx) });
  assert(boxes && boxes.length > 20, side + ': the engine built a collider grid (' + (boxes ? boxes.length : 0) + ' boxes)');

  // --- every declared stair centreline, sampled every 0.5, must be push-free
  assert(rooms.stairScans && rooms.stairScans.length === ST * 2,
    side + ': the block declares a scan per flight and per landing crossover (' + (rooms.stairScans || []).length + ')');
  let pts = 0, bad = 0, worst = null;
  for (const [ax, az, bx, bz] of rooms.stairScans) {
    const n = Math.max(2, Math.round(Math.hypot(bx-ax, bz-az) / 0.5) + 1);
    for (let i = 0; i < n; i++) {
      const t = i/(n-1), x = ax + (bx-ax)*t, z = az + (bz-az)*t;
      const y = world.topUnder(x, z, 1e9);
      pts++;
      if (pushedAt(world, boxes, x, z, y)) { bad++; worst = worst || [x.toFixed(1), z.toFixed(1), y.toFixed(1)]; }
    }
  }
  assert(pts >= 40, side + ': the sweep actually walked the stairs (' + pts + ' sample points)');
  eq(bad, 0, side + ': no enemy is pushed anywhere on the flights or the landings' +
    (worst ? ' (first at ' + worst + ')' : ''));

  // --- and the climb genuinely connects: from outside the entrance to the roof
  const out = side === '-x' ? [X0 - 2.5, Z0 + 2.85] : [X1 + 2.5, Z0 + 2.85];
  const R = reach(world, boxes, out[0], out[1], [X0 - 4, Z0 - 4, X1 + 4, Z1 + 4]);
  assert(R.hi >= H * ST + 0.3 - 1e-6, side + ': a bot walks from outside the door all the way to the roof (' +
    R.hi.toFixed(2) + ' of ' + (H * ST + 0.35).toFixed(2) + ' reached, over ' + R.cells + ' cells)');

  // --- nothing in the stairwell is laid flush (the build-1108 rule, on geometry 1108 never sees).
  // The block always stands on the arena floor, so put one in the occluder list: without it every
  // wall's underside reads as an exposed face coplanar with the ground slab's underside.
  api.SOLIDS.push([X0 - 4, -0.5, Z0 - 4, X1 + 4, 0, Z1 + 4]);
  const buckets = new Map();
  api.prims.forEach((p, mi) => {
    if (!p) return;
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const i = [p.idx[t], p.idx[t+1], p.idx[t+2]];
      const v = k => [p.pos[i[k]*3], p.pos[i[k]*3+1], p.pos[i[k]*3+2]];
      const A = v(0), B = v(1), C = v(2), n = [p.nrm[i[0]*3], p.nrm[i[0]*3+1], p.nrm[i[0]*3+2]];
      for (const ax of [0,1,2]) {
        if (Math.abs(Math.abs(n[ax]) - 1) > 1e-4) continue;
        if (Math.abs(A[ax]-B[ax]) > 1e-6 || Math.abs(A[ax]-C[ax]) > 1e-6) continue;
        const u = [0,1,2].filter(k => k !== ax);
        const f = { mi, ctr: [(A[0]+B[0]+C[0])/3, (A[1]+B[1]+C[1])/3, (A[2]+B[2]+C[2])/3], axis: ax, dir: n[ax] > 0 ? 1 : -1,
          lo: [Math.min(A[u[0]],B[u[0]],C[u[0]]), Math.min(A[u[1]],B[u[1]],C[u[1]])],
          hi: [Math.max(A[u[0]],B[u[0]],C[u[0]]), Math.max(A[u[1]],B[u[1]],C[u[1]])] };
        const q = f.ctr.slice(); q[ax] += f.dir * 0.02;
        const bur = api.SOLIDS.some(b => q[0] > b[0]+0.005 && q[0] < b[3]-0.005 && q[1] > b[1]+0.005
          && q[1] < b[4]-0.005 && q[2] > b[2]+0.005 && q[2] < b[5]-0.005);
        if (bur) break;
        const key = ax + '|' + f.ctr[ax].toFixed(4) + '|' + f.dir;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(f);
        break;
      }
    }
  });
  let clash = null;
  for (const [, list] of buckets) for (let a = 0; a < list.length && !clash; a++) for (let b = a+1; b < list.length; b++) {
    if (list[a].mi === list[b].mi) continue;
    const w = Math.min(list[a].hi[0], list[b].hi[0]) - Math.max(list[a].lo[0], list[b].lo[0]);
    const hh = Math.min(list[a].hi[1], list[b].hi[1]) - Math.max(list[a].lo[1], list[b].lo[1]);
    if (w > 1e-4 && hh > 1e-4 && w * hh > 0.02) { clash = ['axis' + list[a].axis, api.MATS[list[a].mi].name + ' vs ' + api.MATS[list[b].mi].name, (w*hh).toFixed(2) + ' m2', 'at ' + list[a].ctr.map(v=>v.toFixed(2))]; break; }
  }
  eq(clash, null, side + ': no two coplanar same-facing surfaces overlap in the stairwell' + (clash ? ' (' + clash + ')' : ''));
}

// ---------------------------------------------------------------- the openings, in isolation
// A doorway is only a doorway if a bot fits through the COLLIDER, which is the part build 1112 got
// wrong: the shipping single-storey buildings had 2.56-wide entrances that left 1.0 of gap.
{
  const BOT_LANE = 3.8;
  const free = (w, pad = 1.0) => w - 2 * pad;         // worst case: a full cell eaten on each side
  assert(free(2.56) < 1.8, 'the old 2.56 entrance could not pass a 0.9-radius bot (' + free(2.56).toFixed(2) + ' free)');
  assert(free(1.6) < 0, '...and the old 1.6 interior doorway was not an opening at all');
  assert(free(BOT_LANE) >= 1.8 - 1e-9, 'BOT_LANE is exactly the width that survives it');
  assert(free(BOT_LANE + 0.4) >= 2.2, '...and the doorway width shipped has margin on top');
}
// an opening can never overrun its wall, however wide it is asked to be
{
  const api = await factory(host, { from:()=>{}, alloc:()=>{}, concat:()=>{} }, { env: process.env, argv: [] });
  assert(/const PIER = 0\.35, w = Math\.min\(op\.w, \(a1 - a0\) - PIER \* 2\);/.test(lgSrc),
    'wallRun shrinks an opening to fit its wall');
  assert(/const at = Math\.max\(a0 \+ PIER \+ w \/ 2, Math\.min\(a1 - PIER - w \/ 2, op\.at\)\);/.test(lgSrc),
    '...and clamps it inside, so a pier always survives at both ends');
  void api;
}

// ---------------------------------------------------------------- flights are slabs, not wedges
assert(/function ramp\(m, x0, z0, x1, z1, yBase, yAtMin, yAtMax, axis, thick\)/.test(lgSrc),
  'ramp() can build a constant-thickness slab');
assert(/const bot = \(c\) => thick \? \[c\[0\], c\[1\] - thick, c\[2\]\] : \[c\[0\], yBase, c\[2\]\];/.test(lgSrc),
  '...whose underside follows the top instead of filling down to the base');
assert(/ramp\(mFloor, lx\[0\], fz0, lx\[1\], fz1, 0, up \? yFoot : yTop, up \? yTop : yFoot, 'z', RB_SLAB\);/.test(lgSrc),
  '...and the stair flights use it');

done('build 1113: bots climb the stairs and walk through the doors — sized to the engine\'s own collider grid');
