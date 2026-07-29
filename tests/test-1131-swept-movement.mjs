// build 1131: horizontal movement is substepped, so a fast player cannot pass through a wall.
//
// moveHorizontal tested only the DESTINATION:
//
//   if(dx !== 0){ const destX = x + dx; if(stuck || clearAt(destX, z, feetY)) nx = destX; }
//
// That is a discrete check on a continuous motion. If one frame's step is long enough, the start and
// the end can both be clear while the path between them goes straight through a wall — and nothing in
// between is ever tested.
//
// This is reachable in ordinary play, not just in theory. dt is clamped to 0.05, so at 20 fps a
// player at the default run speed of 12 m/s covers 0.6 m in a single frame, and player.extVel from a
// grenade blast, a jump pad or a vehicle ejection adds to that. clearAt expands obstacles by the body
// radius (0.8), so a thin wall stops being a wall once one step exceeds roughly (thickness + 2R).
//
// The fix walks the motion in pieces no longer than half a body radius. At 60 fps that is a single
// iteration — exactly the old cost — so it only does more work in the case that used to be broken.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- run the real function
// clearAt is stubbed by a world description, so the test states the geometry rather than the answer.
function mk(world, radius) {
  const player = { radius, pos: { x: 0, z: 0 } };
  const calls = { clearAt: 0 };
  const clearAt = (x, z) => { calls.clearAt++; return !world(x, z); };
  const insideSolid = (x, z) => world(x, z);
  const fn = new Function('player', 'clearAt', 'insideSolid', 'ARENA', 'Math',
    extractFunction('moveHorizontal') + '; return moveHorizontal;')(player, clearAt, insideSolid, 1000, Math);
  return { fn, player, calls };
}
// a wall occupying x in [10, 10.2], infinite in z. clearAt expands by the body radius, so the blocked
// band for a body CENTRE is [10-R, 10.2+R].
const wall = (R) => (x) => x > 10 - R && x < 10.2 + R;

{
  // THE BUG, at its simplest: start 4 m short of the wall and ask for a 10 m step. The destination
  // (x=15) is open ground on the far side, so the old single-destination probe allowed the whole move.
  const R = 0.8;
  const { fn, player } = mk(wall(R), R);
  fn(5, 0, 10, 0, 0);
  assert(player.pos.x < 10 - R + 1e-6,
    'the step stops at the wall (ended at x=' + player.pos.x.toFixed(2) + ', wall face at ' + (10 - R).toFixed(2) + ')');
  assert(player.pos.x > 8.5, '...having travelled up to it rather than stopping short (' + player.pos.x.toFixed(2) + ')');
}
{
  // every step long enough to clear the whole blocked band, from 4 m short of it. The band is
  // [9.2, 11.0], so anything from ~5.8 m up used to land clean on the far side.
  const R = 0.8;
  for (const step of [6, 8, 12, 20, 30]) {
    const { fn, player } = mk(wall(R), R);
    fn(5, 0, step, 0, 0);
    assert(player.pos.x < 10 - R + 1e-6, 'a ' + step + ' m step never crosses the wall (ended ' + player.pos.x.toFixed(2) + ')');
  }
  // and short steps that cannot reach it are unaffected
  for (const step of [0.2, 0.6, 1.2] ) {
    const { fn, player } = mk(wall(R), R);
    fn(5, 0, step, 0, 0);
    assert(Math.abs(player.pos.x - (5 + step)) < 1e-9, 'a ' + step + ' m step in open ground is exact');
  }
}
{
  // ...and the same from the far side, so the guard is not one-directional
  const R = 0.8;
  const { fn, player } = mk(wall(R), R);
  fn(20, 0, -12, 0, 0);
  assert(player.pos.x > 10.2 + R - 1e-6, 'approaching from +x also stops (ended ' + player.pos.x.toFixed(2) + ')');
}
{
  // open ground: the substepping must not change where an unobstructed move ends
  const { fn, player } = mk(() => false, 0.8);
  fn(0, 0, 7, -3, 0);
  assert(Math.abs(player.pos.x - 7) < 1e-9 && Math.abs(player.pos.z + 3) < 1e-9,
    'an unobstructed move lands exactly where it asked (' + player.pos.x + ',' + player.pos.z + ')');
}
{
  // cost: a normal 60 fps step must not pay for substeps it does not need
  const { fn, calls } = mk(() => false, 0.8);
  fn(0, 0, 0.2, 0.2, 0);   // 12 m/s at 60 fps
  eq(calls.clearAt, 2, 'an ordinary frame is still exactly two clearAt calls');
}
{
  // ...and a pathological step is bounded, not unbounded
  const { fn, calls } = mk(() => false, 0.8);
  fn(0, 0, 1000, 0, 0);
  assert(calls.clearAt <= 32, 'even a 1 km step is capped at 16 substeps (' + calls.clearAt + ' probes)');
}
{
  // sliding along a wall still works: blocked in x, free in z
  const R = 0.8;
  const { fn, player } = mk(wall(R), R);
  fn(9, 0, 3, 3, 0);
  assert(player.pos.x < 10 - R + 1e-6, 'x is stopped by the wall');
  assert(player.pos.z > 2.9, '...while z slides the full distance (' + player.pos.z.toFixed(2) + ')');
}
{
  // the escape hatch survives: a player already embedded moves freely so they can get out
  const { fn, player, calls } = mk(() => true, 0.8);
  fn(0, 0, 5, 0, 0);
  eq(player.pos.x, 5, 'a stuck player walks straight out, unobstructed');
  eq(calls.clearAt, 0, '...without a single clearance probe, and in one step rather than sixteen');
}
{
  // a zero move is a no-op, and must not divide by zero
  const { fn, player } = mk(() => false, 0.8);
  fn(3, 4, 0, 0, 0);
  assert(player.pos.x === 3 && player.pos.z === 4, 'a zero move goes nowhere and produces no NaN');
}

// ---------------------------------------------------------------- the shape of the fix
{
  const fn = extractFunction('moveHorizontal');
  assert(/const dist = Math\.hypot\(dx, dz\);/.test(fn), 'the step length drives the substep count');
  assert(/const stepMax = Math\.max\(0\.05, R \* 0\.5\);/.test(fn),
    'no substep exceeds half a body radius — clearAt expands obstacles by R, so half of it cannot skip a band');
  assert(/const steps = \(stuck \|\| dist <= stepMax\) \? 1 : Math\.min\(16, Math\.ceil\(dist \/ stepMax\)\);/.test(fn),
    'bounded above at 16, and short moves and stuck players stay at 1');
  assert(/if\(!moved\) break;/.test(fn), 'a fully blocked substep ends the loop instead of spinning');
  assert(/if\(stuck \|\| clearAt\(destX, nz, feetY\)\)/.test(fn) && /if\(stuck \|\| clearAt\(nx, destZ, feetY\)\)/.test(fn),
    'each substep still resolves per axis, against the position the previous axis produced, which is what makes sliding work');
}
// the caller's numbers are what make this reachable — pin them so a change here is deliberate
assert(/const rawDt = Math\.min\(clock\.getDelta\(\), 0\.05\);/.test(src), 'dt is clamped at 0.05, i.e. 20 fps');
assert(/run:12,/.test(src), 'the default run speed is 12 m/s, so a clamped frame is 0.6 m');
assert(/radius: 0\.8,/.test(src), 'and the body radius is 0.8');

done('build 1131: movement is substepped — a blast, a jump pad or a bad frame can no longer push a player through a wall');
