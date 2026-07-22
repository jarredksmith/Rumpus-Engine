// (build 1051) ANATOMY vs POSE (crushed-boots-under-pack-anims — "it only crumples with the
// Quaternius animations; manual posing is fine"). The manual-pose evidence proved the WEIGHTS
// were fine — the retargeted transforms were wrong. Rest alignment (1047) forced every dst bone
// to point where the src bone points; for arms that's a POSE difference (the A-pose fix), but a
// foot bone's direction encodes ANATOMY (ankle height / toe position) — the pack's steep foot
// slope pitched aligned feet into the ground. End bones (hands, feet, toes, fingers, head) now
// keep pure delta retargeting; limb/spine bones keep the alignment.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_buildBoneMap', src) + '\n' + extractFunction('_retargetClip', src);
const env = new Function('THREE', glue + '\nreturn { map:_buildBoneMap, rt:_retargetClip };')(THREE);
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); if (p) p.add(b); return b; };

// same humanoid, but the SRC (pack) foot slopes 45° down while the DST (auto-rig) foot is level
function rig(footDropY, armDrop) {
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
    const ft = mkB('mixamorig' + S + 'Foot', ll, 0, -0.45, 0);
    mkB('mixamorig' + S + 'ToeBase', ft, 0, -footDropY, 0.18);   // level foot vs steep pack foot
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const srcRoot = rig(0.18, 0);        // the pack: foot bone slopes ~45° down (high ankle), T-pose arms
const dstRoot = rig(0.02, Math.PI / 4);   // the import: nearly level foot, A-pose arms — both differences at once
const clip = new THREE.AnimationClip('hold', 1, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
]);
const dirOf = (root, a, b) => root.getObjectByName(b).getWorldPosition(new THREE.Vector3())
  .sub(root.getObjectByName(a).getWorldPosition(new THREE.Vector3())).normalize();
const restFoot = dirOf(dstRoot, 'mixamorigLeftFoot', 'mixamorigLeftToeBase').clone();
{
  const map = env.map(dstRoot, srcRoot);
  assert(map, 'the rigs map');
  const rc = env.rt(dstRoot, srcRoot, clip, map);
  const mixer = new THREE.AnimationMixer(dstRoot);
  mixer.clipAction(rc).play(); mixer.setTime(0.5); dstRoot.updateWorldMatrix(true, true);
  const foot = dirOf(dstRoot, 'mixamorigLeftFoot', 'mixamorigLeftToeBase');
  assert(foot.angleTo(restFoot) < 0.03,
    'THE FIX: the level foot KEEPS ITS OWN anatomy under the pack idle (it used to pitch ~40° into the ground): off by ' + foot.angleTo(restFoot).toFixed(3));
  const arm = dirOf(dstRoot, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
  assert(Math.abs(arm.y) < 0.05 && arm.x > 0.98,
    'while the A-pose ARMS still lift to the clip’s T (pose alignment survives): ' + arm.x.toFixed(2) + ',' + arm.y.toFixed(2));
  const shin = dirOf(dstRoot, 'mixamorigLeftLeg', 'mixamorigLeftFoot');
  near(shin.y, -1, 1e-2, 'legs stay straight down');
  mixer.stopAllAction(); mixer.uncacheRoot(dstRoot);
}
// the scope rule is pinned
assert(/if\(\/\^\(\?:\[LR\]:\(\?:hand\|foot\|toe\|thumb\|index\|middle\|ring\|pinky\)\|head\)\/\.test\(p\.key\|\|''\)\) continue;/.test(src),
  'end bones (hands, feet, toes, fingers, head) are excluded from alignment — anatomy, not pose');
assert(/const P = map\.pairs\.map\(p=>\(\{ key:p\.key, dst:p\.dst, src:p\.src,/.test(src),
  'pairs carry their canonical key so the scope rule can see it');

done('build 1051: alignment fixes pose, never anatomy — feet stand flat under pack animations again');
