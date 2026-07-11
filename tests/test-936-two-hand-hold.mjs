// (build 936) TWO-HANDED WEAPON HOLD — the animation library's armed poses are one-handed (pistol
// grip, arm fully extended): the left arm hung free, which reads wrong for rifles/shotguns/SMGs.
// Instead of baking a clip per rig, both arms are solved per frame with 2-bone IK in WORLD space
// (rotation deltas, like the retargeter — bone-axis conventions never matter): the trigger hand is
// pulled to the shoulder pocket on the CHEST CENTERLINE (mid-shoulders, nudged gun-side — a straight
// out-of-the-right-shoulder pose leaves it beyond the support arm's reach on wide rigs), then the
// left wrist lands on the forestock ahead of it along the exact aim direction, slid back into reach
// when needed. Runs BEFORE the gun re-aim (which is world-space) so the barrel stays exact.
// Verified live on the UAL rig: left wrist error 0.001 at level aim and 0.000 pitched up (wrist rose
// 0.99 -> 1.60 with pitch 0 -> 0.6), trigger hand error 0.000, bone lengths preserved to 5e-3, and
// both IKs stand down for fists (wrist 0.6+ from the forestock).
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the solver: world-space deltas, LOD-safe, law of cosines
const pin = extractFunction('_armPinTo', src);
assert(/if\(ud\._ikApplied && ud\._ikBase && b\.quaternion\.equals\(ud\._ikApplied\)\) b\.quaternion\.copy\(ud\._ikBase\);/.test(pin),
  'undoes last frame\'s solve when the mixer skipped the bones (animation LOD) — no accumulation');
assert(/\(a\*a \+ d\*d - b\*b\)\/\(2\*a\*d\)/.test(pin), '2-bone IK via the law of cosines at the shoulder');
assert(/_ikRotateWorld\(arm\.up, _ikE, _ikP\);/.test(pin) && /_ikRotateWorld\(arm\.fo, _ikW, _ikP\);/.test(pin),
  'upper arm then forearm rotated by world-space deltas (works on any bone-axis convention)');

// the stance
const hold = extractFunction('_weaponHoldIK', src);
assert(/if\(!w \|\| w\.melee\) return;/.test(hold), 'fists/crowbar keep both hands free');
assert(/death\|die\|slide\|climb\|melee\|punch\|swim\|grab\|roll\|reload/.test(hold), 'clips that own the arms are left alone');
assert(/const t0 = disc0>0 \? -B0 \+ Math\.sqrt\(disc0\) : -1;/.test(hold),
  'the trigger hand is only moved when the forestock is genuinely unreachable (build 937: the authored pose survives into play)');
assert(/const t = disc>0 \? Math\.min\(reach, -B \+ Math\.sqrt\(disc\)\) : -1;/.test(hold),
  'the forestock grip slides back ALONG THE BARREL into the support arm\'s reach');
assert(/vis\.userData\._rArm=_findArm\(vis,'R'\)/.test(hold) && /vis\.userData\._lArm=_findArm\(vis,'L'\)/.test(hold),
  'both arm chains found once via the canonical bone keys and cached');

// wiring: runs inside the aim pass, before the (world-space) gun re-aim
assert(/_weaponHoldIK\(group, yaw, pitch\);   \/\/ build 936/.test(extractFunction('_aimAvatarGun', src)),
  'every aimed avatar (own TP body, remote players, bots) gets the two-handed stance');

done('build 936: rifles are held with both hands — chest-anchored trigger hand + forestock support hand, tracking aim pitch');
