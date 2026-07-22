// (build 1055) MARKER DEPTH-CENTERING — author, with the actual model attached: a deep-bodied
// cartoon character still folded and crushed under every pack clip even after 1054 proved the
// bone TRANSFORMS were pack-exact. The last culprit was the skeleton's PLACEMENT: the auto-rig
// modal raycasts each click and keeps the first hit — the front shell — so on a deep belly and
// a long snout the whole skeleton sat on the model's front surface (hips on the belly front,
// head bone on the snout tip). Every rotation then pivoted the mesh around front-shell axes:
// measured on the real model, worst edge distortion 1958% vs the pack's own rig at 74%. The
// rigger now re-centers each marker's depth to the mesh's own z-midpoint at that (x,y), at
// APPLY time — so markers already saved in levels heal on every load (distortion fell to 381%,
// bone rotations unchanged). This test builds a deep-bodied blocky humanoid, places markers on
// its FRONT SURFACE exactly as the modal would, and asserts the bones land in the body core.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const names = ['_sanitizeAutoRig', '_autoRigJoints', '_autoRigApply', '_arBlendR', '_arWeightKernel', '_segDist2',
  '_arJoints', '_arJointEnforce', '_arSmoothWeights', '_arSmoothIters'];
const glue = "const AUTORIG_MARKERS=['chin','wristL','wristR','elbowL','elbowR','kneeL','kneeR','groin'];\n"
  + names.map(n => extractFunction(n, src)).join('\n');
const env = new Function('THREE', glue + '\nreturn { apply:_autoRigApply };')(THREE);

// a deep-bodied blocky humanoid: torso a full 1.0 deep, head deep and pushed forward (snout)
function part(root, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.position.set(x, y, z); root.add(m); return m;
}
const scene = new THREE.Group();
part(scene, 0.8, 0.9, 1.0, 0, 1.0, 0);          // torso: front face at z=+0.5, core at z=0
part(scene, 0.4, 0.4, 1.2, 0, 1.7, 0.3);        // head: deep snouted block, front at z=0.9
part(scene, 0.7, 0.2, 0.16, 0.75, 1.35, 0);     // left arm out (T-pose-ish)
part(scene, 0.7, 0.2, 0.16, -0.75, 1.35, 0);
part(scene, 0.16, 0.7, 0.2, 0.18, 0.3, 0);      // legs
part(scene, 0.16, 0.7, 0.2, -0.18, 0.3, 0);
part(scene, 0.16, 0.1, 0.4, 0.18, -0.08, 0.1);  // feet, toes +z
part(scene, 0.16, 0.1, 0.4, -0.18, -0.08, 0.1);
scene.updateWorldMatrix(true, true);
const gltf = { scene, userData: {} };

// markers ON THE FRONT SURFACES — exactly what the modal's first-hit raycast produces
const markers = {
  chin: [0, 1.55, 0.9],                          // clicked the chin, hit the snout front
  wristL: [1.05, 1.35, 0.08], wristR: [-1.05, 1.35, 0.08],
  elbowL: [0.62, 1.35, 0.08], elbowR: [-0.62, 1.35, 0.08],
  kneeL: [0.18, 0.42, 0.1], kneeR: [-0.18, 0.42, 0.1],
  groin: [0, 0.62, 0.5],                         // clicked the crotch, hit the belly front
};
assert(env.apply(gltf, markers), 'the deep-bodied humanoid auto-rigs');
scene.updateWorldMatrix(true, true);
const bone = (n) => scene.getObjectByName('mixamorig' + n);
const wz = (n) => bone(n).getWorldPosition(new THREE.Vector3()).z;

// THE FIX: the skeleton sits in the body CORE, not on the front shell
assert(Math.abs(wz('Hips')) < 0.15,
  'the hips bone lands in the body core (was parked on the belly front at z=0.5): z=' + wz('Hips').toFixed(3));
assert(Math.abs(wz('Spine1')) < 0.2, 'the spine chain runs through the torso, not along its front: z=' + wz('Spine1').toFixed(3));
assert(wz('Head') < 0.45, 'the head bone centers in the skull instead of riding the snout tip (was z=0.9): z=' + wz('Head').toFixed(3));
assert(Math.abs(wz('LeftUpLeg')) < 0.15 && Math.abs(wz('LeftLeg')) < 0.15, 'leg bones center in the legs');
assert(Math.abs(wz('LeftHand')) < 0.1, 'the wrist centers in the arm');
{ // toes still point forward — the toe-direction detection survives the re-centering
  const tz = wz('LeftToeBase') - wz('LeftFoot');
  assert(tz > 0, 'toes still resolve toward +z: ' + tz.toFixed(3));
}
{ // the skinned result exists and every vertex is weighted
  let sm = null; scene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
  assert(sm, 'meshes became SkinnedMeshes');
  const SW = sm.geometry.attributes.skinWeight;
  let ok = true;
  for (let i = 0; i < SW.count; i++) { const t = SW.getX(i) + SW.getY(i) + SW.getZ(i) + SW.getW(i); if (Math.abs(t - 1) > 1e-3) ok = false; }
  assert(ok, 'weights still normalize after the depth pass');
}

// the machinery is pinned
assert(/const _zCenter=\(x,y\)=>\{/.test(src), 'the depth probe exists');
assert(/for\(const k of AUTORIG_MARKERS\)\{ const zc=_zCenter\(mk\[k\]\[0\], mk\[k\]\[1\]\); if\(zc!==null\) mk\[k\]\[2\]=zc; \}/.test(src),
  'every marker depth re-centers at APPLY time — saved markers heal on load, no re-clicking');
assert(/return \(zmin<=zmax\) \? \(zmin\+zmax\)\/2 : null;/.test(src),
  'the probe answers with the mesh z-midpoint, or leaves the marker alone when nothing is near');

done('build 1055: the auto-rig skeleton lives inside the body — deep-bodied characters stop folding around their own front surface');
