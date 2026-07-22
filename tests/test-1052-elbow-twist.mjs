// (build 1052) ELBOW TWIST — author: "the arms at the elbow are still getting crunched a
// little" under pack clips, manual posing clean — so retarget transforms again. Rest alignment
// computed an INDEPENDENT shortest arc per bone: every bone's direction matched the pack, but
// each arc picks its own roll, so adjacent bones could disagree by a twist about the limb axis
// (in the scenario below: 23° of bogus relative rotation at the elbow, 18° of it pure twist) —
// elbow verts blending uparm+forearm weights got candy-wrapped. Alignment is now HIERARCHICAL:
// each bone starts from its parent chain's align and adds only the minimal SWING residual that
// carries the transported bone direction onto the source's — zero relative twist between
// adjacent bones. Anatomy end bones (build 1051) now RIDE the chain instead of sitting at
// identity, so an A-pose wrist lifts with its arm instead of kinking.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_buildBoneMap', src) + '\n' + extractFunction('_retargetClip', src);
const env = new Function('THREE', glue + '\nreturn { map:_buildBoneMap, rt:_retargetClip };')(THREE);
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); if (p) p.add(b); return b; };

// the pack rests in T with the elbow bent 30° forward; the import is the SAME arm dropped 45°
// at the shoulder — a rigid rotation of the whole arm: same anatomy, different pose. The one
// correct alignment is that rigid rotation applied to every arm bone; any relative rotation
// between uparm and forearm is an injected elbow error.
const C = Math.SQRT1_2;
function rig(dropped) {
  const root = new THREE.Group();
  const hips = mkB('mixamorigHips', null, 0, 1, 0); root.add(hips);
  const sp = mkB('mixamorigSpine', hips, 0, 0.2, 0), sp2 = mkB('mixamorigSpine2', sp, 0, 0.25, 0);
  const nk = mkB('mixamorigNeck', sp2, 0, 0.08, 0); mkB('mixamorigHead', nk, 0, 0.1, 0);
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const u = dropped ? [g * C, -C, 0] : [g, 0, 0];                                   // uparm dir
    const f = dropped ? [g * 0.866 * C, -0.866 * C, 0.5] : [g * 0.866, 0, 0.5];       // forearm dir, elbow 30° forward
    const sh = mkB('mixamorig' + S + 'Shoulder', sp2, g * 0.08, 0.03, 0);
    const ua = mkB('mixamorig' + S + 'Arm', sh, g * 0.1, 0, 0);
    const fa = mkB('mixamorig' + S + 'ForeArm', ua, 0.25 * u[0], 0.25 * u[1], 0.25 * u[2]);
    mkB('mixamorig' + S + 'Hand', fa, 0.22 * f[0], 0.22 * f[1], 0.22 * f[2]);
    const ul = mkB('mixamorig' + S + 'UpLeg', hips, g * 0.1, -0.05, 0);
    const ll = mkB('mixamorig' + S + 'Leg', ul, 0, -0.45, 0);
    mkB('mixamorig' + S + 'Foot', ll, 0, -0.45, 0);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const srcRoot = rig(false);   // the pack: T-pose, elbow bent forward
const dstRoot = rig(true);    // the import: the same arm rotated 45° down at the shoulder
const clip = new THREE.AnimationClip('hold', 1, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
]);
const dirOf = (root, a, b) => root.getObjectByName(b).getWorldPosition(new THREE.Vector3())
  .sub(root.getObjectByName(a).getWorldPosition(new THREE.Vector3())).normalize();
const wq = (root, n) => root.getObjectByName(n).getWorldQuaternion(new THREE.Quaternion());

