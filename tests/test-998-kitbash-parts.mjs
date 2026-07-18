// (build 998) KITBASH ADD-PARTS — attach box/cylinder/sphere parts to an imported model (offset,
// size, color) with live preview on the real prop, baked into the same new .glb on save. THREE
// generates the geometry; the bake copies its buffers into the doc as new scene-0 nodes. Added
// parts stay OUT of the ordinal part mapping (it must keep matching the SOURCE glb).
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const _primGeomArrays = new Function('THREE', 'return (' + extractFunction('_primGeomArrays') + ')')(THREE);
const _mkKitMesh = new Function('THREE', 'return (' + extractFunction('_mkKitMesh') + ')')(THREE);
const _meshOrderOf = new Function('return (' + extractFunction('_meshOrderOf') + ')')();

// geometry buffers are real and indexed
for (const sh of ['box', 'cylinder', 'sphere']) {
  const g = _primGeomArrays(sh);
  assert(g.pos.length > 0 && g.pos.length % 3 === 0, sh + ': positions are vec3s');
  eq(g.nor.length, g.pos.length, sh + ': one normal per vertex');
  assert(g.idx && g.idx.length % 3 === 0, sh + ': indexed triangles');
  assert(g.idx instanceof Uint16Array, sh + ': 16-bit indices at these vertex counts');
}

// live kit mesh honours the staged transform + color
{
  const m = _mkKitMesh({ shape: 'box', p: [1, 2, 3], s: [0.5, 0.5, 0.5], color: '#ff0000' });
  near(m.position.y, 2, 1e-9, 'kit mesh at the staged offset');
  near(m.scale.x, 0.5, 1e-9, 'kit mesh at the staged size');
  eq(m.material.color.getHexString(), 'ff0000', 'kit mesh wears the staged color');
}

// added parts never disturb the source-ordinal mapping
{
  const g = new THREE.Group();
  const orig = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); orig.name = 'body';
  g.add(orig);
  const kit = _mkKitMesh({ shape: 'sphere', p: [0, 1, 0], s: [1, 1, 1] }); kit.userData._mpeAdded = 0;
  g.add(kit);
  eq(_meshOrderOf(g).length, 1, 'kitbash parts are invisible to the ordinal enumeration');
  eq(_meshOrderOf(g)[0], orig, '...which still sees the source mesh');
}

// wiring pins
assert(/stats\.added=_addPartsToDoc\(doc, edits\.add, linearOf\);/.test(src), 'the bake writes the added parts');
assert(/const node=doc\.createNode\('kit-'\+a\.shape\+'-'\+n\)\.setMesh\(doc\.createMesh\('kit-'\+a\.shape\)\.addPrimitive\(prim\)\);/.test(src),
  'each part becomes a named node + mesh in the doc');
assert(/node\.setTranslation\(\(a\.p\|\|\[0,0,0\]\)\.slice\(0,3\)\); node\.setScale\(\(a\.s\|\|\[1,1,1\]\)\.slice\(0,3\)\);/.test(src),
  'the staged offset + size ride into the GLB');
assert(/\['box','\+ Box'\],\['cylinder','\+ Cylinder'\],\['sphere','\+ Sphere'\]/.test(src), 'add buttons for the three primitives');
assert(/edits\.add\.push\(\{ shape:sh, p:\[0,1,0\], s:\[0\.5,0\.5,0\.5\], color:'#9fb2c8' \}\);/.test(src), 'a new part stages with sane defaults');
assert(/if\(!nDel && !nTint && !nAdd\)/.test(src), 'added parts count as staged work for Save');
assert(/\(edits\.add\|\|\[\]\)\.forEach\(\(a,i\)=>\{ const m=_mkKitMesh\(a\); m\.userData\._mpeAdded=i; obj\.add\(m\); \}\);/.test(src),
  'the live preview rebuilds kit parts from the staged list');

done('build 998: kitbash add-parts — primitives attach to models, live and baked');
