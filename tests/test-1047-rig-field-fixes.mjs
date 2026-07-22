// (build 1047) RIGGED-MODEL FIELD FIXES — author session with screenshots:
//  1) shins were unposeable: _canonBoneKey says 'L:lowleg', the editor vocabulary said 'L:leg'
//     — the slots never met, so the bone tree had no shin/knee row.
//  2) Front/Back view presets were swapped: GLB characters face +Z by convention.
//  3) "arms crossed behind the back" on most imports: the library retargeter assumed both rigs
//     share a rest pose, so an A-pose model inherited every T-pose clip offset by the A/T
//     difference. _retargetClip now aligns rest bone directions per pair.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- 1) the vocabulary speaks the engine's dialect ----
const CA_SLOTS_SRC = src.match(/const CA_SLOTS = \[[\s\S]*?\];/)[0];
assert(CA_SLOTS_SRC.includes("'L:lowleg'") && CA_SLOTS_SRC.includes("'R:lowleg'"), 'the slot list uses lowleg');
assert(!/'L:leg'|'R:leg'/.test(src), "no stale 'L:leg' slots survive anywhere");
{
  const env = new Function('THREE',
    extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n' + extractFunction('_caGatherBones', src)
    + '\nreturn _caGatherBones;')(THREE);
  const mk = (n, p) => { const b = new THREE.Bone(); b.name = n; if (p) p.add(b); return b; };
  const root = new THREE.Group();
  const hips = mk('mixamorigHips'); root.add(hips);
  const ul = mk('mixamorigLeftUpLeg', hips), ll = mk('mixamorigLeftLeg', ul), ft = mk('mixamorigLeftFoot', ll);
  const m = env(root);
  eq(m.get('L:lowleg') && m.get('L:lowleg').name, 'mixamorigLeftLeg', 'the auto-rig shin FINALLY answers a slot — knees are poseable');
  eq(m.get('L:upleg').name, 'mixamorigLeftUpLeg', 'the thigh still resolves beside it');
}

// ---- 2) Front is the face ----
assert(/v==='f'\?0 : v==='b'\?Math\.PI : v==='s'\?Math\.PI\/2 : 0\.6/.test(src),
  'Front parks the camera at +Z (the GLB facing convention), Back at -Z');

// ---- 3) rest-pose alignment: a T-pose clip lands upright on an A-pose rig ----
const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_buildBoneMap', src) + '\n' + extractFunction('_retargetClip', src);
const env = new Function('THREE', glue + '\nreturn { map:_buildBoneMap, rt:_retargetClip };')(THREE);
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); if (p) p.add(b); return b; };
function rig(armDrop) {   // armDrop 0 = T-pose (arms along ±X); 0.785 = A-pose (45° down)
  const root = new THREE.Group();
  const hips = mkB('mixamorigHips', null, 0, 1, 0); root.add(hips);
  const sp = mkB('mixamorigSpine', hips, 0, 0.2, 0), sp2 = mkB('mixamorigSpine2', sp, 0, 0.25, 0);
  const nk = mkB('mixamorigNeck', sp2, 0, 0.08, 0); mkB('mixamorigHead', nk, 0, 0.1, 0);
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const sh = mkB('mixamorig' + S + 'Shoulder', sp2, g * 0.08, 0.03, 0);
    const ua = mkB('mixamorig' + S + 'Arm', sh, g * 0.1, 0, 0);
    const fa = mkB('mixamorig' + S + 'ForeArm', ua, g * 0.25 * Math.cos(armDrop), -0.25 * Math.sin(armDrop), 0);
    mkB('mixamorig' + S + 'Hand', fa, g * 0.22 * Math.cos(armDrop), -0.22 * Math.sin(armDrop), 0);
    const ul = mkB('mixamorig' + S + 'UpLeg', hips, g * 0.1, -0.05, 0);
    const ll = mkB('mixamorig' + S + 'Leg', ul, 0, -0.45, 0);
    mkB('mixamorig' + S + 'Foot', ll, 0, -0.45, 0);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const srcRoot = rig(0);                    // the pack rests in T
const dstA = rig(Math.PI / 4);             // the import rests in A (45° down)
const clip = new THREE.AnimationClip('TPoseHold', 1, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
]);   // the source animation IS its rest pose — a T-pose hold
const armDir = (root) => {
  const ua = root.getObjectByName('mixamorigLeftArm'), fa = root.getObjectByName('mixamorigLeftForeArm');
  return fa.getWorldPosition(new THREE.Vector3()).sub(ua.getWorldPosition(new THREE.Vector3())).normalize();
};
near(armDir(dstA).y, -Math.SQRT1_2, 1e-3, 'sanity: the A-pose rig rests with arms 45° down');
{
  const map = env.map(dstA, srcRoot);
  assert(map, 'the two rigs map');
  const rc = env.rt(dstA, srcRoot, clip, map);
  assert(rc, 'the T-pose hold retargets');
  const mixer = new THREE.AnimationMixer(dstA);
  mixer.clipAction(rc).play(); mixer.setTime(0.5); dstA.updateWorldMatrix(true, true);
  const d = armDir(dstA);
  assert(Math.abs(d.y) < 0.05 && d.x > 0.98,
    'THE FIX: the A-pose arms lift to the clip’s T (were stuck 45° low, reading as crossed-behind-the-back): dir=' + d.x.toFixed(2) + ',' + d.y.toFixed(2));
  mixer.stopAllAction(); mixer.uncacheRoot(dstA);
}
{ // a T-pose rig is untouched by the alignment (identity when rests agree)
  const dstT = rig(0);
  const map = env.map(dstT, srcRoot);
  const rc = env.rt(dstT, srcRoot, clip, map);
  const mixer = new THREE.AnimationMixer(dstT);
  mixer.clipAction(rc).play(); mixer.setTime(0.5); dstT.updateWorldMatrix(true, true);
  const d = armDir(dstT);
  assert(Math.abs(d.y) < 1e-3 && d.x > 0.999, 'matching rests: alignment is the identity, nothing moves');
  mixer.stopAllAction(); mixer.uncacheRoot(dstT);
}
// the machinery is pinned
assert(/p\.align\.setFromUnitVectors\(_wb\.normalize\(\), _wd\.normalize\(\)\);/.test(src), 'per-pair rest directions align dst -> src');
assert(/multiply\(pr\.srcRestInv\)\.multiply\(pr\.align\)\.multiply\(pr\.dstRestW\)/.test(src), 'the delta flows through the alignment');
assert(/const firstMapped=\(node, set\)=>\{/.test(src), 'bone directions aim at the first MAPPED descendant (helpers skipped)');

done('build 1047: knees poseable, Front is the face, and A-pose imports finally stand like the clips they play');
