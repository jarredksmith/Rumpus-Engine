// build 1111: multi-room interiors — and the interior lighting that makes them usable.
//
// The bake integrates SKY visibility plus one sun bounce, so anything under a roof integrates to
// almost nothing: a room would bake black no matter how nice the walls are. So rooms and lights
// ship together. roomBlock() splits a footprint with a seeded binary partition, puts a doorway in
// every split wall (so no room is ever sealed off), an entrance in the shell, windows on the other
// faces, and a ceiling fixture per room that registers a baked light.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, done } from './harness.mjs';

const lgSrc = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs'), 'utf8')
  .replace(/^#![^\n]*\n/, '');

// ---------------------------------------------------------------- the bake side
assert(/const LIGHTS = \[\];/.test(lgSrc) && /function addLight\(x, y, z, col, range, power = 1\)/.test(lgSrc),
  'the baker has a light registry');
assert(/r: Math\.min\(range, 9\.5\)/.test(lgSrc),
  'range is capped to the tracer search distance — a longer light could not be shadow-tested and would leak through walls');
assert(/const th = rayT\(ox, oy, oz, lx \/ dl, ly \/ dl, lz \/ dl\);\n          if \(th < MAXT && th < dl - 0\.06\) continue;/.test(lgSrc),
  'each light is shadow-tested, and "no hit" (th >= MAXT) correctly means CLEAR, not "a hit at 10 units"');
assert(/const f = 1 - dl \/ L\.r, att = f \* f;/.test(lgSrc), 'smooth falloff to the range limit');

// ---------------------------------------------------------------- executable: the rooms
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { roomBlock, LIGHTS, SOLIDS, mat, MATS };');
const host = { deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} };
process.env.TEXSIZE = '64';

const api = await factory(host, { from:()=>{}, alloc:()=>{}, concat:()=>{} }, { env: process.env, argv: [] });
const mW = api.mat('w', {}), mF = api.mat('f', {}), mT = api.mat('t', { glow: 0.8 });
const X0 = -6, Z0 = -8, X1 = 6, Z1 = 8, H = 4.6;
const before = api.LIGHTS.length;
const rooms = api.roomBlock(mW, mF, mT, X0, Z0, X1, Z1, 0, H, 4242, { entrance: '-x', depth: 2, minRoom: 5.5 });

assert(rooms.length >= 2, 'the footprint split into several rooms (' + rooms.length + ')');
for (const r of rooms) {
  assert(r.x0 >= X0 - 1e-6 && r.x1 <= X1 + 1e-6 && r.z0 >= Z0 - 1e-6 && r.z1 <= Z1 + 1e-6, 'every room is inside the shell');
  assert(r.x1 - r.x0 >= 4 && r.z1 - r.z0 >= 4, 'and big enough to move through (' +
    (r.x1 - r.x0).toFixed(1) + ' x ' + (r.z1 - r.z0).toFixed(1) + ')');
}
// rooms must not overlap each other — a partition, not a pile
for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
  const p = rooms[a], q = rooms[b];
  const ov = Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0));
  eq(+ov.toFixed(3), 0, 'rooms ' + a + ' and ' + b + ' do not overlap');
}

// one light per room, hung inside that room, below the ceiling
const lights = api.LIGHTS.slice(before);
eq(lights.length, rooms.length, 'exactly one ceiling light per room');
for (const r of rooms) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const L = lights.find(l => Math.abs(l.x - cx) < 1e-6 && Math.abs(l.z - cz) < 1e-6);
  assert(L, 'room at ' + cx.toFixed(1) + ',' + cz.toFixed(1) + ' has its own light');
  assert(L.y > 0 && L.y < H, '...hung inside the room, under the ceiling (y=' + L.y.toFixed(2) + ')');
  assert(L.r > 0 && L.r <= 9.5, '...with a shadow-testable range (' + L.r.toFixed(1) + ')');
  assert(L.p >= 2, '...and enough power to actually light a sealed room (' + L.p + ')');
}

// a second call with a different seed lays out differently — the rooms are seeded, not fixed
const before2 = api.LIGHTS.length;
const rooms2 = api.roomBlock(mW, mF, mT, X0, Z0, X1, Z1, 0, H, 99, { entrance: '+x' });
assert(api.LIGHTS.length - before2 === rooms2.length, 'the second block lights its own rooms too');
const sig = (rs) => rs.map(r => [r.x0, r.z0, r.x1, r.z1].map(v => v.toFixed(2)).join()).sort().join('|');
assert(sig(rooms) !== sig(rooms2), 'a different seed gives a different floor plan');

// ---------------------------------------------------------------- wired into the arena
assert(/const rooms = roomBlock\(P\.wall, libMat\('plankGrey'\), P\.trim, x0, z0, x1, z1, 0, WH2,/.test(lgSrc),
  'the arena building side-structure is a real multi-room block now');
assert(/lightCol: theme === 'volcanic' \? \[1, 0\.62, 0\.3\] : theme === 'castle' \? \[1, 0\.78, 0\.5\] : \[1, 0\.93, 0\.78\]/.test(lgSrc),
  'and its lamps take the theme colour');

done('build 1111: buildings have rooms, doorways, windows — and light to see them by');
