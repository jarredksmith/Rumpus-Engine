// (build 1376) perf #7 + #8: animated props stopped rebuilding colliders from VERTICES every frame,
// and the texture caches finally evict (plus: a tiling is a CLONE sharing one .source, not a re-upload).
//
// The fast path: the slow precise refresh records its own output in prop-LOCAL space
// (userData._localBox + _localBoxes + a version stamp); a MOVER refresh (updateXAnim, the parent-follow
// tick) is then Box3.copy + applyMatrix4 per box into reused Box3s. Translation exact, rotation
// conservative (fail SOLID), and a transformed BOX mesh — the common door/platform — is exact at any
// affine transform because its vertices ARE its local AABB corners.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, extractFunction, extractConst, evalDecl, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- the executable rig: the REAL helpers + the REAL refreshPropCollider --------------------------
const scopeSrc =
  'const _pcV=new THREE.Vector3(); const _pcInvM=new THREE.Matrix4(), _pcRelM=new THREE.Matrix4(), _pcTmpB=new THREE.Box3();\n' +
  'const _ncNoRay=function(){};\n' +
  'function isModelSrc(x){ return typeof x==="string" && /^(https?:|blob:|data:|sketchfab:|local:)/i.test(x); }\n' +
  extractFunction('_pcCacheBuild') + '\n' + extractFunction('_pcFastRefresh') + '\n' + extractFunction('refreshPropCollider');
const refresh = evalDecl(scopeSrc, 'refreshPropCollider', { THREE });
const cacheBuild = evalDecl(scopeSrc, '_pcCacheBuild', { THREE });
const fastRefresh = evalDecl(scopeSrc, '_pcFastRefresh', { THREE });

// 1. EXACT: fast path matches setFromObject(precise) on a transformed box mesh, within epsilon.
{
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3));
  m.position.set(1, 2, 3); m.updateMatrixWorld(true);
  refresh(m);   // slow path builds the cache
  assert(m.userData._localBox && m.userData._localBox.isBox3, 'the slow path recorded a LOCAL-space AABB (userData._localBox)');
  assert(Array.isArray(m.userData._localBoxes) && m.userData._localBoxes.length === 1, '...and the per-part local list');
  m.position.set(10, 5, -4); m.rotation.set(0.3, 0.7, 0.2); m.scale.set(1.5, 2, 0.8);
  refresh(m, true);   // the mover fast path
  assert(m.userData.box === m.userData._pcWorldBox, 'the fast path REUSES its Box3 (no per-frame allocation)');
  assert(m.userData.boxes === m.userData._pcWorld, '...for the part list too');
  m.updateMatrixWorld(true);
  const ref = new THREE.Box3().setFromObject(m, true);
  for (const k of ['min', 'max']) for (const a of ['x', 'y', 'z'])
    near(m.userData.box[k][a], ref[k][a], 1e-9, 'overall fast box ' + k + '.' + a + ' == setFromObject(precise) on a rotated+scaled+translated box mesh');
  const pv = new THREE.Vector3(); const refPart = new THREE.Box3();
  const pos = m.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) refPart.expandByPoint(pv.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  for (const k of ['min', 'max']) for (const a of ['x', 'y', 'z'])
    near(m.userData.boxes[0][k][a], refPart[k][a], 1e-9, 'per-part fast box matches the per-vertex world box');
}

// 2. TRANSLATION is exact for ANY geometry (a cylinder has no corner coincidence to lean on).
{
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2, 12)); c.position.set(4, 1, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); b.position.set(-3, 0.5, 2);
  g.add(c, b); g.updateMatrixWorld(true);
  refresh(g);
  g.position.set(7, -2, 11);   // an elevator/platform move: pure translation
  refresh(g, true);
  g.updateMatrixWorld(true);
  const ref = new THREE.Box3().setFromObject(g, true);
  for (const k of ['min', 'max']) for (const a of ['x', 'y', 'z'])
    near(g.userData.box[k][a], ref[k][a], 1e-9, 'translation-only mover: overall box exact (' + k + '.' + a + ')');
  eq(g.userData.boxes.length, 2, 'two per-part boxes survive the fast path');
}

