import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1270: THE RUNG ABOVE CULLING, and the shadow-map refresh build 1267 owed and did not pay.
//
// A prop stops CASTING well before it stops being DRAWN: the shadow map is a whole extra scene pass per
// cascade, and a shadow cast by something a few pixels across is not a shape anybody can read. This is the
// cheap middle rung of an LOD ladder and it needs no simplified geometry.
//
// Measured live on 400 props seeded INSIDE the shadow volume (1267's field was at 300 m, never in a
// cascade at all — a measurement that would have shown nothing here):
//   lodPx 0 : 1,334 calls  20,428 tris    0 culled    0 not-casting   460 meshes casting
//   lodPx 1 :   894 calls  15,184 tris    0 culled  262 not-casting   198          <- the rung ALONE
//   lodPx 2 :   558 calls  11,152 tris   81 culled  368 not-casting    92          <- shipped default
//   lodPx 4 :   314 calls   8,224 tris  262 culled  398 not-casting    62
//   lodPx 0 : 1,362 calls  20,800 tris    0 culled    0 not-casting   460          <- control
// The lodPx 1 row is the honest isolation: NOTHING was hidden (0 culled) and draw calls still fell 33%.
// The control returns to within 2% rather than exactly, because forcing the shadow map to rebuild each
// sample includes a cascade fit that tracks the live camera and sun — expected drift, not a leak.

const LOD_SHADOW_MUL = +extractConst('LOD_SHADOW_MUL');
const LOD_NEAR_KEEP = +extractConst('LOD_NEAR_KEEP');   // build 1273's near floor
const LOD_HYST = +extractConst('LOD_HYST');
const LOD_BUDGET = +extractConst('LOD_BUDGET');
assert(LOD_SHADOW_MUL > 1, 'a prop stops casting BEFORE it stops drawing, never after');

function rig(props, opts = {}) {
  const body = [
    'const LOD_HYST = ' + LOD_HYST + ', LOD_BUDGET = ' + LOD_BUDGET + ', LOD_SHADOW_MUL = ' + LOD_SHADOW_MUL + ', LOD_NEAR_KEEP = ' + LOD_NEAR_KEEP + ';',
    'let _lodCursor = 0, _lodAnyCulled = false, dirtied = 0;',
    // build 1431 added a GEOMETRY rung to _lodTick and a restore call to _lodRestoreAll. This harness
    // is about the cull and shadow rungs and says nothing about geometry, so the new dependency is
    // supplied INERT — _lodGeoN of 0 is exactly 'no mesh has a level of detail', which is the state
    // every assertion here was written against.
    'let _lodGeoN = 0; function _lodGeoTick(){} function _lodGeoRestoreAll(){}',
    'let editorOpen = false;',
    'function _dirtyShadows(){ dirtied++; }',
    /* build 1457: `_lodPxNow` now takes the larger of the creator's value and a per-rung ladder FLOOR,
    so these rigs need the floor too. It is LIFTED FROM SOURCE, never restated — and deliberately not
    stubbed to 0, because a stub would hide the very interaction this file's subject depends on. The
    scope below sets rung 0 with the scaler off, which is byte-identical to the pre-1457 behaviour. */
    'let _adaptOn = false, _prStepI = 0;',
    (gameSource().match(/const _LADDER_LOD_PX = \[[^\]]*\];/) || [''])[0],
    extractFunction('_lodFloorNow'),
    extractFunction('_lodPxNow'), extractFunction('_lodEligible'),
    extractFunction('_lodSetCasting'), extractFunction('_lodRemeasure'),
    // build 1440: the batches got their own rung inside _lodTick. Supplied LIFTED FROM SOURCE with an
    // empty batch list, so it runs here as a real no-op rather than a restated stub — these rigs are
    // about the PER-PROP rungs, and test-1440 owns the batch one.
    'let instanceMeshes = [];', extractFunction('_lodInstShadowTick'),
    extractFunction('_lodRestoreAll'), extractFunction('_lodTick'),
    'return { tick:_lodTick, restore:_lodRestoreAll, dirtied:()=>dirtied, reset:()=>{ dirtied=0; },',
    '  setEditor:(v)=>{ editorOpen=v; } };',
  ].join('\n');
  return new Function('THREE', 'worldCfg', 'propModels', 'renderer', 'camera', body)(
    THREE, opts.world || { lodPx: 2 }, props,
    { domElement: { height: 720 } }, { position: { x: 0, y: 0, z: 0 }, fov: 75 });
}
function prop(z, size, castShadow = true) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  m.castShadow = castShadow;
  g.add(m); g.position.set(0, 0, z); g.updateMatrixWorld(true);
  return g;
}
const mesh = (g) => g.children[0];

