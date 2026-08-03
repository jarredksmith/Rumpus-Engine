// (build 871) FIVE NEW CONSTRUCTION PRIMITIVES + MATERIAL OPACITY — "Can we add many more primitive
// options? Ramps, stairs, etc? It would also be good to have an opacity setting in materials so users
// can make glass/plastic/see through materials."
// The new shapes (wedge/ramp, stairs, dome, tube, torus) join MAT_PRIMS: full material editing (colour /
// texture / glow / shine / opacity) but TRIMESH physics — a ramp you can't walk up is a wall — and no
// instancing. SHAPE_PRIMS (box/sphere/cylinder/cone) still gates exact colliders + instancing alone.
import { gameSource, extractFunction, extractConst, evalDecl, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- the two-tier primitive taxonomy, executed ----
const SHAPE_PRIMS = JSON.parse(extractConst('SHAPE_PRIMS', src).replace(/(\w+):/g, '"$1":'));
const MAT_PRIMS = JSON.parse(extractConst('MAT_PRIMS', src).replace(/(\w+):/g, '"$1":'));
for (const k of ['wedge','stairs','dome','tube','torus']) assert(MAT_PRIMS[k] === 1, `MAT_PRIMS has ${k}`);
const isMatPrimitive = evalDecl(
  extractFunction('isShapePrimitive', src) + '\n' + extractFunction('isMatPrimitive', src),
  'isMatPrimitive', { SHAPE_PRIMS, MAT_PRIMS });
assert(isMatPrimitive('wedge') && isMatPrimitive('stairs') && isMatPrimitive('box'), 'material editing covers old + new prims');
assert(!SHAPE_PRIMS.wedge && !SHAPE_PRIMS.torus, 'new prims stay OUT of SHAPE_PRIMS (exact colliders + instancing)');
assert(!isMatPrimitive('pillar') && !isMatPrimitive('https://x/y.glb'), 'composites and models still excluded');

// ---- geometry builders, executed against a stub THREE ----
class BufferAttribute { constructor(arr, sz){ this.array = arr; this.itemSize = sz; } }
class BufferGeometry {
  setAttribute(name, attr){ this[name] = attr; return this; }
  computeVertexNormals(){ this._normals = true; }
}
const THREE = { BufferGeometry, BufferAttribute, Mesh: class { constructor(g, m){ this.geometry = g; this.material = m; } } };
const primitiveMat = () => ({ stub: true });
const sandbox = { THREE, primitiveMat };

const buildWedgeProp = evalDecl(extractFunction('buildWedgeProp', src), 'buildWedgeProp', sandbox);
const wedge = buildWedgeProp();
const wv = wedge.geometry.position.array;
eq(wv.length, 24 * 3, 'wedge = 3 quads + 2 side tris = 24 verts');
let minY = 1e9, maxY = -1e9, ok = true;
for (let i = 0; i < wv.length; i += 3) {
  if (Math.abs(wv[i]) > 0.5 + 1e-9 || Math.abs(wv[i + 2]) > 0.5 + 1e-9) ok = false;
  minY = Math.min(minY, wv[i + 1]); maxY = Math.max(maxY, wv[i + 1]);
}
assert(ok, 'wedge fits the unit 1×1 footprint');
eq(minY, 0, 'wedge base sits at y=0 (floor-snaps like the box)');
eq(maxY, 1, 'wedge rises to unit height');
// the ramp surface: every top-height vert is at the -Z edge, every y=0 front vert at +Z
for (let i = 0; i < wv.length; i += 3) {
  if (wv[i + 1] === 1) assert(wv[i + 2] === -0.5, 'full-height verts are all at the back (-Z)');
}
assert(wedge.geometry._normals, 'wedge computes vertex normals (lighting)');
assert(wedge.material.stub, 'wedge uses primitiveMat (material editing applies)');

const stairsFns = extractFunction('_pushBoxVerts', src) + '\n' + extractFunction('buildStairsProp', src);
const buildStairsProp = evalDecl(stairsFns, 'buildStairsProp', sandbox);
const sv = buildStairsProp().geometry.position.array;
eq(sv.length, 6 * 36 * 3, 'stairs = 6 merged step boxes (36 verts each)');
let sMaxY = -1e9, sMinY = 1e9;
for (let i = 1; i < sv.length; i += 3) { sMaxY = Math.max(sMaxY, sv[i]); sMinY = Math.min(sMinY, sv[i]); }
near(sMaxY, 1, 1e-9, 'top step reaches unit height');
eq(sMinY, 0, 'stairs base sits at y=0');
// step profile: at the front (+Z) the surface is low, at the back (-Z) it is full height
let frontMaxY = -1e9, backMaxY = -1e9;
for (let i = 0; i < sv.length; i += 3) {
  if (sv[i + 2] > 0.4) frontMaxY = Math.max(frontMaxY, sv[i + 1]);
  if (sv[i + 2] < -0.4) backMaxY = Math.max(backMaxY, sv[i + 1]);
}
near(frontMaxY, 1 / 6, 1e-6, 'front step is one-sixth height (float32)');
near(backMaxY, 1, 1e-9, 'back step is full height — stairs climb toward -Z like the wedge');

// dome / tube / torus: pin the geometry recipes (they lean on real three.js generators)
assert(/function buildDomeProp\(\)\{\s*\n\s*const geo=new THREE\.SphereGeometry\(0\.5, 24, 12, 0, Math\.PI\*2, 0, Math\.PI\/2\)/.test(src), 'dome = hemisphere with base circle at y=0');
assert(/buildDomeProp[\s\S]{0,220}side=THREE\.DoubleSide/.test(src), 'dome renders from inside (domes make rooms)');
assert(/function buildTubeProp\(\)\{\s*\n\s*const geo=new THREE\.CylinderGeometry\(0\.5, 0\.5, 1, 20, 1, true\); geo\.translate\(0, 0\.5, 0\)/.test(src), 'tube = open cylinder, base at y=0');
assert(/function buildTorusProp\(\)\{\s*\n\s*const geo=new THREE\.TorusGeometry\(0\.35, 0\.15, 12, 24\); geo\.rotateX\(-Math\.PI\/2\); geo\.translate\(0, 0\.15, 0\)/.test(src), 'torus lies flat with its tube resting on y=0');

// ---- registry + physics routing ----
assert(/wedge:buildWedgeProp, stairs:buildStairsProp, dome:buildDomeProp, tube:buildTubeProp, torus:buildTorusProp/.test(src), 'all five registered in PRIMITIVE_BUILDERS');
// the static-collider chooser still keys on isShapePrimitive — the new prims fall through to trimeshDescFor
assert(/if\(o\.userData && isShapePrimitive\(o\.userData\.src\)\)\{[\s\S]{0,600}colliderDescFor/.test(src), 'exact colliders remain SHAPE_PRIMS-only');
assert(/isShapePrimitive\(o\.userData\.src\) && !o\.userData\.tex/.test(src), 'instancing eligibility remains SHAPE_PRIMS-only');

// ---- opacity: executed clamp/threshold behaviour ----
// build 1340: applyPropOpacity no longer writes the blend state itself — cutout and blend are mutually
// exclusive, so ONE function owns transparent/opacity/depthWrite/alphaTest. The real writer is supplied
// here rather than stubbed, because every assertion below is about what that state ends up as.
const _blendSrc = extractFunction('_applyPropBlend', src);
const applyPropOpacity = evalDecl(_blendSrc + '\n' + extractFunction('applyPropOpacity', src), 'applyPropOpacity', {
  isMatPrimitive,
  eachPrimMesh: (obj, fn) => fn(obj._mesh),
  THREE: { DoubleSide: 2, FrontSide: 0 },
});
const mk = (srcName) => ({ userData: { src: srcName }, _mesh: { material: {} } });
let o = mk('wedge');
applyPropOpacity(o, 0.4);
eq(o.userData.op, 0.4, 'opacity stored on userData');
assert(o._mesh.material.transparent === true && o._mesh.material.opacity === 0.4, 'alpha blending on below 1');
assert(o._mesh.material.depthWrite === false, 'true glass (<0.6) stops writing depth');
o = mk('box'); applyPropOpacity(o, 0.8);
assert(o._mesh.material.transparent === true && o._mesh.material.depthWrite === true, 'solid-ish plastic (>=0.6) keeps depthWrite');
o = mk('box'); applyPropOpacity(o, 1);
assert(o._mesh.material.transparent === false && o._mesh.material.opacity === 1, 'opacity 1 = fully opaque again');
o = mk('box'); applyPropOpacity(o, 0);
eq(o.userData.op, 1, 'falsy input coerces to 1 (never invisible by accident)');
o = mk('box'); applyPropOpacity(o, 0.01);
eq(o.userData.op, 0.15, 'floor clamp 0.15 — a pane you can still see');
o = mk('box'); applyPropOpacity(o, 7);
eq(o.userData.op, 1, 'ceiling clamp 1');
o = mk('pillar'); applyPropOpacity(o, 0.4);
eq(o.userData.op, undefined, 'non-material prims are ignored');

// ---- persistence: save descriptor + restore path ----
assert(/if\(o\.userData\.op!=null && \+o\.userData\.op < 1\) m\.op = \+o\.userData\.op;/.test(src), 'propMaterialDesc serializes op (only when <1)');
assert(/if\(mat\.op!=null\) applyPropOpacity\(obj, mat\.op\);/.test(src), 'applyStoredMaterial restores opacity on load/share/net');

// ---- editor UI wiring ----
/* build 1320: the row is `for(const [src,label] of PRIM_SHAPES)`, which is all TEN — this row had been
   missing `pillar` since 871 shipped. Assert the labels through the table. */
assert(/for\(const \[src,label\] of PRIM_SHAPES\)\{/.test(src), 'the Add-shape row is the shape table');
{ const tbl = (new Function('return ('+(src.match(/const PRIM_SHAPES = (\[[\s\S]*?\n\]);/)||[])[1]+')'))();
  const byKey = Object.fromEntries(tbl.map(r=>[r[0], r[1]]));
  for (const [k, lab] of [['box','Box'],['sphere','Sphere'],['cylinder','Cylinder'],['cone','Cone'],['wedge','Ramp'],['stairs','Stairs'],['dome','Dome'],['tube','Tube'],['torus','Ring']])
    assert(byKey[k]===lab, 'Add-shape row lists '+lab);
  assert(byKey.pillar==='Pillar', '...and pillar, which every surface but the radial menu had dropped'); }
for (const k of ['wedge','stairs','dome','tube','torus']) assert(new RegExp(k + ':\\s+_svgIcon\\(').test(src), `PRIM_ICON has a ${k} icon`);
/* build 1320: the + menu's shape entries are generated from the same table (the common ones at the top,
   the rest under "More shapes"). Same intent: Ramp and Stairs are one click from the + button. */
assert(/const ADD_ITEMS = PRIM_SHAPES\.filter\(_s=>_s\[3\]\)\.map\(\(\[src,label,glyph\]\)=>\[glyph\+' '\+label, \(\)=>\{ jump\('build','props'\); addSceneProp\(src\); \}\]\)/.test(src),
  'the + menu builds its shape entries from the table');
{ const tbl = (new Function('return ('+(src.match(/const PRIM_SHAPES = (\[[\s\S]*?\n\]);/)||[])[1]+')'))();
  const common = tbl.filter(r=>r[3]).map(r=>r[1]);
  assert(common.indexOf('Ramp')>=0, 'quick-add: Ramp');
  assert(common.indexOf('Stairs')>=0, 'quick-add: Stairs');
  assert(/menuItem\(glyph\+' '\+label, \(\)=>\{ addMenu\.style\.display='none'; jump\('build','props'\); addSceneProp\(src\); \}\); \}\n      \};\n      const buildFx/.test(src),
    '...and the four that are not common (pillar, dome, tube, ring) reach the menu through a submenu'); }
assert(/slider\('Opacity', \(selObj\.userData\.op!=null\?\+selObj\.userData\.op:1\), '#9fd8ff', \(v\)=>\{ for\(const o of _matTargets\(\)\) applyPropOpacity\(o, v\); \}\);/.test(src), 'Opacity slider in the Material section');
assert(/Opacity under 1 makes it see-through — glass = low opacity \+ high shininess/.test(src), 'the hint teaches the glass recipe');
assert(/Box \/ Sphere \/ Cylinder \/ Cone \/ Ramp \/ Stairs \/ Dome \/ Tube \/ Ring/.test(src), 'the imported-model note lists the full shape set');

done('build 871: ramp/stairs/dome/tube/torus primitives + glass-capable opacity, wired end to end');

// build 1340: and the cutout, which overrides the blend entirely — an opacity edit must not un-cut it.
const applyPropCutout = evalDecl(_blendSrc + '\n' + extractFunction('applyPropCutout', src), 'applyPropCutout', {
  isMatPrimitive,
  eachPrimMesh: (obj, fn) => fn(obj._mesh),
  THREE: { DoubleSide: 2, FrontSide: 0 },
  CUT_MAX: 0.99,
});
o = mk('box'); applyPropOpacity(o, 0.4); applyPropCutout(o, 0.5);
assert(o._mesh.material.alphaTest === 0.5 && o._mesh.material.transparent === false,
  'a cutout overrides opacity — it is opaque, which is the whole point of it');
applyPropOpacity(o, 0.3);
assert(o._mesh.material.alphaTest === 0.5, 'and an opacity edit while cut out does not un-cut it');
applyPropCutout(o, 0);
assert(o._mesh.material.alphaTest === 0 && o._mesh.material.transparent === true && o._mesh.material.opacity === 0.3,
  'turning it off restores the blending path exactly');
