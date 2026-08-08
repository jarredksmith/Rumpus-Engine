// build 1434 — the raycast BVH reads an INTERLEAVED position buffer correctly.
//
// REPORTED FROM PLAY, with the file: "this prop is showing decals from bullets way far away from the
// prop itself on an invisible barrier." Every shot in this engine raycasts real triangles (build 1159),
// so a decal lands wherever the ray says it hit.
//
// Read out of the reported GLB in Node: POSITION is FLOAT, count 3,276, and its bufferView has
// byteStride 48 — TWELVE floats per vertex (position 3 + normal 3 + tangent 4 + uv 2). So
// `attributes.position.array` is the shared interleaved buffer of 39,312 floats, and build 1097's
// `posA[vertexIndex*3 + k]` walks normals, tangents and UVs as though they were coordinates. The tree
// is built over triangles that are nowhere near the model, and it reports hits there.
//
// That is also the "13,104 vertices for a 3,276-vertex mesh" tell recorded last session: 39,312/3.
// It was never a mismatched mesh — it is the arithmetic signature of interleaving.
//
// Measured live on the reported file, 60 rays through the arch's own footprint:
//   shipped   60 hits, ALL 60 outside the mesh's own bounding box, worst 7.22 m away
//   packed     1 hit,   0 outside — and IDENTICAL to three's own brute-force Mesh.raycast
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';

const src = gameSource();
const build = extractFunction('_buildTriBVH', src);

/* ---- the shape ----------------------------------------------------------------------------------- */
assert(/const posA = _bvhPackPos\(geo\.attributes\.position\)/.test(build),
  'the tree is built over a packed copy read through the attribute API');
assert(!/geo\.attributes\.position\.array/.test(build),
  'the raw-array read — the defect — is gone');
const pack = extractFunction('_bvhPackPos', src);
assert(/pa\.getX\(i\)/.test(pack) && /pa\.getY\(i\)/.test(pack) && /pa\.getZ\(i\)/.test(pack),
  'and the packer goes through getX/getY/getZ, which is what makes it stride- and quantization-proof');
// Both consumers of IMPORTED geometry now do this; build 1431 already did, with the same reason in its
// comment ("tight copy: gltfpack interleaves"), and this is the one that did not.
assert(/getX\(i\)/.test(extractFunction('_lodGeoSimplify', src)),
  'the other reader of imported geometry packs the same way — one rule, both places');
assert(/o\.userData\.__bvh = _buildTriBVH\(o\.geometry\)/.test(extractFunction('_installRaycastBVH', src)),
  'and the install path is unchanged');

/* ---- EXECUTED: the reported defect, reproduced and then not -------------------------------------- */
// A geometry laid out exactly like the reported file: one interleaved buffer, stride 12 floats — and
// with its proportions, because they are what make the defect VISIBLE. The reported arch is thin (local
// extent 1.00 x 0.64 x 0.18), so a normal of +-1 read into a position slot lands an order of magnitude
// outside the mesh. A fat cube hides the bug: its own bounds already contain every normal and uv, so the
// garbage triangles stay inside the box and nothing looks wrong.
const boxGeo = new THREE.BoxGeometry(1, 0.64, 0.18);
const n = boxGeo.attributes.position.count;
const STRIDE = 12;
const inter = new Float32Array(n * STRIDE);
for (let i = 0; i < n; i++) {
  const o = i * STRIDE;
  inter[o]     = boxGeo.attributes.position.getX(i);
  inter[o + 1] = boxGeo.attributes.position.getY(i);
  inter[o + 2] = boxGeo.attributes.position.getZ(i);
  inter[o + 3] = boxGeo.attributes.normal.getX(i);
  inter[o + 4] = boxGeo.attributes.normal.getY(i);
  inter[o + 5] = boxGeo.attributes.normal.getZ(i);
  inter[o + 6] = 1; inter[o + 7] = 0; inter[o + 8] = 0; inter[o + 9] = 1;   // tangent
  inter[o + 10] = boxGeo.attributes.uv.getX(i);
  inter[o + 11] = boxGeo.attributes.uv.getY(i);
}
const ib = new THREE.InterleavedBuffer(inter, STRIDE);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
geo.setIndex(boxGeo.index);

