import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 495 (fix): the in-place lock pinned the hips to the BIND pose, but the idle clip seats the hips at its own
// baseline, so a locked walk clip sat at a different x/z than idle. Fix: track the hips x/z live from unlocked
// (idle/standing) frames and pin locked clips to THAT, so walk-in-place lines up exactly with where idle sits.

const _lockRootMotion = new Function('return (' + extractFunction('_lockRootMotion') + ')')();
const mkV = (rootRest) => { const rb = new THREE.Bone(); return { rb, v: { userData: { rootBone: rb, rootRest, animCfg: { clipInPlace: { walk: true, run: true } } } } }; };

// idle (unlocked) seats the hips at (0.4, -0.1); the lock should adopt THAT, not the bind pose (0,0)
{
  const { rb, v } = mkV({ x: 0, z: 0 });
  rb.position.set(0.4, 1, -0.1); v.userData.animState = 'idle';
  _lockRootMotion(v);
  assert(rb.position.x === 0.4 && rb.position.z === -0.1, 'idle frame left untouched');
  rb.position.set(0.4, 1.05, -2.3); v.userData.animState = 'walk';   // walk travels forward + the clip lifts the hips
  _lockRootMotion(v);
  assert(Math.abs(rb.position.x - 0.4) < 1e-9 && Math.abs(rb.position.z + 0.1) < 1e-9, 'locked walk aligns with the idle baseline (0.4,-0.1), not bind (0,0)');
  assert(Math.abs(rb.position.y - 1) < 1e-9, 'build 646: vertical pinned to the idle rest height (1), not the clip-lifted 1.05');
}

// a moving clip stays pinned across frames even as its pose travels (no drift)
{
  const { rb, v } = mkV({ x: 0, z: 0 });
  rb.position.set(0.2, 1, 0); v.userData.animState = 'idle'; _lockRootMotion(v);
  for (const z of [-0.5, -1.0, -1.5, 0.0]) {
    rb.position.set(0.5, 1, z); v.userData.animState = 'walk'; _lockRootMotion(v);
    assert(Math.abs(rb.position.x - 0.2) < 1e-9 && Math.abs(rb.position.z) < 1e-9, 'held at the idle baseline every frame');
  }
}

// returning to idle re-tracks the baseline
{
  const { rb, v } = mkV({ x: 0, z: 0 });
  rb.position.set(0.2, 1, 0); v.userData.animState = 'idle'; _lockRootMotion(v);
  rb.position.set(0.2, 1, -1); v.userData.animState = 'walk'; _lockRootMotion(v);
  rb.position.set(0.55, 1, 0.1); v.userData.animState = 'idle'; _lockRootMotion(v);   // new idle baseline
  rb.position.set(0.55, 1, -2); v.userData.animState = 'walk'; _lockRootMotion(v);
  assert(Math.abs(rb.position.x - 0.55) < 1e-9 && Math.abs(rb.position.z - 0.1) < 1e-9, 'lock follows the updated idle baseline after returning to idle');
}

// fallback: locked from the very first frame (no idle seen yet) -> the captured rest
{
  const { rb, v } = mkV({ x: 0.1, y: 1, z: -0.2 });
  rb.position.set(5, 2, -7); v.userData.animState = 'walk';
  _lockRootMotion(v);
  assert(Math.abs(rb.position.x - 0.1) < 1e-9 && Math.abs(rb.position.z + 0.2) < 1e-9 && Math.abs(rb.position.y - 1) < 1e-9, 'no idle frame yet -> x/z and height fall back to the captured rest');
}

assert(_lockRootMotion({ userData: {} }) === undefined, 'no root bone -> safe no-op');

// ---- source: track when unlocked, hold when locked ----
assert(/else \{ ref\.x=rb\.position\.x; ref\.z=rb\.position\.z; ref\.y=rb\.position\.y; \}/.test(src), 'unlocked frames track the live hips x/z + height');
assert(/if\(locked\)\{ rb\.position\.x=ref\.x; rb\.position\.z=ref\.z; rb\.position\.y=ref\.y; \}/.test(src), 'locked frames hold the tracked baseline (x/z + height)');

done();
