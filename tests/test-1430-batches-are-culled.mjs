// build 1430 — a batch of duplicated props is FRUSTUM CULLED, so turning your back on them is free.
//
// Asked from use: "is there a way to avoid doubling the tris if it's a duplicate of the prop?" Measured
// (tools/probe/instanced-culling.mjs), 24 duplicated boxes, control returning byte-exactly:
//   camera AWAY, un-batched   18 calls /    96 triangles
//   camera AWAY, batched      26 calls /   528 triangles     <- every instance, every frame, forever
//   camera AWAY, batched+1430 18 calls /    96 triangles
// That is build 1420's unexplained tripling, and both halves of the fix are load-bearing on their own.
import { gameSource, extractConst, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';

const src = gameSource();

/* ---- the premise, in the real vendored r149 ----------------------------------------------------- */
// If an upgrade gives InstancedMesh its own bounds (three added computeBoundingSphere later), this whole
// mechanism becomes redundant and these pins are how we find out, rather than carrying it forever.
const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 3);
eq(im.frustumCulled, false, 'PREMISE: r149 InstancedMesh disables its own frustum culling');
eq(typeof im.computeBoundingSphere, 'undefined', 'PREMISE: ...and has no way to compute real bounds');
assert(!('boundingSphere' in im), 'PREMISE: ...and carries no boundingSphere for a frustum to read');
// which is why the bounds have to live on the GEOMETRY: that is what the frustum test actually reads.
const fSrc = String(THREE.Frustum.prototype.intersectsObject);
assert(/geometry\.boundingSphere/.test(fSrc), 'PREMISE: the frustum test reads geometry.boundingSphere');
assert(/object\.matrixWorld/.test(fSrc), 'PREMISE: ...transformed by the object matrix');

/* ---- the spatial split -------------------------------------------------------------------------- */
const CELL = extractConst('INST_CELL');
assert(+CELL > 0 && +CELL < 200, 'INST_CELL is a sane metre figure, got ' + CELL);
const cellOf = new Function('o', 'INST_CELL',
  extractFunction('_instCellOf', src).replace(/^function _instCellOf\(o\)\{/, '').replace(/\}$/, ''));
const C = +CELL;
eq(cellOf({ position: { x: 1, z: 1 } }, C), cellOf({ position: { x: 2, z: 2 } }, C),
   'two props a metre apart share a cell');
assert(cellOf({ position: { x: 1, z: 1 } }, C) !== cellOf({ position: { x: 1 + C * 2, z: 1 } }, C),
   'two props two cells apart do NOT');
assert(cellOf({ position: { x: -5, z: -5 } }, C) !== cellOf({ position: { x: 5, z: 5 } }, C),
   'the origin is a cell boundary, not a fold — negative coordinates get their own cells');
// Both passes must split, or the one that does not keeps a map-wide batch that can never be rejected.
const build = extractFunction('buildInstancing', src);
eq((build.match(/_instCellOf\(o\)/g) || []).length, 2,
   'BOTH the primitive and the model pass key by cell');
assert(/_instKey\(o\) \+ '\|' \+ _instCellOf\(o\)/.test(build), 'the primitive key carries the cell');
assert(/_instKeyModel\(o\) \+ '\|' \+ _instCellOf\(o\)/.test(build), 'the model key carries the cell');

/* ---- the bounds, executed against real three ----------------------------------------------------- */
const cullGeo = new Function('src', 'box', 'THREE',
  extractFunction('_instCullGeo', src).replace(/^function _instCullGeo\(src, box\)\{/, '').replace(/\}$/, ''));
const source = new THREE.BoxGeometry(2, 2, 2);
const box = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 4, 10));
const wrapped = cullGeo(source, box, THREE);

// The whole reason this is free: the attribute OBJECTS are shared, so three's WebGLAttributes (a WeakMap
// keyed on the attribute instance) uploads one buffer and both geometries draw from it.
for (const name of Object.keys(source.attributes))
  assert(wrapped.attributes[name] === source.attributes[name],
    name + ' is shared BY REFERENCE — no second copy on the GPU');
assert(wrapped.index === source.index, 'the index is shared too');
assert(wrapped !== source, 'but the geometry OBJECT is its own, or the bounds would leak between batches');
assert(wrapped.boundingSphere && wrapped.boundingSphere.radius > 10,
  'the wrapper carries a sphere covering every instance, not one copy');
// it must actually contain the instances, which is the property the frustum will test
for (const p of [[10, 0, 10], [-10, 4, -10], [0, 2, 0]])
  assert(wrapped.boundingSphere.containsPoint(new THREE.Vector3(p[0], p[1], p[2])),
    'the sphere contains the instance at ' + p.join(','));
// and the source is untouched — its own bounds must not be rewritten by a batch that borrowed it
assert(source.boundingSphere === null || source.boundingSphere.radius < 5,
  'the SOURCE geometry keeps its own bounds');

/* ---- disposal: the one hazard in sharing attributes --------------------------------------------- */
// three's onGeometryDispose walks geometry.attributes and frees each buffer, so disposing the wrapper
// naively would free the buffers the source is still drawing from — and a model batch shares its
// template's LIVE geometry (build 1192), so that blanks the creator's model in the editor.
const disp = new Function('im', 'THREE',
  extractFunction('_instDisposeCullGeo', src).replace(/^function _instDisposeCullGeo\(im\)\{/, '').replace(/\}$/, ''));
let disposed = false;
wrapped.addEventListener('dispose', () => { disposed = true; });
disp({ geometry: wrapped, userData: { _cullGeo: true } }, THREE);
assert(disposed, 'the wrapper IS disposed — it must not leak one geometry per batch per deploy');
eq(Object.keys(wrapped.attributes).length, 0, '...but it was EMPTIED first');
eq(wrapped.index, null, '...index cleared too');
for (const name of Object.keys(source.attributes))
  assert(source.attributes[name], 'the SOURCE still holds its ' + name + ' after the wrapper was disposed');
assert(source.attributes.position.array.length > 0, 'and the source data itself survives');

// a batch that never got a wrapper must not be touched
let touched = false;
disp({ geometry: { get attributes(){ touched = true; return {}; } }, userData: {} }, THREE);
assert(!touched, 'a batch with no wrapper geometry is left entirely alone');
disp(null, THREE);   // must not throw

/* ---- the wiring ---------------------------------------------------------------------------------- */
eq((build.match(/frustumCulled = true/g) || []).length, 2,
   'BOTH passes enable culling — a pass that builds bounds and leaves the flag off changes nothing');
eq((build.match(/_instCullGeo\(/g) || []).length, 2, 'and both build real bounds');
assert(/_cullGeo = true/.test(build), 'a wrapped batch is marked, so teardown knows to free it');
const tear = extractFunction('teardownInstancing', src);
assert(/_instDisposeCullGeo\(im\)/.test(tear), 'teardown frees the wrapper');
// build 1192's shared-material rule must survive untouched — a model batch borrows its template's
// materials and disposing them would blank the model the creator goes back to editing.
assert(/!im\.userData\._sharedMat/.test(tear), 'the shared-material guard is unchanged');

done('build 1430: a batch of duplicated props is frustum culled — split per spatial cell so its volume is ' +
     'rejectable at all, and given real bounds on a geometry that shares the source attributes so it costs ' +
     'no GPU memory, with disposal that empties the wrapper before freeing it so the shared buffers survive');