// first, the defect the old independent arcs injected HERE (documents what this build kills):
{
  const uD = new THREE.Vector3(C, -C, 0), uS = new THREE.Vector3(1, 0, 0);
  const fD = new THREE.Vector3(0.866 * C, -0.866 * C, 0.5).normalize(), fS = new THREE.Vector3(0.866, 0, 0.5).normalize();
  const rel = new THREE.Quaternion().setFromUnitVectors(uD, uS).invert()
    .multiply(new THREE.Quaternion().setFromUnitVectors(fD, fS));
  const ang = 2 * Math.acos(Math.min(1, Math.abs(rel.w)));
  assert(ang > 0.3, 'the OLD per-bone arcs really did wring this elbow: ' + (ang * 180 / Math.PI).toFixed(1) + '° of bogus relative rotation');
}
{
  const map = env.map(dstRoot, srcRoot);
  assert(map, 'the rigs map');
  const rc = env.rt(dstRoot, srcRoot, clip, map);
  const mixer = new THREE.AnimationMixer(dstRoot);
  mixer.clipAction(rc).play(); mixer.setTime(0.5); dstRoot.updateWorldMatrix(true, true);
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const arm = dirOf(dstRoot, 'mixamorig' + S + 'Arm', 'mixamorig' + S + 'ForeArm');
    assert(g * arm.x > 0.98 && Math.abs(arm.y) < 0.05, S + ' arm still lifts to the clip’s T: ' + arm.x.toFixed(2) + ',' + arm.y.toFixed(2));
    const fore = dirOf(dstRoot, 'mixamorig' + S + 'ForeArm', 'mixamorig' + S + 'Hand');
    assert(fore.dot(new THREE.Vector3(g * 0.866, 0, 0.5)) > 0.998,
      S + ' forearm lands on the pack’s direction (the 30° forward bend): ' + fore.x.toFixed(2) + ',' + fore.y.toFixed(2) + ',' + fore.z.toFixed(2));
    // THE FIX — a rigid-rotation pose difference must not create ANY relative rotation at the
    // elbow (rest world quats are identity, so the joint's relative quat should stay identity)
    const rel = wq(dstRoot, 'mixamorig' + S + 'Arm').invert().multiply(wq(dstRoot, 'mixamorig' + S + 'ForeArm'));
    const ang = 2 * Math.acos(Math.min(1, Math.abs(rel.w)));
    assert(ang < 0.02, 'THE FIX: zero alignment-injected rotation at the ' + S + ' elbow (was ~23°): ' + (ang * 180 / Math.PI).toFixed(2) + '°');
    // the wrist RIDES the chain: the hand (an anatomy bone, no align of its own) inherits the
    // forearm's align instead of sitting at identity — no kink where hand verts meet forearm verts
    const wrist = wq(dstRoot, 'mixamorig' + S + 'ForeArm').invert().multiply(wq(dstRoot, 'mixamorig' + S + 'Hand'));
    const wang = 2 * Math.acos(Math.min(1, Math.abs(wrist.w)));
    assert(wang < 0.02, 'the ' + S + ' wrist rides with its arm (the hand used to stay at identity, a ~39° kink): ' + (wang * 180 / Math.PI).toFixed(2) + '°');
  }
  const shin = dirOf(dstRoot, 'mixamorigLeftLeg', 'mixamorigLeftFoot');
  near(shin.y, -1, 1e-2, 'legs stay straight down — the leg chain (identical rests) is untouched');
  mixer.stopAllAction(); mixer.uncacheRoot(dstRoot);
}
// the machinery is pinned (build 1053: frame-anchored — same guarantees, no chain composition;
// a rigid arm drop is a rotation about the forward ref axis, which the frame method maps exactly)
assert(/const walkAlign=\(node, parentAlign\)=>\{/.test(src) && /walkAlign\(dstRoot, new THREE\.Quaternion\(\)\);/.test(src),
  'alignment walks the dst hierarchy top-down (anatomy bones need their nearest aligned ancestor)');
assert(/_md\.makeBasis\(_wb, _bd, _nd\); _ms\.makeBasis\(_wd, _bs, _ns\);/.test(src),
  'each bone aligns a full rest frame (direction + world reference axis) — roll is determined, not arbitrary');
assert(/p\.align\.copy\(parentAlign\);/.test(src),
  'anatomy end bones inherit the chain’s align (ride along) instead of resetting to identity');
assert(!/p\.align\.setFromUnitVectors\(_wb\.normalize\(\), _wd\.normalize\(\)\);/.test(src),
  'the independent per-bone shortest arc (arbitrary roll) is gone');

done('build 1052: rigid pose differences map limbs rigidly — elbows keep exactly the pack’s bend, wrists ride their arms');