// 3. ROTATION on a non-box mesh is CONSERVATIVE — fail solid, never open (build 1148 rule).
{
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8));
  m.updateMatrixWorld(true); refresh(m);
  m.rotation.set(0, 0.7, 0.4); refresh(m, true);
  m.updateMatrixWorld(true);
  const ref = new THREE.Box3().setFromObject(m, true);
  assert(m.userData.box.containsBox(ref), 'a rotated non-box mover fast box CONTAINS the precise box — conservative, never open');
}

// 4. The version stamp: bump userData._pcGen and the next refresh is PRECISE (a fresh Box3, not the reused one).
{
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.updateMatrixWorld(true); refresh(m);
  refresh(m, true);
  const fastBox = m.userData.box;
  assert(fastBox === m.userData._pcWorldBox, 'control: the fast path is live');
  m.userData._pcGen = (m.userData._pcGen | 0) + 1;   // the stamp goes stale
  eq(fastRefresh(m), false, 'a stale stamp refuses the fast path outright');
  refresh(m, true);
  assert(m.userData.box !== fastBox, '...so the mover call fell back to the PRECISE path (fresh Box3)');
  refresh(m, true);
  assert(m.userData.box === m.userData._pcWorldBox, '...which re-synced the stamp: the next mover frame is fast again');
}

// 5. A structural edit (a child added — an attached decal, a new part) also forces the precise path.
{
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  g.updateMatrixWorld(true); refresh(g); refresh(g, true);
  const extra = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); extra.position.set(5, 0, 0);
  g.add(extra); g.updateMatrixWorld(true);
  eq(fastRefresh(g), false, 'a changed child count refuses the fast path');
  refresh(g, true);
  eq(g.userData.boxes.length, 2, '...and the precise rebuild picked up the new part');
}

// 6. Without the mover flag every call is PRECISE — the gizmo, loaders and deploy restore keep tight boxes.
{
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.updateMatrixWorld(true); refresh(m); refresh(m, true);
  refresh(m);   // no flag
  assert(m.userData.box !== m.userData._pcWorldBox, 'a flag-less refresh is the precise path even with a valid cache');
}

// 7. The noCol branch DROPS the cache, so the un-tick re-runs the slow traverse (raycast restore).
{
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.updateMatrixWorld(true); refresh(m);
  assert(m.userData._localBox, 'cached');
  m.userData.noCol = true; refresh(m);
  eq(m.userData._localBox, null, 'noCol dropped the cache');
  eq(m.userData.boxes.length, 0, '...while keeping the noCol contract (no boxes)');
  m.userData.noCol = false; refresh(m);
  assert(m.userData._localBox && m.userData._localBox.isBox3, 'the un-tick rebuilt the cache through the slow path');
  eq(m.userData.boxes.length, 1, '...and the boxes came back');
}

// 8. An fx emitter never builds a cache — the fast path cannot fire for it, boxes stay [] (build 1250).
{
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.userData.fx = {};
  m.updateMatrixWorld(true); refresh(m); refresh(m, true);
  eq(m.userData.boxes.length, 0, 'an emitter has no collider boxes on either path');
  assert(!m.userData._localBox, '...and no fast-path cache to misfire from');
}

// 9. A MODEL grid rides the movement: cacheBuild(grid, fromMeshes=false) preserves the grid boxes
//    (never replaced with coarse per-mesh boxes), translation keeps them exact, and a fast refresh
//    bumps the 1203 worker token so a stale in-flight answer cannot land at the wrong pose.
{
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 10));
  m.userData.src = 'https://x/y.glb';
  m.updateMatrixWorld(true);
  m.userData.box = new THREE.Box3().setFromObject(m, true);
  const grid = [
    new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(-4, 3, 5)),
    new THREE.Box3(new THREE.Vector3(4, 0, -5), new THREE.Vector3(5, 3, 5)),
    new THREE.Box3(new THREE.Vector3(-4, 2.5, -5), new THREE.Vector3(4, 3, 5)),   // a lintel over a doorway
  ];
  m.userData._mgridTok = 5;
  cacheBuild(m, grid, false);
  eq(m.userData._localBoxes.length, 3, 'the grid STRUCTURE survives into the cache (3 boxes, not 1 per-mesh blob)');
  m.position.set(20, 0, -7); m.updateMatrixWorld(true);
  assert(fastRefresh(m), 'the mover fast path runs on the cached grid');
  eq(m.userData.boxes.length, 3, '...and reproduces all 3 grid boxes');
  near(m.userData.boxes[0].min.x, -5 + 20, 1e-9, 'translated grid box exact in x');
  near(m.userData.boxes[2].min.y, 2.5, 1e-9, 'the lintel keeps its own height band — the doorway stays OPEN under the fast path');
  eq(m.userData._mgridTok, 6, 'a fast refresh bumps the worker token — an in-flight grid for the old pose is refused at delivery (1203)');
}

