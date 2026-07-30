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
const m = src.match(/if\(d < eR && d > 1e-4\)\{\n([\s\S]{0,3000}?)\n          \}/);
assert(m, 'the enemy resolve contact branch is found');
const body = m[1];

// build 1158 rewrote the exemption to ask the PLAYER's question — this collider's own surface at the contact
// point, within a step or a walkable slope — and the reason is that 1092/1094's gate was a fact about the
// BOUNDING BOX. A ramp primitive is one mesh with one box floor-to-summit, so at the foot of a 2.4 m ramp
// `b.max.y - feetY` is 2.4, the gate failed, the raycast never ran, and an enemy was fenced off the ramp
// entirely. Measured by replaying the real pass: 0.00 m climbed in four seconds. See test-1158.
//
// What THIS build established survives the rewrite and is what is pinned now: never sample on the box
// boundary. A ray aimed at the exact edge grazes the mesh and reads -Infinity, and over a merged box the
// centre can hang over open air beside the ramp — either way a ramp mouth is mistaken for a wall.
assert(/const sx = cx \+ Math\.sign\(bcx-cx\)\*Math\.min\(0\.25, Math\.abs\(bcx-cx\)\);/.test(body),
  'the sample point is nudged INSIDE the box, never taken on its boundary');
assert(/const sz = cz \+ Math\.sign\(bcz-cz\)\*Math\.min\(0\.25, Math\.abs\(bcz-cz\)\);/.test(body), '...on both axes');
assert(/Math\.min\(0\.25,/.test(body),
  '...and the nudge is CLAMPED, so a thin box is not sampled past its own far face');
assert(!/surfaceTopUnder\(\(b\.min\.x\+b\.max\.x\)\/2/.test(body), 'the old box-centre sample is gone');

// and it asks that collider alone, so a merged box can no longer answer with the distant ground floor
assert(/propSurfaceAt\(c, sx, sz\)/.test(body),
  'the surface question is scoped to THIS collider — a merged box cannot answer with the floor beside it');
assert(!/b\.max\.y - \(en\.mesh\.position\.y-1\.4\) < STEP \+ 0\.5/.test(body),
  'and the bounding-box gate that made a tall ramp unreachable is gone (build 1158)');

done('build 1094: the walk-surface sample is taken inside the box at the contact point, never on its boundary or centre — still true after build 1158 rewrote the exemption around it');
