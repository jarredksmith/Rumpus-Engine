// build 1124: placing a generated arena puts the player INSIDE it.
//
// "Place in level" dropped the arena's model at the origin and left the level's default player
// spawn where it was — also the origin. Every footprint this generator builds puts a structure at
// the arena's centre, so the player spawned inside one. Measured on KILN RUN (seed 4242, desert,
// medium): the floor under (0,0) is at y 0.06 and the first thing above a 1.7-high head is the
// central mass's underside at y 2.25. Fifty-five centimetres of headroom, sealed from the sun.
//
// That is not a small cosmetic issue: it is why a generated arena rendered as a flat, sunless,
// shadowless rust-coloured room. The "sky" filling the top half of every screenshot was the
// underside of a rock, the missing contact shadows were missing because no sunlight reached the
// floor at all, and four rounds of visual critique were judging a view from inside the scenery.
//
// The generator already knows where a match starts — the two base rooms it reserves at z = ±(W-4)
// — so it now says so (info.spawns, ordered BASE 1 then BASE 2) and the editor starts the player
// there, facing the middle.
//
// This is not a source pin: it builds real arenas and shoots a ray straight up from each spawn.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, assert, eq, done } from './harness.mjs';

const lgSrc = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs'), 'utf8')
  .replace(/^#![^\n]*\n/, '');

// ---------------------------------------------------------------- build real arenas
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const host = { deflateSync: () => new Uint8Array(0), writeFileSync: () => {} };
process.env.TEXSIZE = '64';
process.env.TEXAUX = '4';

async function arena(seed, theme, size, footprint) {
  // a FRESH module instance per arena: prims/MATS/SOLIDS are module-level accumulators
  const api = await new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
    lgSrc + '\n;return { buildArena, prims, MATS };')(host, Buffer, process);
  const info = api.buildArena(seed, theme, size, footprint);
  const tris = [];
  api.prims.forEach((p, mi) => {
    if (!p || (api.MATS[mi] && api.MATS[mi].nocollide)) return;   // grass cards are not a roof
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const v = k => { const i = p.idx[t + k]; return [p.pos[i*3], p.pos[i*3+1], p.pos[i*3+2]]; };
      tris.push([...v(0), ...v(1), ...v(2)]);
    }
  });
  return { info, tris };
}
// the height at which a triangle crosses the vertical line through (x,z), or null if it misses
function triHeight(t, x, z) {
  const d = (t[5]-t[8])*(t[0]-t[6]) + (t[6]-t[3])*(t[2]-t[8]);
  if (Math.abs(d) < 1e-12) return null;
  const l1 = ((t[5]-t[8])*(x-t[6]) + (t[6]-t[3])*(z-t[8])) / d;
  const l2 = ((t[8]-t[2])*(x-t[6]) + (t[0]-t[6])*(z-t[8])) / d;
  if (l1 < -1e-9 || l2 < -1e-9 || 1 - l1 - l2 < -1e-9) return null;
  return l1*t[1] + l2*t[4] + (1-l1-l2)*t[7];
}
const EYE = 1.7;                                          // DEFAULT_WORLD.eyeHeight
const ceiling = (tris, x, z) => { let low = Infinity;     // first thing above a standing head
  for (const t of tris) { const y = triHeight(t, x, z); if (y != null && y > EYE + 0.05 && y < low) low = y; }
  return low; };
const floorAt = (tris, x, z) => { let top = -Infinity;
  for (const t of tris) { const y = triHeight(t, x, z); if (y != null && y <= EYE && y > top) top = y; }
  return top; };

// ---------------------------------------------------------------- the bug, still reproducible
{
  const { info, tris } = await arena(4242, 'desert', 'medium', 'square');
  eq(info.name.split(' (')[0], 'KILN RUN', 'the same arena every screenshot was taken in');
  const lid = ceiling(tris, 0, 0);
  assert(lid < 3, 'the arena centre is ROOFED — a head at 1.7 has ' + (lid - EYE).toFixed(2) + ' m of clearance');
  assert(floorAt(tris, 0, 0) < 0.5, '...standing on the arena floor, so this is an undercroft and not a mistake in the probe');
}

