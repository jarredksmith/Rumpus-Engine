import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 493: a per-clip "In place" toggle (editor) cancels root-motion forward travel. The existing seat re-pin
// only resets the model-ROOT object, so clips that animate the hips/root BONE walked the body off its spot.
// _findRootBone caches the skeleton root + its rest x/z at load; each frame, after the seat re-pin, _lockRootMotion
// holds that bone's x/z at rest for any state flagged clipInPlace, so the clip animates on the spot.
// build 646: also holds the bone's rest HEIGHT (y) so a clip retargeted from a different-scale rig can't fling
// the body into the air; the y baseline is tracked from unlocked (idle) frames just like x/z.

// ---- wiring ----
assert(/function _findRootBone\(root\)/.test(src), 'root-bone finder exists');
assert(/function _lockRootMotion\(v\)/.test(src), 'per-frame in-place lock exists');
assert(/model\.userData\.rootBone=_rb; model\.userData\.rootRest=\{ x:_rb\.position\.x, y:_rb\.position\.y, z:_rb\.position\.z \}/.test(src), 'root bone + rest x/y/z captured at model load (y added build 646 to ground retargeted clips)');
assert(/_lockRootMotion\(_ownAvatar\.userData\.visual\)/.test(src), 'own third-person body is in the lock pass');
assert(/for\(const en of enemies\)\{ if\(en\.mesh\) _lockRootMotion/.test(src), 'enemies are in the lock pass too (no-op until flagged)');

// ---- the lock runs AFTER the seat re-pin (so it overrides the bone's animated x/z) ----
assert(src.indexOf('_lockRootMotion(_ownAvatar.userData.visual)') > src.indexOf('if(_ownAvatar){ const v=_ownAvatar.userData.visual, s=v&&v.userData.seat;'),
  'in-place lock runs after the own-avatar seat re-pin');

// ---- config plumbing mirrors clipHold ----
assert(/clipSpeed:\{\}, clipHold:\{\}, clipInPlace:\{\} \}\);/.test(src), 'playerModelCfg seeds clipInPlace');
assert(/clipInPlace:Object\.assign\(\{\}, \(c\.clipInPlace&&typeof c\.clipInPlace==='object'\)\?c\.clipInPlace:\{\}\)/.test(src), 'sanitize carries clipInPlace');
assert(/clipInPlace:Object\.assign\(\{\}, c\.clipInPlace\|\|\{\}\)/.test(src), 'myCharCfg broadcasts clipInPlace to peers');
assert(/playerModelCfg\.clipInPlace=Object\.assign\(\{\}, pl\.clipInPlace\|\|\{\}\)/.test(src), 'load restores clipInPlace');

// ---- editor toggle ----
assert(/playerModelCfg\.clipInPlace\[stKey\]=ip\.checked; rebuildAvatars\(\);/.test(src), 'editor "In place" toggle writes the per-state flag');

// ---- executable: _findRootBone against real three.js ----
const _findRootBone = new Function('return (' + extractFunction('_findRootBone') + ')')();
{
  const arm = new THREE.Object3D();
  const hips = new THREE.Bone(); hips.name = 'mixamorig:Hips';
  const spine = new THREE.Bone(); spine.name = 'Spine'; hips.add(spine);
  const leg = new THREE.Bone(); leg.name = 'LeftUpLeg'; hips.add(leg);
  arm.add(hips);
  assert(_findRootBone(arm) === hips, 'a hips/pelvis/root-named bone is chosen as the root');
}
{
  const arm = new THREE.Object3D();
  const top = new THREE.Bone(); top.name = 'b0';
  const child = new THREE.Bone(); child.name = 'b1'; top.add(child);
  const grand = new THREE.Bone(); grand.name = 'b2'; child.add(grand);
  arm.add(top);
  assert(_findRootBone(arm) === top, 'no conventional name -> the topmost bone (fewest bone-ancestors)');
}
assert(_findRootBone(new THREE.Object3D()) === null, 'no bones -> null (capsule body)');

// ---- executable: _lockRootMotion behaviour ----
const _lockRootMotion = new Function('return (' + extractFunction('_lockRootMotion') + ')')();
{
  const rb = new THREE.Bone(); rb.position.set(5, 2, -7);
  const v = { userData: { rootBone: rb, rootRest: { x: 0.1, y: 1.0, z: -0.2 }, animCfg: { clipInPlace: { walk: true } }, animState: 'walk' } };
  _lockRootMotion(v);
  assert(Math.abs(rb.position.x - 0.1) < 1e-9 && Math.abs(rb.position.z + 0.2) < 1e-9, 'flagged state -> hips x/z pinned to rest');
  assert(Math.abs(rb.position.y - 1.0) < 1e-9, 'build 646: vertical (y) is now pinned to rest height so a foreign-rig clip cannot fling the body into the air');
}
{
  const rb = new THREE.Bone(); rb.position.set(5, 2, -7);
  const v = { userData: { rootBone: rb, rootRest: { x: 0, z: 0 }, animCfg: { clipInPlace: { walk: true } }, animState: 'idle' } };
  _lockRootMotion(v);
  assert(rb.position.x === 5 && rb.position.z === -7, 'state not flagged -> no lock (idle keeps its motion)');
}
assert(_lockRootMotion({ userData: {} }) === undefined, 'no root bone -> safe no-op');

done();
