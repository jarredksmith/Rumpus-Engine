// (build 1049) ALIGNMENT CONSISTENCY (the mangled-soldier regression) + CLEAR-ALL JOINT TWEAKS.
// 1047's rest-pose alignment picked each rig's "first mapped descendant" INDEPENDENTLY — when
// two rigs order the hips' children differently (spine-first vs legs-first), the hips aligned
// "spine direction onto thigh direction": a huge bogus rotation that twisted the whole body.
// The child is now chosen ONCE as a mapped pair (via the dst hierarchy) and both rigs measure
// to that pair's own ends. Plus: one button clears every joint tweak at once.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_buildBoneMap', src) + '\n' + extractFunction('_retargetClip', src);
const env = new Function('THREE', glue + '\nreturn { map:_buildBoneMap, rt:_retargetClip };')(THREE);

// two IDENTICAL T-pose skeletons — except the hips list their children in OPPOSITE order
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); if (p) p.add(b); return b; };
function rig(legsFirst) {
  const root = new THREE.Group();
  const hips = mkB('mixamorigHips', null, 0, 1, 0); root.add(hips);
  const legs = [];
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const ul = new THREE.Bone(); ul.name = 'mixamorig' + S + 'UpLeg'; ul.position.set(g * 0.1, -0.05, 0);
    const ll = mkB('mixamorig' + S + 'Leg', ul, 0, -0.45, 0);
    mkB('mixamorig' + S + 'Foot', ll, 0, -0.45, 0);
    legs.push(ul);
  }
  const spine = new THREE.Bone(); spine.name = 'mixamorigSpine'; spine.position.set(0, 0.2, 0);
  if (legsFirst) { hips.add(legs[0]); hips.add(legs[1]); hips.add(spine); }
  else { hips.add(spine); hips.add(legs[0]); hips.add(legs[1]); }
  const sp2 = mkB('mixamorigSpine2', spine, 0, 0.25, 0);
  const nk = mkB('mixamorigNeck', sp2, 0, 0.08, 0); mkB('mixamorigHead', nk, 0, 0.1, 0);
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const sh = mkB('mixamorig' + S + 'Shoulder', sp2, g * 0.08, 0.03, 0);
    const ua = mkB('mixamorig' + S + 'Arm', sh, g * 0.1, 0, 0);
    const fa = mkB('mixamorig' + S + 'ForeArm', ua, g * 0.25, 0, 0);
    mkB('mixamorig' + S + 'Hand', fa, g * 0.22, 0, 0);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const srcRoot = rig(true);    // the pack rig: legs listed FIRST under the hips
const dstRoot = rig(false);   // the auto-rig: spine listed first — the mangled-soldier setup
const clip = new THREE.AnimationClip('hold', 1, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
]);
{
  const map = env.map(dstRoot, srcRoot);
  assert(map, 'the rigs map');
  const rc = env.rt(dstRoot, srcRoot, clip, map);
  const mixer = new THREE.AnimationMixer(dstRoot);
  mixer.clipAction(rc).play(); mixer.setTime(0.5); dstRoot.updateWorldMatrix(true, true);
  const hipsQ = dstRoot.getObjectByName('mixamorigHips').getWorldQuaternion(new THREE.Quaternion());
  assert(hipsQ.angleTo(new THREE.Quaternion()) < 0.02,
    'THE FIX: identical rests with different child ORDER stay identity-aligned (the hips used to twist ~150°): ' + hipsQ.angleTo(new THREE.Quaternion()).toFixed(3));
  const ua = dstRoot.getObjectByName('mixamorigLeftArm'), fa = dstRoot.getObjectByName('mixamorigLeftForeArm');
  const d = fa.getWorldPosition(new THREE.Vector3()).sub(ua.getWorldPosition(new THREE.Vector3())).normalize();
  assert(d.x > 0.999, 'arms stay exactly where the clip puts them');
  const ll = dstRoot.getObjectByName('mixamorigLeftLeg'), ft = dstRoot.getObjectByName('mixamorigLeftFoot');
  const ld = ft.getWorldPosition(new THREE.Vector3()).sub(ll.getWorldPosition(new THREE.Vector3())).normalize();
  near(ld.y, -1, 1e-3, 'legs point straight down — no candy-wrapper twist');
  mixer.stopAllAction(); mixer.uncacheRoot(dstRoot);
}
// the machinery is pinned
assert(/const pairOfDst=new Map\(P\.map\(p=>\[p\.dst, p\]\)\);/.test(src), 'the child is resolved to a mapped PAIR');
assert(/p\.dst\.getWorldPosition\(_wa\); cp\.dst\.getWorldPosition\(_wb\);/.test(src) && /p\.src\.getWorldPosition\(_wc\); cp\.src\.getWorldPosition\(_wd\);/.test(src),
  '...and BOTH rigs measure to that same pair');
assert(!/firstMapped\(p\.src, srcSet\)/.test(src), 'the independent per-rig child pick is gone');

// ---- clear-all joint tweaks ----
assert(/clrA\.textContent='Clear all';/.test(src), 'the Clear-all button exists beside the per-bone Clear');
assert(/clrA\.onclick=\(\)=>\{ pushUndoSnapshot\(\); const m=jf\(\); for\(const k in m\) delete m\[k\]; refresh\(\);/.test(src),
  'one click wipes every bone offset (undoable, broadcast like the per-bone clear)');
assert(/toast\('All joint tweaks cleared'\)/.test(src), '...with confirmation');

done('build 1049: rest alignment is child-order-proof — the mangled-soldier twist is dead — and joint tweaks clear in one click');
