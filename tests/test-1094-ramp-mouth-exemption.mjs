// build 1094: the floor-not-obstacle exemption samples at the CONTACT point, not the box centre.
//
// Found by probing a generated arena (stepped hill, summit ramp): the greedy merge fused the
// summit slab's side face and the ramp-mouth cells into ONE long box. Its centre hung over open
// air beside the ramp, so the build-1092 exemption raycast found only the distant ground floor,
// concluded "this box top matches no surface", and shoved climbing enemies off the last two
// metres of the ramp. Sampling just inside the box at the point of contact asks about the ground
// the enemy is actually stepping onto. The tolerance also widened 0.66 -> 0.85 to cover the
// worst legal quantisation overshoot (0.45 rise/cell + 0.36 slot).
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();
const m = src.match(/if\(d < eR && d > 1e-4\)\{\n([\s\S]{0,2000}?)\n          \}/);
assert(m, 'the enemy resolve contact branch is found');
const body = m[1];

// the sample point is nudged INSIDE the box along the contact normal: cx - dx/d*0.1. dx points
// from the box toward the enemy, so subtracting walks 0.1 into the box — onto the merged box's
// own footprint right where the enemy touches it, never over open air beside it.
assert(/const st = surfaceTopUnder\(cx - dx\/d\*0\.1, cz - dz\/d\*0\.1, b\.max\.y\+0\.05, b\.max\.y\+2\);/.test(body),
  'the surface is sampled at the contact point, 0.1 inside the box face');
assert(!/surfaceTopUnder\(\(b\.min\.x\+b\.max\.x\)\/2/.test(body), 'the old box-centre sample is gone');

// 0.85 tolerance: strictly more than the worst quantisation overshoot at the steepest generated
// slope (0.45/cell + 0.36 slot ~= 0.81), strictly less than the 1.1 near-step gate above it —
// so a 1.1+ parapet or a 1.7 crate still pushes exactly as before.
assert(/b\.max\.y - st < 0\.85\) continue;/.test(body), 'tolerance covers slope+slot quantisation');
assert(/b\.max\.y - \(en\.mesh\.position\.y-1\.4\) < STEP \+ 0\.5/.test(body), 'the near-step gate still guards the raycast');

done('build 1094: ramp summits merged into wall boxes no longer shove climbers');