{ // the ladder: three bands, in the right order
  const near = prop(-4, 1), mid = prop(-60, 1), far = prop(-600, 1);
  const r = rig([near, mid, far]);
  r.tick();
  eq(near.visible, true, 'near: drawn');
  eq(mesh(near).castShadow, true, '...and casting');
  eq(mid.visible, true, 'MIDDLE RUNG: still drawn');
  eq(mesh(mid).castShadow, false, '...but no longer casting — the whole point of this build');
  eq(far.visible, false, 'far: not drawn at all');
}
{ // the flags are distinct, and the caster rung is evaluated even while culled
  const far = prop(-600, 1);
  const r = rig([far]);
  r.tick();
  eq(far.userData._lodCull, true, 'a culled prop is flagged culled');
  eq(far.userData._lodNoShadow, true, '...and also flagged as not casting, so it returns in the right state');
  far.position.z = -3; r.tick();
  eq(far.userData._lodCull, false, 'coming back close restores drawing');
  eq(far.userData._lodNoShadow, false, '...and casting');
  eq(mesh(far).castShadow, true, '...on the mesh itself');
}
{ // THE TRAP: the authored castShadow is REMEMBERED, never assumed. levelgen's `nocollide` grass (1096)
  // legitimately never casts, and a blanket restore would start it casting the moment you walked near.
  const grass = prop(-600, 1, false);
  const r = rig([grass]);
  r.tick();
  eq(mesh(grass).castShadow, false, 'a never-casting mesh is still not casting when far');
  eq(mesh(grass).userData._lodCS, false, '...and its authored value was captured as false');
  grass.position.z = -2;
  r.tick(); r.tick();
  eq(mesh(grass).castShadow, false, 'AND IS STILL NOT CASTING UP CLOSE — restore returns the authored value, not true');
}
{ // a mixed prop keeps each mesh's own answer
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); a.castShadow = true;
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); b.castShadow = false;
  g.add(a); g.add(b); g.position.set(0, 0, -600); g.updateMatrixWorld(true);
  const r = rig([g]);
  r.tick();
  eq(a.castShadow, false); eq(b.castShadow, false);
  g.position.z = -2; r.tick(); r.tick();
  eq(a.castShadow, true, 'the casting half comes back');
  eq(b.castShadow, false, '...and the non-casting half does not');
}
{ // hysteresis applies to the caster rung too, or a prop at the boundary flickers its shadow every frame
  const o = prop(-60, 1);
  const r = rig([o]);
  r.tick();
  eq(o.userData._lodNoShadow, true, 'past the caster threshold it stops casting');
  o.position.z = -60 * 1.05;   // barely closer, still inside the hysteresis band
  r.tick();
  eq(o.userData._lodNoShadow, true, '...and stays off inside the band');
  o.position.z = -5; r.tick();
  eq(o.userData._lodNoShadow, false, '...coming back only once it is properly big');
}

// --- THE DEFECT 1267 SHIPPED ------------------------------------------------------------------------
{
  // `renderer.shadowMap.autoUpdate` is false (build 1093's static shadow map): the map is only redrawn
  // when _dirtyShadows() asks. So hiding a prop does NOT remove its shadow and un-hiding one does not
  // bring it back — the ground keeps the shadow of something no longer drawn until some unrelated event
  // happens to request a refresh. Verified live: autoUpdate false, and one state-changing tick now
  // leaves _shadowDirtyFrames at 2.
  assert(/renderer\.shadowMap\.autoUpdate = false/.test(src), 'the shadow map really is static');
  const tick = extractFunction('_lodTick');
  assert(/_lodDirty && typeof _dirtyShadows==='function'\) _dirtyShadows\(\)/.test(tick),
    'so a tick that changed what casts (or what draws) requests a refresh');
  assert(/_dirtyShadows\(\)/.test(extractFunction('_lodRestoreAll')), '...and so does restore-all');

  const far = prop(-600, 1), near = prop(-4, 1);
  const r = rig([far, near]);
  r.reset(); r.tick();
  assert(r.dirtied() > 0, 'a tick that culls a prop dirties the shadow map — otherwise its shadow lingers');
  r.reset(); r.tick(); r.tick();
  eq(r.dirtied(), 0, 'a tick that changes NOTHING does not — this stays free in a settled scene');
  far.position.z = -2;
  r.reset(); r.tick();
  assert(r.dirtied() > 0, 'and bringing a prop back dirties it too, or it returns without its shadow');
}
{ // restore-all (editor / lodPx 0) puts every caster back and says so
  const far = prop(-600, 1);
  const world = { lodPx: 2 };
  const r = rig([far], { world });
  r.tick();
  eq(mesh(far).castShadow, false);
  r.reset();
  world.lodPx = 0; r.tick();
  eq(far.visible, true, 'turning it off restores drawing');
  eq(mesh(far).castShadow, true, '...and casting');
  eq(far.userData._lodNoShadow, false, '...and clears the flag');
  assert(r.dirtied() > 0, '...and refreshes the map');
  const e = rig([prop(-600, 1)]);
  e.tick(); e.setEditor(true); e.reset(); e.tick();
  assert(e.dirtied() > 0, 'opening the editor does the same');
}
{ // a prop carrying a light is exempt from BOTH rungs — the light-count rule is unchanged by this build
  const lamp = prop(-600, 1);
  lamp.add(new THREE.PointLight(0xffffff, 1, 10));
  lamp.updateMatrixWorld(true);
  const r = rig([lamp]);
  r.tick(); r.tick();
  eq(lamp.visible, true, 'still drawn');
  eq(mesh(lamp).castShadow, true, '...and still casting — ineligible means ineligible for the whole ladder');
}

// --- wiring ------------------------------------------------------------------------------------------
assert(/stop casting a shadow at 4\\u00d7 that size/.test(src),
  'the setting hint tells the truth about both rungs, not just culling');

done('build 1270: the shadow rung — a prop stops casting well before it stops drawing (measured: 33% fewer draw calls with ZERO props hidden), the authored castShadow is remembered rather than assumed so a never-casting mesh never starts, hysteresis covers the new rung, and the static shadow map is finally told when what-casts changes — the refresh build 1267 owed');