// ---- source pins ---------------------------------------------------------------------------------
// 10. The flag replaced the per-frame indexOf, and the two per-frame movers pass the flag.
{
  const u = extractFunction('updateXAnim');
  assert(/o\.userData\._inColliders\|\|o\.userData\.box\) refreshPropCollider\(o, true\)/.test(u),
    'updateXAnim asks the membership FLAG and takes the mover fast path');
  assert(!/colliders\.indexOf/.test(u), 'no O(colliders) scan survives anywhere in updateXAnim');
  const sp = extractFunction('_syncParentedProps');
  assert(/refreshPropCollider\(k, true\)/.test(sp), 'the parent-follow tick (1309) is the other per-frame mover — same fast path');
  eq((src.match(/_inColliders=true/g) || []).length, 4,
    'the flag is SET at every prop push site: finalizeProp, show, back-to-static, restoreDestroyedProps');
  eq((src.match(/_inColliders=false/g) || []).length, 7,
    '...and CLEARED at every prop removal site: removeProp, hide, both dynamic conversions, rivals, ghost, extras');
}

// 11. The 1188 mover classification and the 1206 bake signature are UNAFFECTED — pinned byte-exact,
//     and neither knows the new cache exists.
{
  const mob = extractFunction('_cgMobileNow');
  assert(/return !u\.box \|\| !!\(u\.phys && u\.phys\.body\) \|\| !!\(u\.xa && u\.xa\.on\) \|\| !!u\._kbody \|\| !!u\.parNid;/.test(mob),
    'the 1188/1309 mover classification is untouched');
  assert(!/_localBox|_pcStamp|_inColliders|_pcGen/.test(mob), '...and reads nothing of the new cache');
  const bs = extractFunction('_bakeSig');
  assert(/if\(u && u\.src && !\(u\.phys \|\| u\.vehicle \|\| \(u\.xa && u\.xa\.on\)\)\) n\+\+;/.test(bs),
    'the 1206 bake signature is untouched');
  assert(!/_localBox|_pcStamp|_inColliders|_pcGen/.test(bs), '...and reads nothing of the new cache either');
  const rp = extractFunction('refreshPropCollider');
  assert(rp.indexOf('_cgDirty()') < rp.indexOf('_pcFastRefresh(obj)'),
    'the 1188 static-dirty guard still runs FIRST — a mover fast refresh never rebuilds the spatial grid');
  assert(rp.indexOf('updateMatrixWorld(true)') < rp.indexOf('_pcFastRefresh(obj)'),
    'the fast path reads a CURRENT matrixWorld');
  assert(/obj\.userData\.boxes=grid;\s*\n\s*if\(typeof _pcCacheBuild==='function'\) _pcCacheBuild\(obj, grid, false\);/.test(rp),
    'a landed worker grid REBUILDS the cache — the next mover frame rides it instead of clobbering it');
  assert(/if\(typeof _pcCacheBuild==='function'\) _pcCacheBuild\(obj, finalBoxes, !isModelSrc\(obj\.userData\.src\)\);/.test(rp),
    'every slow refresh rebuilds the cache from its own final output');
}

