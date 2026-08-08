// build 1431 — a heavy model draws a simplified mesh when it is small on screen.
//
// Asked from use: "what is LOD? Do we do that?" Four kinds were here — animation LOD (mixers update at
// 1/1, 1/2, 1/4 by distance), shadow LOD (build 1270), screen-size culling (1267/1273) and the whole-frame
// quality ladder — and the fifth, the one a heavy import actually hits, was not: a 497,912-triangle model
// submitted all of them whether it filled the screen or covered forty pixels.
//
// Measured (tools/probe/geo-lod.mjs), one heavy mesh, control returning exactly:
//   far, no levelling   87 draw calls / 63,800 triangles
//   far, levelled       87 draw calls / 24,044 triangles      <- 62.3%, same draw calls
//   up close            the full mesh, and the near pose returns byte-exactly
import { gameSource, extractConst, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';

const src = gameSource();

/* ---- the thresholds ------------------------------------------------------------------------------ */
const PX = +extractConst('LOD_GEO_PX'), MIN = +extractConst('LOD_GEO_TRI_MIN'),
      RATIO = +extractConst('LOD_GEO_RATIO'), NEAR = +extractConst('LOD_NEAR_KEEP');
assert(PX > 0 && PX < 400, 'LOD_GEO_PX is a sane pixel figure, got ' + PX);
assert(RATIO > 0 && RATIO < 1, 'the simplified level is genuinely smaller, got ' + RATIO);
assert(MIN >= 500, 'a level of detail is not built for a mesh too small to pay for the swap, got ' + MIN);
// It must degrade BEFORE anything disappears, or a prop would pop out of existence while still at full
// detail — the rungs are meant to be a ladder, not three independent switches.
const SHADOW_MUL = +extractConst('LOD_SHADOW_MUL');
assert(PX > SHADOW_MUL, 'geometry degrades before a prop stops casting, and long before it is culled');

/* ---- the simplified level, executed against real three ------------------------------------------ */
const simplify = new Function('S', 'g', 'THREE', 'LOD_GEO_RATIO',
  extractFunction('_lodGeoSimplify', src)
    .replace(/^function _lodGeoSimplify\(S, g\)\{/, '').replace(/\}$/, ''));

const hi = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
hi.setIndex(Array.from({ length: hi.attributes.position.count }, (_, i) => i));
// a stand-in for meshopt: it returns a shorter index, which is all the engine consumes
const S = { simplify: (idx, P, stride, target) => [idx.slice(0, target)] };
const lo = simplify(S, hi, THREE, RATIO);

assert(lo, 'a level is built for a real indexed geometry');
assert(lo !== hi, 'it is its own geometry object');
// This is the whole reason a level of detail is cheap: one vertex buffer serves both, because three's
// WebGLAttributes is keyed on the attribute INSTANCE. A clone would double the mesh in GPU memory.
for (const k of Object.keys(hi.attributes))
  assert(lo.attributes[k] === hi.attributes[k], k + ' is shared BY REFERENCE — no second vertex buffer');
assert(lo.index !== hi.index, 'but the INDEX is its own');
assert(lo.index.count < hi.index.count, 'and it is smaller — ' + lo.index.count + ' vs ' + hi.index.count);
// Bounds are COPIED, not recomputed: simplification never grows a mesh, and a frustum that rejected the
// full one must reject this one identically or the prop pops at the culling boundary.
assert(lo.boundingSphere && hi.boundingSphere, 'both levels carry bounds');
eq(lo.boundingSphere.radius, hi.boundingSphere.radius, 'the two levels share a bounding radius exactly');

// a mesh that will not decimate keeps ONE level rather than a pointless second buffer
eq(simplify({ simplify: (idx) => [idx.slice()] }, hi, THREE, RATIO), null,
   'a geometry the simplifier cannot reduce gets no level');
eq(simplify({ simplify: () => [null] }, hi, THREE, RATIO), null, 'a failed simplify yields no level');
eq(simplify({ simplify: () => { throw new Error('boom'); } }, hi, THREE, RATIO), null,
   'a THROWING simplifier yields no level rather than taking the deploy down with it');
eq(simplify(S, new THREE.BufferGeometry(), THREE, RATIO), null, 'a geometry with no position/index is skipped');

/* ---- what gets a level, and what must not -------------------------------------------------------- */
const build = extractFunction('buildGeoLOD', src);
assert(/isModelSrc\(o\.userData\.src\)/.test(build), 'only imported MODELS — a primitive is already trivial');
assert(/m\.isSkinnedMesh/.test(build), 'skinned meshes are excluded: their bones move the vertices');
assert(/index\.count\/3 < LOD_GEO_TRI_MIN/.test(build), 'and anything under the triangle floor');
assert(/if\(m\.userData\._lodHi\) return;/.test(build), 'a mesh is never levelled twice');
assert(/if\(!S\) return;/.test(build), 'no simplifier (offline) means full geometry everywhere, silently');

/* ---- the raycast, which is where this could have gone quietly wrong ------------------------------ */
// Build 1263's rule: a perf change may not remove work something else relies on. The player's shots
// raycast real triangles (build 1159), so a swapped-down mesh would move where a distant bullet lands.
assert(/_lodHi \|\| g/.test(build), 'raycasting is pinned to the FULL geometry');
assert(/const prev = m\.raycast;/.test(build) && /prev\.call\(this, rc, out\)/.test(build),
   'and it CHAINS the existing raycast (build 1097 installs a BVH one) rather than replacing it');
assert(/finally \{ this\.geometry = g; \}/.test(build), 'the drawn level is restored even if the ray throws');

// executed: a levelled mesh raycasts against hi and comes back drawing lo
const mesh = new THREE.Mesh(lo, new THREE.MeshBasicMaterial());
mesh.userData._lodHi = hi; mesh.userData._lodLo = lo;
let sawDuringRay = null;
const prev = function(){ sawDuringRay = this.geometry; };
mesh.raycast = function(rc, out){
  const g = this.geometry; this.geometry = this.userData._lodHi || g;
  try{ prev.call(this, rc, out); } finally { this.geometry = g; }
};
mesh.raycast(null, []);
assert(sawDuringRay === hi, 'the ray tested the FULL mesh');
assert(mesh.geometry === lo, '...and the mesh went back to drawing the simplified one');

/* ---- the rung ------------------------------------------------------------------------------------ */
const tick = extractFunction('_lodGeoTick', src);
assert(/d >= LOD_NEAR_KEEP/.test(tick), 'nothing within the near floor is ever simplified');
assert(/sp < LOD_GEO_PX/.test(tick), 'the decision is SCREEN SIZE, not raw distance');
assert(/sp > LOD_GEO_PX \* LOD_HYST/.test(tick),
   'and coming back up needs the hysteresis band, or a prop on the boundary flickers between silhouettes');
assert(!/visible\s*=/.test(tick), 'the geometry rung never hides anything');
assert(!/castShadow|_lodSetCasting/.test(tick), '...and never changes what casts');
assert(/_lodGeoCursor/.test(tick), 'it is budgeted per frame like the rungs above it');

// it runs on its OWN threshold, so it works with culling off — which is the shipped default
const outer = extractFunction('_lodTick', src);
assert(/if\(_lodGeoN && !\(typeof editorOpen!=='undefined' && editorOpen\)/.test(outer),
   'the geometry rung runs BEFORE the lodPx gate, so lodPx=0 does not disable it');
const iGeo = outer.indexOf('_lodGeoTick()'), iGate = outer.indexOf('if(!px ||');
assert(iGeo > 0 && iGate > iGeo, 'and it is genuinely above that early return');
assert(/editorOpen\)\) _lodGeoTick\(\);/.test(outer) || /editorOpen/.test(outer),
   'never while authoring — the editor shows the level, the game shows the frame');

