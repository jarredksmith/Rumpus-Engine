import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 646: cross-rig FBX normalization. Clips retargeted from a skeleton of a different scale bake a huge
// constant offset into the hips/root Y track, which flings the body high into the air. The per-clip "In place"
// lock now grounds the root bone's HEIGHT (y) to the rest baseline — same track-when-unlocked / hold-when-locked
// mechanism already used for x/z — so a foreign clip animates at the right height with no new UI.

// rest capture now records y as well as x/z
assert(/model\.userData\.rootRest=\{ x:_rb\.position\.x, y:_rb\.position\.y, z:_rb\.position\.z \}/.test(src), 'rootRest captures the rest hip height (y)');

const _lockRootMotion = new Function('return (' + extractFunction('_lockRootMotion') + ')')();
const mk = (rootRest) => { const rb = new THREE.Bone(); return { rb, v: { userData: { rootBone: rb, rootRest, animCfg: { clipInPlace: { walk: true } } } } }; };

// a foreign clip lifts the hips 6m off the floor; once locked it snaps back to the idle rest height
{
  const { rb, v } = mk({ x: 0, y: 0, z: 0 });
  rb.position.set(0, 0.92, 0); v.userData.animState = 'idle'; _lockRootMotion(v);   // idle seats hips at 0.92
  rb.position.set(0.3, 6.5, -1.2); v.userData.animState = 'walk'; _lockRootMotion(v); // retargeted walk flings up + forward
  assert(Math.abs(rb.position.y - 0.92) < 1e-9, 'locked clip is grounded to the idle rest height (0.92), not the 6.5 it tried to lift to');
  assert(Math.abs(rb.position.x) < 1e-9 && Math.abs(rb.position.z) < 1e-9, 'forward travel still cancelled too');
}

// unlocked (idle) frames keep tracking the live height so the baseline follows the real rig
{
  const { rb, v } = mk({ x: 0, y: 0, z: 0 });
  rb.position.set(0, 1.4, 0); v.userData.animState = 'idle'; _lockRootMotion(v);
  assert(rb.position.y === 1.4, 'an unlocked frame is left untouched (height tracked, not pinned)');
  rb.position.set(0, 9, 0); v.userData.animState = 'walk'; _lockRootMotion(v);
  assert(Math.abs(rb.position.y - 1.4) < 1e-9, 'the next locked clip is held at the tracked 1.4, not 9');
}

done('build 646: in-place lock grounds retargeted-clip hip height to rest');