// ---------------------------------------------------------------- the fix, across the matrix
{
  const cases = [
    [4242, 'desert', 'medium', 'square'], [77, 'frost', 'large', 'octagon'],
    [12, 'garden', 'small', 'cross'],     [901, 'castle', 'medium', 'diagonal'],
    [55, 'volcanic', 'large', 'square'],  [318, 'facility', 'small', 'square'],
    [640, 'industrial', 'medium', 'cross'],
  ];
  for (const [seed, theme, size, fp] of cases) {
    const { info, tris } = await arena(seed, theme, size, fp);
    const tag = theme + '/' + size + '/' + fp;
    assert(Array.isArray(info.spawns) && info.spawns.length === 2, tag + ': two spawns, one per base');
    const W = size === 'small' ? 30 : size === 'large' ? 46 : 38;
    eq(info.spawns[0][1], W - 4, tag + ': BASE 1 sits in the room the team-base pass reserved');
    eq(info.spawns[1][1], -(W - 4), tag + ': BASE 2 is its 180° mirror');
    for (const [i, [x, z]] of info.spawns.entries()) {
      assert(Math.abs(x) < W && Math.abs(z) < W, tag + ' spawn ' + i + ' is inside the walls');
      const f = floorAt(tris, x, z);
      assert(f > -0.5 && f < 1.0, tag + ' spawn ' + i + ' stands on the arena floor (y=' + f.toFixed(2) + '), not on a parapet or in a pit');
      assert(ceiling(tris, x, z) === Infinity, tag + ' spawn ' + i + ' is OPEN TO THE SKY — the whole point');
    }
  }
}

// ---------------------------------------------------------------- it travels to the browser
{
  const src = gameSource();
  assert(/spawns:info\.spawns\|\|null/.test(src), 'the worker carries the spawns back with the GLB');
  assert(/if\(r\.spawns && r\.spawns\.length && typeof playerSpawn!=='undefined'\)\{/.test(src),
    'Place in level uses them when the generator supplied them');
  assert(/playerSpawn\.x=\+s\[0\]\|\|0; playerSpawn\.z=\+s\[1\]\|\|0; playerSpawn\.y=0;/.test(src), '...moving the player spawn');
  assert(/playerSpawn\.yaw=Math\.atan2\(playerSpawn\.x, playerSpawn\.z\);/.test(src),
    '...facing the arena centre');
  {
    // the SIGN matters, and only a screenshot caught it: the engine's forward is
    // (-sin yaw, -cos yaw), so facing the origin from (x,z) is atan2(x,z). atan2(-x,-z) — the
    // obvious-looking form — turns the player around to stare at the perimeter wall 4 m behind.
    const fwd = (x, z) => { const y = Math.atan2(x, z); return [-Math.sin(y), -Math.cos(y)]; };
    for (const [x, z] of [[0, 34], [0, -34], [26, 0], [-20, 20]]) {
      const [fx, fz] = fwd(x, z), d = Math.hypot(x, z);
      assert(Math.abs(fx + x/d) < 1e-9 && Math.abs(fz + z/d) < 1e-9,
        'from (' + x + ',' + z + ') the spawn yaw points AT the origin, not away from it');
    }
  }
  assert(/if\(typeof refreshPlayerSpawnMarker==='function'\) refreshPlayerSpawnMarker\(\);/.test(src), '...and moving the editor marker with it');
  // build 1126: and the author's own camera, which build 1124 left standing in the central mass
  assert(/_lgPlacePlayer\(\{ x:playerSpawn\.x, y:0, z:playerSpawn\.z \}\);/.test(src),
    '...and the editor camera, so the creator is not left looking at the inside of a rock');
  // a hand-built layout (keep/spine/museum) has no spawns; it must be left alone, not moved to (0,0)
  assert(/info\.spawns\|\|null/.test(src), 'a layout without spawns reports null rather than an empty move');
}
// and the CLI reports them beside SCANS/WORLD, so the manifest a human reads matches what ships
assert(/if \(info\.spawns\) console\.log\('SPAWNS ' \+ JSON\.stringify\(info\.spawns\)\);/.test(lgSrc),
  'the CLI prints the spawn manifest');

done('build 1124: a generated arena starts the player in a base room under open sky, not inside its centre');
