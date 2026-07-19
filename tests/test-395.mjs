import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 520: remote players'/bots' attached gun rendered arena-sized. Two causes:
//  (1) the weapon was sent as a numeric index, so WEAPONS[n] was undefined (stray model) and tpGunGrip(n)
//      returned a fresh scale:1 default instead of the tuned grip — fixed by sending the weapon key string;
//  (2) the default grip scale was tied to the GLB's authored size — fixed by normalizing the gun model to a
//      real-world size on load, so the grip scale is authoring-independent.

// (1) weapon key is a string over the wire
assert(/w:curWep,/.test(src), 'players send the weapon key string, not an index');
assert(!/w:owned\.indexOf\(curWep\)/.test(src), 'the old numeric weapon index is gone');
assert(/y:b\.yaw, pi:0, w:\(b\.wep\|\|'rifle'\),/.test(src), 'bots send their real weapon key (build 1013: clients render the gun each bot actually holds)');

// (2) the gun is size-normalized on load and the grip scale multiplies that factor
assert(/gun\.userData\.norm=\(_md>1e-4\)\?\(0\.62\/_md\):1;/.test(src), 'the gun is size-normalized on load');
assert(/let s = \(gr\.scale\|\|1\) \* \(gun\.userData\.norm\|\|1\);/.test(src), 'hand-grip scale uses the normalization factor');
assert(/gun\.scale\.setScalar\(\(gr\.scale\|\|1\) \* \(gun\.userData\.norm\|\|1\)\);/.test(src), 'body-grip scale uses the normalization factor');

// the hand path still cancels the bone world scale so the net size equals grip*norm regardless of rig scale
const ah = extractFunction('_applyGunGripToHand');
assert(/if\(avg>1e-4\) s\/=avg;/.test(ah), 'hand path still divides out the bone world scale');

// sanity: a gun authored at 6.2 units normalizes to ~0.62 (a sensible held size) at grip scale 1
const md=6.2, norm=(md>1e-4)?(0.62/md):1; near(md*norm*1, 0.62, 1e-6, 'a 6.2u gun renders ~0.62u at scale 1');

done();
