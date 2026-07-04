// (build 41) Per-prop surface finish: a Shininess (inverse roughness) + Metalness control on shape props,
// applied to the material and round-tripped through save/load.
import { extractFunction, extractConst, gameSource, done, assert, near } from './harness.mjs';

// Build applyPropShine with its helpers/constants in scope (real game source).
const env = [
  'const SHAPE_PRIMS = ' + extractConst('SHAPE_PRIMS') + ';',
  'const MAT_PRIMS = ' + extractConst('MAT_PRIMS') + ';',   // build 871: shine now covers the material-editable set
  'const PRIM_DEFAULT_ROUGH=0.65, PRIM_DEFAULT_METAL=0.35;',
  extractFunction('isShapePrimitive'),
  extractFunction('isMatPrimitive'),
  extractFunction('eachPrimMesh'),
  extractFunction('applyPropShine'),
  'return { applyPropShine, PRIM_DEFAULT_ROUGH, PRIM_DEFAULT_METAL };'
].join('\n');
const { applyPropShine, PRIM_DEFAULT_ROUGH, PRIM_DEFAULT_METAL } = new Function('Math', '"use strict";'+env)(Math);
// the injected defaults must match what the game actually declares
assert(/const PRIM_DEFAULT_ROUGH = 0\.65, PRIM_DEFAULT_METAL = 0\.35;/.test(gameSource()), 'game declares roughness 0.65 / metalness 0.35 defaults');

function mockProp(src){
  const mesh = { isMesh:true, material:{ roughness:0.65, metalness:0.35, needsUpdate:false } };
  return { userData:{ src }, _mesh:mesh, traverse(fn){ fn(this); fn(mesh); } };
}

// applies to the material + stores shine
let p = mockProp('box');
applyPropShine(p, 0.1, 0.9);
near(p._mesh.material.roughness, 0.1, 1e-9, 'roughness set on the mesh');
near(p._mesh.material.metalness, 0.9, 1e-9, 'metalness set on the mesh');
assert(p._mesh.material.needsUpdate === true, 'material flagged needsUpdate');
near(p.userData.shine.r, 0.1, 1e-9, 'shine.r stored');
near(p.userData.shine.m, 0.9, 1e-9, 'shine.m stored');

// clamps to [0,1]
applyPropShine(p, -2, 5);
near(p.userData.shine.r, 0, 1e-9, 'roughness clamps low');
near(p.userData.shine.m, 1, 1e-9, 'metalness clamps high');

// ignores non-primitive props (e.g. GLB models keep their own PBR)
let g = mockProp('https://example.com/thing.glb');
applyPropShine(g, 0.2, 0.2);
assert(g.userData.shine === undefined && g._mesh.material.roughness === 0.65, 'model props are left alone');

// defaults exist and match primitiveMat()
near(PRIM_DEFAULT_ROUGH, 0.65, 1e-9, 'default roughness 0.65');
near(PRIM_DEFAULT_METAL, 0.35, 1e-9, 'default metalness 0.35');

// --- wiring ---
const src = gameSource();
assert(/if\(mat\.shine\) applyPropShine\(obj, mat\.shine\.r, mat\.shine\.m\)/.test(src), 'applyStoredMaterial restores shine');
assert(/o\.userData\.shine && \(Math\.abs\(o\.userData\.shine\.r-PRIM_DEFAULT_ROUGH\)>1e-3/.test(src) && /m\.shine = \{ r:o\.userData\.shine\.r, m:o\.userData\.shine\.m \}/.test(src), 'serialize only stores non-default shine');
assert(/slider\('Shininess', \(1 - sh\.r\)/.test(src), 'UI shows Shininess as inverse roughness');
assert(/for\(const o of _matTargets\(\)\)\{ const cur=o\.userData\.shine\|\|\{ r:PRIM_DEFAULT_ROUGH, m:PRIM_DEFAULT_METAL \}; applyPropShine\(o, 1 - v, cur\.m\); \}/.test(src), 'Shininess slider writes roughness = 1 - value (bulk over selection)');
assert(/slider\('Metalness', sh\.m/.test(src), 'UI shows a Metalness slider');
done('per-prop shininess + metalness (apply / clamp / serialize / restore)');
