// (build 996) MODEL PART EDITOR v1. Select an imported prop -> "Edit model parts" -> recolor or
// delete individual parts with a live preview on the real prop, then bake the edits into a NEW
// hosted .glb (gltf-transform surgery on the build-986 pipeline) and swap the prop to it. The
// original model is untouched. Part identity: the i-th Mesh in three's traversal ~ the i-th
// (node, primitive) pair in the doc's pre-order DFS — GLTFLoader builds objects in glTF order.
// The doc-side functions are duck-typed; verified against the REAL gltf-transform in dev, and
// exercised here through a faithful mock so the suite stays dependency-free.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const _meshOrderOf = new Function('return (' + extractFunction('_meshOrderOf') + ')')();
const _docMeshOrder = new Function('return (' + extractFunction('_docMeshOrder') + ')')();
const _applyModelEditsToDoc = new Function('_docMeshOrder', 'return (' + extractFunction('_applyModelEditsToDoc') + ')')(_docMeshOrder);

// ---- a faithful mock of the gltf-transform graph (same duck-typed surface the shipped code uses) ----
function mkMat(name){ let color=[1,1,1,1]; return { name, cloned:false,
  clone(){ const c=mkMat(name+'-clone'); c.cloned=true; c._color=color.slice(); return c; },
  setBaseColorFactor(v){ this._color=v; return this; }, _color:color }; }
function mkPrim(mat){ return { _mat:mat, getMaterial(){ return this._mat; }, setMaterial(m){ this._mat=m; return this; } }; }
function mkMesh(name, prims){ return { name, _p:prims.slice(), listPrimitives(){ return this._p.slice(); }, removePrimitive(p){ this._p=this._p.filter(x=>x!==p); return this; } }; }
function mkNode(name, mesh, kids){ return { name, _m:mesh||null, _k:kids||[], getMesh(){ return this._m; }, setMesh(m){ this._m=m; return this; }, listChildren(){ return this._k.slice(); } }; }
function mkRoot(sceneKids){ return { listScenes(){ return [{ listChildren(){ return sceneKids.slice(); } }]; } }; }

// body(hat nested) + arm; hat SHARES the body's material — the shared-material trap
const paint = mkMat('paint'), metal = mkMat('metal');
const pBody = mkPrim(paint), pHat = mkPrim(paint), pArm = mkPrim(metal);
const hat = mkNode('hat', mkMesh('hat', [pHat]), []);
const body = mkNode('body', mkMesh('body', [pBody]), [hat]);
const arm = mkNode('arm', mkMesh('arm', [pArm]), []);
const root = mkRoot([body, arm]);

// pre-order DFS: body, hat, arm
eq(_docMeshOrder(root).map(e => e.node.name).join(','), 'body,hat,arm', 'doc enumeration is pre-order DFS (nested nodes in place)');

// delete the hat (1), tint the arm (2)
const stats = _applyModelEditsToDoc(root, { del: { 1: true }, tint: { 2: '#ff0000' } }, () => [1, 0, 0]);
eq(stats.total, 3, 'three parts seen'); eq(stats.del, 1, 'one deleted'); eq(stats.tint, 1, 'one tinted');
eq(hat.getMesh(), null, 'the emptied hat node detached its mesh (prune can drop the data)');
assert(pArm.getMaterial().cloned && pArm.getMaterial()._color[0] === 1 && pArm.getMaterial()._color[1] === 0,
  'the arm got a CLONED material with the linear tint');
eq(pBody.getMaterial(), paint, 'the body still uses the ORIGINAL shared material (tinting the arm never repaints the body)');
eq(pBody.getMaterial()._color[0], 1, '...and its color is untouched');

// ---- three-side enumeration matches the same ordinal scheme ----
{
  const g = new THREE.Group();
  const mBody = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); mBody.name = 'body';
  const mHat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); mHat.name = 'hat';
  const mArm = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); mArm.name = 'arm';
  mBody.add(mHat); g.add(mBody); g.add(mArm);
  eq(_meshOrderOf(g).map(m => m.name).join(','), 'body,hat,arm', 'three-side traversal yields the same order');
  eq(_meshOrderOf(null).length, 0, 'null-safe');
}

// ---- live preview: hide deleted, clone+tint recolored, restore on clear ----
const _mpeApply = new Function('_meshOrderOf', 'return (' + extractFunction('_mpeApply') + ')')(_meshOrderOf);
{
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  const b = new THREE.Mesh(new THREE.BoxGeometry(), a.material);   // SHARED material between parts
  g.add(a); g.add(b);
  g.userData.modelEdits = { del: { 0: true }, tint: { 1: '#00ff00' } };
  _mpeApply(g);
  eq(a.visible, false, 'staged-deleted part hides live');
  assert(b.material !== a.material && b.material.color.getHexString() === '00ff00', 'tinted part got its own clone, recolored');
  g.userData.modelEdits = { del: {}, tint: {} };
  _mpeApply(g);
  eq(a.visible, true, 'restore un-hides');
  eq(b.material, b.userData._mpeOrig, 'restore returns the original material');
}

// ---- wiring pins ----
assert(/async function _bakeModelEdits\(url, edits, name, say, done\)\{/.test(src), 'the bake exists');
assert(/const file=new File\(\[bytes\], base\+'-edit\.glb', \{ type:'model\/gltf-binary' \}\);/.test(src),
  'edited models re-host as <name>-edit.glb through the normal upload pipeline (original untouched)');
assert(/GT\.funcs\.dedup\(\), GT\.funcs\.prune\(\)/.test(src), 'the bake prunes orphaned data after the surgery');
assert(/if\(tgt===editorTargets\.props && typeof renderModelParts==='function'\) renderModelParts\(urlHost, tgt\);/.test(src),
  'the parts panel renders under the model widget for the props target');
assert(/edFold\(host, 'modelparts', 'Edit model parts', false,/.test(src), 'it is a normal inspector fold');
assert(/obj\.userData\.modelEdits=undefined; if\(tgt\.setUrl\) tgt\.setUrl\(nu\);/.test(src),
  'a successful bake clears the staged edits and swaps the prop to the new model');
assert(/const c=new THREE\.Color\(hex\); if\(c\.convertSRGBToLinear\) c\.convertSRGBToLinear\(\);/.test(src),
  'tints convert sRGB picks to linear for the GLB');

done('build 996: model part editor — delete/recolor parts live, bake to a new hosted .glb');