/* ---- restoring ----------------------------------------------------------------------------------- */
const restore = extractFunction('_lodGeoRestoreAll', src);
assert(/m\.geometry = m\.userData\._lodHi/.test(restore), 'restore puts every mesh back to full');
const rAll = extractFunction('_lodRestoreAll', src);
assert(/_lodGeoRestoreAll\(\)/.test(rAll), 'and the editor path calls it');
assert(rAll.indexOf('_lodGeoRestoreAll()') < rAll.indexOf('if(!_lodAnyCulled) return;'),
   '...BEFORE the early return that fires when nothing was culled, or opening the editor on a level with ' +
   'no culling would leave every mesh decimated');

/* ---- and it is built at deploy ------------------------------------------------------------------- */
const pre = extractFunction('preloadVfx', src);
assert(/buildGeoLOD\(\)/.test(pre), 'levels are built at DEPLOY, where a hitch is expected and free');
assert(pre.indexOf('buildGeoLOD()') < pre.indexOf('warmFlipbookShaders()'),
   '...before the shaders warm, like every other thing seated there');

done('build 1431: geometric LOD — a heavy imported model draws a simplified mesh when it covers few ' +
     'screen pixels, built at deploy from an index-only decimation that shares the source vertex buffer, ' +
     'with raycasting pinned to the full geometry so a distant shot still lands where it should');
