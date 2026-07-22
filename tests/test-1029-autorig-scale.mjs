// (build 1029) AUTO-RIG AT ANY MODEL SCALE — field report: "if the model's scale is really
// large, it doesn't show up in the auto-rigging modal." Two stacked bugs:
//  1) The shared preview camera ships far=100; a large model's fitted distance sailed past it
//     and the modal rendered NOTHING. The planes now scale to the model (and restore on close
//     for the inventory inspector).
//  2) Deeper: _autoRigApply MIXED SPACES on a gltf root that carries its own scale — markers
//     arrive root-LOCAL from the modal, but the bbox/baked verts were WORLD and the generated
//     bones sat under the scaled root (scaling twice). Scale-1 roots made every space coincide,
//     hiding it. Everything now runs root-local. Verified live at x80 in the browser.
import * as THREE from 'three';
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the camera planes ----
const open_ = extractFunction('_arOpen', src);
assert(/_inspCam\.near=Math\.max\(0\.01, _arH\*0\.005\); _inspCam\.far=Math\.max\(100, _arDist \+ _arH\*8\); _inspCam\.updateProjectionMatrix\(\);/.test(open_),
  'the preview planes scale to the model (far=100 used to clip large models to nothing)');
assert(/_inspCam\.near=0\.01; _inspCam\.far=100; _inspCam\.updateProjectionMatrix\(\);/.test(extractFunction('_arClose', src)),
  'closing hands the shared camera back at inventory-inspector scale');
assert(/m\.getWorldScale\(_sv\); _arWS=Math\.max\(_sv\.x,_sv\.y,_sv\.z\)\|\|1;/.test(open_), 'the model’s own scale is captured');
assert(/sp\.scale\.setScalar\(_arH\*0\.085\/_arWS\)/.test(src), 'marker rings divide the scale back out (they used to render model-sized)');
assert(/const x0=_arX0\/_arWS;/.test(extractFunction('_arPlace', src)), 'the symmetry mirror axis converts world bbox center into marker space');

// ---- executable: a x5-scaled root rigs WITHOUT double-scaling ----
const fns = 'const AUTORIG_MARKERS = ' + extractConst('AUTORIG_MARKERS', src) + ';\n'
  + extractFunction('_sanitizeAutoRig', src) + '\n' + extractFunction('_autoRigJoints', src) + '\n'
  + extractFunction('_segDist2', src) + '\n' + extractFunction('_arBlendR', src) + '\n'
  + extractFunction('_arWeightKernel', src) + '\n'
  + extractFunction('_arSmoothWeights', src) + '\n'      // build 1039: surface weight smoothing
  + extractFunction('_arSmoothIters', src) + '\n' + extractFunction('_autoRigApply', src);   // build 1037: soft joint blending helpers
const env = new Function('THREE', 'console', fns + '\nreturn { _autoRigApply };')(THREE, console);
function box(w,h,d,x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial()); m.position.set(x,y,z); return m; }
const root=new THREE.Group();
root.add(box(0.5,0.7,0.28, 0,1.2,0));  root.add(box(0.26,0.3,0.26, 0,1.66,0.02));
root.add(box(0.62,0.11,0.12, 0.48,1.33,0)); root.add(box(0.62,0.11,0.12, -0.48,1.33,0));
root.add(box(0.16,0.9,0.2, 0.15,0.45,0.01)); root.add(box(0.16,0.9,0.2, -0.15,0.45,0.01));
root.add(box(0.16,0.08,0.34, 0.15,0.04,0.08)); root.add(box(0.16,0.08,0.34, -0.15,0.04,0.08));
root.scale.setScalar(5); root.updateWorldMatrix(true,true);
const preH=(()=>{ const b=new THREE.Box3().setFromObject(root); return b.max.y-b.min.y; })();
// markers in root-LOCAL space — exactly what the modal produces for a scaled model
const MK={ chin:[0,1.63,0.05], wristL:[0.7,1.33,0], wristR:[-0.7,1.33,0], elbowL:[0.42,1.33,0], elbowR:[-0.42,1.33,0], kneeL:[0.15,0.5,0.01], kneeR:[-0.15,0.5,0.01], groin:[0,0.86,0] };
const gltf={ scene:root, userData:{} };
eq(env._autoRigApply(gltf, MK), true, 'a x5-scaled root rigs');
root.updateWorldMatrix(true,true);
const postB=new THREE.Box3().setFromObject(root);
near(postB.max.y-postB.min.y, preH, preH*0.02, 'world height unchanged after rigging (the old code doubled the scale)');
let hips=null, sm=null; root.traverse(o=>{ if(!hips && o.isBone && o.name==='mixamorigHips') hips=o; if(!sm && o.isSkinnedMesh) sm=o; });
assert(hips && sm, 'skeleton + skinned meshes exist');
const hw=hips.getWorldPosition(new THREE.Vector3());
assert(hw.y > 0.86*5 && hw.y < 1.2*5, 'hips sit at ~5x their local height — bones live in root-local space, scaled ONCE by the root');
sm.geometry.computeBoundingBox();
assert(sm.geometry.boundingBox.max.y - sm.geometry.boundingBox.min.y < 2.2, 'baked geometry stays root-local (unscaled) — the root applies the scale at render');

// the root-local machinery is pinned (a refactor must keep the convention)
const ap = extractFunction('_autoRigApply', src);
assert(/const rootInv=new THREE\.Matrix4\(\)\.copy\(root\.matrixWorld\)\.invert\(\);/.test(ap) && /relM\.multiplyMatrices\(rootInv, m\.matrixWorld\);/.test(ap),
  'meshes bake through rootInv x meshWorld — root-local, the markers’ own space');

done('build 1029: auto-rig works at any model scale — camera planes fit, one consistent space, rings sized right');