const pa = geo.attributes.position;
assert(pa.isInterleavedBufferAttribute === true, 'PREMISE: the fixture really is interleaved');
eq(pa.array.length, n * STRIDE, 'PREMISE: its raw array is the whole interleaved buffer...');
assert(pa.array.length / 3 !== n,
  '...so array.length/3 is NOT the vertex count — the 13,104-vs-3,276 arithmetic, reproduced');

// the scratch the raycast walks, lifted from source rather than restated
const iS = src.indexOf('const _bvhInv'), iE = src.indexOf('function _bvhRaycastMesh');
assert(iS > 0 && iE > iS, 'found the BVH scratch block');
const mk = (buildSrc) => new Function('THREE', `
  ${extractFunction('_bvhPackPos', src)}
  ${buildSrc}
  ${src.slice(iS, iE)}
  ${extractFunction('_bvhRaycastMesh', src)}
  return { _buildTriBVH, _bvhRaycastMesh };
`)(THREE);

const now = mk(build);
// the pre-1434 reading, reconstructed from the shipped text by putting the one line back
const old = mk(build.replace('_bvhPackPos(geo.attributes.position)', 'geo.attributes.position.array'));

const bvhNow = now._buildTriBVH(geo);
eq(bvhNow.posA.length, n * 3, 'the tree holds three floats per vertex, not the whole interleaved buffer');
// and the packed copy recovers EXACTLY the coordinates a tightly-packed attribute would have carried
let worst = 0;
for (let i = 0; i < n * 3; i++) worst = Math.max(worst, Math.abs(bvhNow.posA[i] - boxGeo.attributes.position.array[i]));
eq(worst, 0, 'and they are byte-exact against the same mesh authored tightly packed');

const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
mesh.scale.setScalar(8);            // the reported prop is scaled 8x
mesh.position.set(40, 0, 40);
mesh.updateMatrixWorld(true);

const world = new THREE.Box3().setFromObject(mesh);
const outside = (p) => Math.max(0, world.min.x - p.x, p.x - world.max.x,
                                   world.min.y - p.y, p.y - world.max.y,
                                   world.min.z - p.z, p.z - world.max.z);

const sweep = () => {
  const rc = new THREE.Raycaster(); rc.far = 400;
  const res = { n: 0, off: 0, worstD: 0, first: null };
  for (let y = -6; y <= 6.01; y += 2) for (let x = 34; x <= 46.01; x += 2) {
    rc.set(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, 1));
    const hits = []; mesh.raycast(rc, hits);
    if (!hits.length) continue;
    hits.sort((a, b) => a.distance - b.distance);
    res.n++;
    const d = outside(hits[0].point);
    if (d > 1e-4) { res.off++; res.worstD = Math.max(res.worstD, d); }
    if (!res.first) res.first = hits[0].point.clone();
  }
  return res;
};

// three's own brute force is the reference: it reads through the attribute API and cannot be fooled.
delete mesh.raycast;
const brute = sweep();
assert(brute.n > 0, 'PREMISE: the reference raycast hits the fixture at all');
eq(brute.off, 0, 'PREMISE: and every one of its hits is on the mesh');

mesh.userData.__bvh = old._buildTriBVH(geo);
mesh.raycast = old._bvhRaycastMesh;
const before = sweep();
assert(before.off > 0,
  'PREMISE: the pre-1434 reading reports hits OUTSIDE the mesh — the invisible barrier, reproduced');
assert(before.worstD > 0.5, 'and not by a rounding error: ' + before.worstD.toFixed(2) + ' m out');

mesh.userData.__bvh = bvhNow;
mesh.raycast = now._bvhRaycastMesh;
const after = sweep();
eq(after.off, 0, 'packed: not one hit lands off the mesh');
eq(after.n, brute.n, '...and it finds exactly what three finds');
assert(after.first.distanceTo(brute.first) < 1e-6, '...at the same point');

done('build 1434: the raycast BVH packs positions through the attribute API, so an interleaved glTF ' +
     'buffer — which is what gltfpack, meshopt and every "optimize my glTF" pipeline emits — is no ' +
     'longer walked with a stride of 3, reporting hits on triangles built out of normals and UVs');