// ---- the texture half ----------------------------------------------------------------------------
// 12. texInstance: ONE load per (url, colorspace); every tiling is a clone sharing .source.
{
  const loads = [];
  class FakeLoader { load(url, onLoad, onProg, onErr){ const t = new THREE.Texture(); loads.push({ url, t, onLoad, onErr }); return t; } }
  const T3 = { Texture: THREE.Texture, TextureLoader: FakeLoader, RepeatWrapping: THREE.RepeatWrapping, SRGBColorSpace: THREE.SRGBColorSpace };
  const _texInst = {}, _texInstBase = {}, _texInstPend = {};
  const ti = new Function('THREE', '_migrateAssetUrl', '_texInst', '_texInstBase', '_texInstPend',
    extractFunction('texInstance') + '\nreturn texInstance;')(T3, (x) => x, _texInst, _texInstBase, _texInstPend);
  const a = ti('u.png', 2, 2), b = ti('u.png', 5, 1), c = ti('u.png', 2, 2, true, 1.1);
  eq(loads.length, 1, 'three tilings of one url = ONE fetch (was three)');
  assert(a.source === loads[0].t.source && b.source === a.source && c.source === a.source,
    'all tilings share the base .source — one decode, and (per the GL cache key pin below) one upload');
  eq(a.repeat.x, 2, 'tiling A keeps its own repeat'); eq(b.repeat.x, 5, '...and B its own');
  near(c.rotation, 1.1, 1e-12, 'the rotated variant carries its rotation'); eq(c.center.x, 0.5, '...about the center');
  eq(a.version, 0, 'a clone made before the image lands is PARKED at version 0 (no per-frame renderer warning)');
  // the image lands (what TextureLoader itself does), then our onLoad re-arms the parked clones
  loads[0].t.image = { width: 4, height: 4 }; loads[0].t.needsUpdate = true; loads[0].onLoad();
  assert(a.version > 0 && b.version > 0 && c.version > 0, 'the base onLoad re-armed every parked clone');
  const d = ti('u.png', 7, 3);
  eq(loads.length, 1, 'a post-load tiling still fetches nothing');
  assert(d.version > 0 && d.source === a.source, '...arrives upload-ready, sharing the same source');
  assert(ti('u.png', 2, 2) === a, 'the (url, tiling) cache still returns the same instance');
  ti('u.png', 2, 2, false);
  eq(loads.length, 2, 'a LINEAR request gets its OWN base — a normal map must not share the sRGB-tagged source');
}

// 13. The r149 facts, pinned against the vendored build (1267-style — an upgrade fails loudly here).
{
  const three = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),
    'node_modules', 'three', 'build', 'three.cjs'), 'utf8');
  const ci = three.indexOf('this.source = source.source;');
  assert(ci >= 0, 'Texture.copy shares the SOURCE — clone() costs no second image');
  const copySlice = three.slice(ci, three.indexOf('toJSON( meta )', ci));
  assert(copySlice.indexOf('this.needsUpdate = true;') >= 0,
    'copy() marks the clone for update — which is why texInstance parks a pre-load clone at version 0');
  const ki = three.indexOf('function getTextureCacheKey');
  assert(ki >= 0, 'the per-source GL texture cache exists');
  const keySlice = three.slice(ki, three.indexOf('return array.join()', ki));
  assert(/wrapS/.test(keySlice) && /minFilter/.test(keySlice) && /format/.test(keySlice),
    'the GL cache key IS the sampler state...');
  assert(!/repeat|offset|rotation/.test(keySlice),
    '...and repeat/offset/rotation are NOT in it — a tiling clone shares the GPU texture, not just the image');
  assert(three.indexOf('_sources.set( source, webglTextures )') >= 0 && /webglTextures\[ textureCacheKey \]/.test(three),
    'GL textures are cached PER SOURCE keyed by sampler state: same source + same state = ONE _gl.createTexture');
  // and executed against the real build:
  const base = new THREE.Texture(); const cl = base.clone();
  assert(cl.source === base.source, 'executed: clone shares .source');
  cl.repeat.set(3, 2);
  eq(base.repeat.x, 1, '...while repeat stays per-clone');
}

