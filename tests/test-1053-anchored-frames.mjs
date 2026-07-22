// (build 1053) FRAME-ANCHORED alignment — author, with crouch screenshots: "it smooshed the
// whole body and creased it strangely... chest/back look sucked into the middle of the mesh."
// 1052's chain-composed alignment had zero relative twist at any ONE joint, but small per-bone
// direction differences ACCUMULATED down long chains: the shoulders inherited the spine chain's
// drift (the sucked-in chest), and the thighs inherited the hips' spine-aiming arc (the rolled,
// smooshed crouch). Alignment is independent per bone again — globally anchored like 1051 —
// but as a full FRAME (bone direction + a deterministic world reference axis) so roll is fixed
// too: rigid pose differences still map limbs rigidly (the 1052 elbow win, kept by test-1052),
// while a bone whose rest matches the pack ALWAYS aligns to identity, no matter what its
// ancestors needed.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_buildBoneMap', src) + '\n' + extractFunction('_retargetClip', src);
const env = new Function('THREE', glue + '\nreturn { map:_buildBoneMap, rt:_retargetClip };')(THREE);
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); if (p) p.add(b); return b; };

// the soldier setup: arms and legs REST IDENTICALLY to the pack, but the auto-rig's spine
// segments lean a little differently — in different planes, so 1052's composed residuals
// drifted into twist by the time they reached the shoulders and thighs.
function rig(lean) {
  const root = new THREE.Group();
  const hips = mkB('mixamorigHips', null, 0, 1, 0); root.add(hips);
  const sp = mkB('mixamorigSpine', hips, 0, 0.2, lean ? 0.06 : 0);          // leans forward
  const sp2 = mkB('mixamorigSpine2', sp, lean ? 0.05 : 0, 0.25, 0);         // ...then sideways
  const nk = mkB('mixamorigNeck', sp2, lean ? -0.04 : 0, 0.08, 0); mkB('mixamorigHead', nk, 0, 0.1, 0);
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const sh = mkB('mixamorig' + S + 'Shoulder', sp2, g * 0.08, 0.03, 0);
    const ua = mkB('mixamorig' + S + 'Arm', sh, g * 0.1, 0, 0);
    const fa = mkB('mixamorig' + S + 'ForeArm', ua, g * 0.25, 0, 0);
    mkB('mixamorig' + S + 'Hand', fa, g * 0.22, 0, 0);
    const ul = mkB('mixamorig' + S + 'UpLeg', hips, g * 0.1, -0.05, 0);
    const ll = mkB('mixamorig' + S + 'Leg', ul, 0, -0.45, 0);
    mkB('mixamorig' + S + 'Foot', ll, 0, -0.45, 0);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const srcRoot = rig(false);   // the pack: straight spine
const dstRoot = rig(true);    // the import: same limbs, slightly wandering spine
const clip = new THREE.AnimationClip('hold', 1, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
]);
const wq = (n) => dstRoot.getObjectByName(n).getWorldQuaternion(new THREE.Quaternion());
const angOf = (q) => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
{
  const map = env.map(dstRoot, srcRoot);
  assert(map, 'the rigs map');
  const rc = env.rt(dstRoot, srcRoot, clip, map);
  const mixer = new THREE.AnimationMixer(dstRoot);
  mixer.clipAction(rc).play(); mixer.setTime(0.5); dstRoot.updateWorldMatrix(true, true);
  // THE FIX — bones that rest exactly like the pack align to IDENTITY, whatever the spine did:
  for (const S of ['Left', 'Right']) {
    assert(angOf(wq('mixamorig' + S + 'Shoulder')) < 0.02,
      S + ' shoulder is untouched by the spine drift (the chest stops getting sucked inward): ' + (angOf(wq('mixamorig' + S + 'Shoulder')) * 180 / Math.PI).toFixed(2) + '°');
    assert(angOf(wq('mixamorig' + S + 'UpLeg')) < 0.02 && angOf(wq('mixamorig' + S + 'Leg')) < 0.02,
      S + ' thigh+shin no longer inherit the hips’ spine-aiming arc (the smooshed-crouch roll): ' + (angOf(wq('mixamorig' + S + 'UpLeg')) * 180 / Math.PI).toFixed(2) + '°');
    assert(angOf(wq('mixamorig' + S + 'Foot')) < 0.03, S + ' foot rides an identity chain — flat feet survive');
    const ua = dstRoot.getObjectByName('mixamorig' + S + 'Arm'), fa = dstRoot.getObjectByName('mixamorig' + S + 'ForeArm');
    const d = fa.getWorldPosition(new THREE.Vector3()).sub(ua.getWorldPosition(new THREE.Vector3())).normalize();
    assert(('Left' === S ? d.x : -d.x) > 0.99, S + ' arm points exactly where the clip says');
  }
  // ...and (build 1054) the leaning spine KEEPS its lean — a spine chain's rest direction is
  // anatomy (the auto-rig draws it hips->chin; a forward chin must not fold the torso):
  const hipsB = dstRoot.getObjectByName('mixamorigHips'), spB = dstRoot.getObjectByName('mixamorigSpine');
  const sd = spB.getWorldPosition(new THREE.Vector3()).sub(hipsB.getWorldPosition(new THREE.Vector3())).normalize();
  assert(sd.z > 0.25 && sd.y > 0.94, 'the leaning spine keeps its own anatomy under the pack clip: ' + sd.y.toFixed(3) + ',' + sd.z.toFixed(3));
  mixer.stopAllAction(); mixer.uncacheRoot(dstRoot);
}
// the machinery is pinned
assert(/const ref = \(Math\.max\(Math\.abs\(_wb\.z\), Math\.abs\(_wd\.z\)\)<=0\.9\) \? _AZ/.test(src),
  'the reference axis is deterministic: character-forward Z, falling back when a bone runs along it');
assert(/_md\.makeBasis\(_wb, _bd, _nd\); _ms\.makeBasis\(_wd, _bs, _ns\);/.test(src),
  'both rigs build a full rest FRAME per bone (direction + reference), not just a direction');
assert(/p\.align\.multiplyQuaternions\(_qs\.setFromRotationMatrix\(_ms\), _qd\.setFromRotationMatrix\(_md\)\.invert\(\)\);/.test(src),
  'align maps dst frame onto src frame — aim AND roll are pinned to the world, per bone, no chain');
assert(!/p\.align\.multiplyQuaternions\(_resid, parentAlign\);/.test(src),
  'the chain-composed residual (1052) is gone — nothing accumulates down the skeleton');
assert(/p\.align\.setFromUnitVectors\(_wb, _wd\);/.test(src),
  'a bone lying along the reference axis falls back to aim-only alignment');

done('build 1053: alignment is anchored per bone — matching limbs stay untouched no matter how the spine wanders');