// 14. Eviction, executed: both caches dispose + empty; live shared-material textures survive IN the
//     cache; the _procSurface detail maps are untouched.
{
  const mkT = (n) => ({ isTexture: true, n, disposed: false, dispose(){ this.disposed = true; } });
  const kept = mkT('floor-map'), road = mkT('road'), dead1 = mkT('d1'), dead2 = mkT('d2'), deadBase = mkT('db');
  const procN = mkT('proc-n'), procR = mkT('proc-r');   // canvas-built (build 1139) — in NEITHER cache
  const texCache = { 'a.png': kept, 'road.png': road, 'old.png': dead1 };
  const _texInst = { 'old.png|2|2|s|0': dead2 };
  const _texInstBase = { 'old.png||s': deadBase };
  const _texInstPend = { 'old.png||s': [dead2] };
  const floorMat = { map: kept, normalMap: procN, roughnessMap: procR, userData: { procSurf: { normalMap: procN, roughnessMap: procR } } };
  const wallMat = { normalMap: procN };
  const _trkM = { road: { map: road }, line: {}, barrier: {} };
  const evict = new Function('texCache', '_texInst', '_texInstBase', '_texInstPend', 'floorMat', 'wallMat', '_trkM',
    'const _TEX_EVICT_SLOTS = ' + extractConst('_TEX_EVICT_SLOTS') + ';\n' + extractFunction('_evictTexCaches') + '\nreturn _evictTexCaches;')(
    texCache, _texInst, _texInstBase, _texInstPend, floorMat, wallMat, _trkM);
  evict();
  assert(dead1.disposed && dead2.disposed && deadBase.disposed, 'unreferenced cache entries are DISPOSED (clones, bases, the url cache)');
  eq(Object.keys(_texInst).length, 0, '_texInst emptied'); eq(Object.keys(_texInstBase).length, 0, '_texInstBase emptied');
  eq(Object.keys(_texInstPend).length, 0, 'the pending-clone map emptied');
  assert(!kept.disposed && texCache['a.png'] === kept, 'a texture on a LIVE shared material is never disposed — and STAYS cached, so the entry remains correct');
  assert(!road.disposed && texCache['road.png'] === road, '...the track road map too (build 886 persists across wipes)');
  assert(!procN.disposed && !procR.disposed, 'the procedural detail set is untouched...');
  assert(floorMat.normalMap === procN && floorMat.roughnessMap === procR, '...and still assigned — floorMat detail maps survive the wipe');
  // and the engine facts behind that survival:
  assert(!/texCache|_texInst/.test(extractFunction('_procSurface')), '_procSurface builds from a canvas — its maps are in NEITHER cache by construction');
  assert(/if\(typeof _evictTexCaches==='function'\) _evictTexCaches\(\);/.test(extractFunction('_wipeSceneCore')),
    'the wipe path evicts');
  const rl = extractFunction('restoreLevel');
  const fi = rl.indexOf('freeUnusedModels'), ei = rl.indexOf('_evictTexCaches');
  assert(fi >= 0 && ei > fi, 'restoreLevel evicts at teardown, beside build 991 model purge — the level-swap leak site the audit named');
}

// 15. The census counts a SOURCE once — N tilings are no longer N phantom uploads.
{
  const S = { id: 1 };
  const tA = { source: S, image: { width: 256, height: 256 }, generateMipmaps: false };
  const tB = { source: S, image: { width: 256, height: 256 }, generateMipmaps: false };
  const tC = { image: { width: 128, height: 128 }, generateMipmaps: false };
  const census = new Function('texCache', '_texInst', 'scene', '_texBytesOf',
    extractFunction('_texCensus') + '\nreturn _texCensus;')(
    { 'c.png': tC }, { 'u|2': tA, 'u|5': tB }, { traverse(){} }, new Function('return ' + extractFunction('_texBytesOf').replace(/^function _texBytesOf/, 'function') + ';')());
  const r = census();
  eq(r.count, 2, 'two tilings sharing one source + one standalone = TWO counted textures, not three');
  eq(r.mb, Math.round((256 * 256 * 4 + 128 * 128 * 4) / 1048576), '...and the bytes count the shared source once');
}

done('build 1376: a mover refresh is Box3.copy + applyMatrix4 into reused scratch — exact for a transformed box mesh, translation-exact for everything, conservative (fail-solid) under rotation, stale stamp/child change/no-flag all fall back to the precise path, a landed worker grid rides the movement with the 1203 token honoured, and the 1188 mover classification + 1206 bake signature are byte-untouched. updateXAnim asks a membership flag set at the four prop push sites (cleared at all seven removals) instead of an O(colliders) indexOf per animated prop per frame. And the texture half: ONE fetch per (url, colorspace) with tilings as clones sharing .source (r149 copy + the sampler-state GL cache key pinned against the vendored build), both caches dispose+empty at wipe and level swap while live shared-material textures stay cached and the _procSurface detail maps survive, and the 1353 census dedupes by source so the number it shows is the number the GPU holds');
