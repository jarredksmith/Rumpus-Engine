import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1274: two follow-ups to 1273's unreproducible "my props vanished" report.
//
// 1. CULL FROM THE GEOMETRY'S CENTRE, not the prop's origin. A GLB's contents need not sit at its own
//    origin — a model exported from a scene carries its world position baked in — so measuring to the
//    origin asks "how far am I from a point in empty space". Constructed in a probe: a building whose
//    geometry is 20 m from the camera while its origin is 320 m away.
// 2. THE CULLER REPORTS ON ITSELF. Three hypotheses were tested against 1273's report and none reproduced
//    (a real imported GLB measured radius 56.02 and survived to 120 m; an offset origin survived; a
//    SkinnedMesh measures its rest pose, which is the right magnitude). The lesson is not to guess harder
//    next time — it is that a subsystem which can DELETE THINGS FROM THE SCREEN must account for itself,
//    so the next report is one number instead of another round of hypotheses.

const C = n => +extractConst(n);
function rig(props, opts = {}) {
  const body = [
    `const LOD_HYST=${C('LOD_HYST')}, LOD_BUDGET=${C('LOD_BUDGET')}, LOD_SHADOW_MUL=${C('LOD_SHADOW_MUL')}, LOD_NEAR_KEEP=${C('LOD_NEAR_KEEP')};`,
    'let _lodCursor=0,_lodAnyCulled=false,editorOpen=false;',
    // build 1431 added a GEOMETRY rung to _lodTick and a restore call to _lodRestoreAll. This harness
    // is about the cull and shadow rungs and says nothing about geometry, so the new dependency is
    // supplied INERT — _lodGeoN of 0 is exactly 'no mesh has a level of detail', which is the state
    // every assertion here was written against.
    'let _lodGeoN = 0; function _lodGeoTick(){} function _lodGeoRestoreAll(){}',
    'function _dirtyShadows(){}',
    extractFunction('_lodPxNow'), extractFunction('_lodEligible'), extractFunction('_lodSetCasting'),
    extractFunction('_lodRemeasure'), extractFunction('lodReport'),
    // build 1440: the batches got their own rung inside _lodTick. Supplied LIFTED FROM SOURCE with an
    // empty batch list, so it runs here as a real no-op rather than a restated stub — these rigs are
    // about the PER-PROP rungs, and test-1440 owns the batch one.
    'let instanceMeshes = [];', extractFunction('_lodInstShadowTick'),
    extractFunction('_lodRestoreAll'), extractFunction('_lodTick'),
    'return { tick:_lodTick, report:lodReport };',
  ].join('\n');
  const cam = opts.cam || { position: { x: 0, y: 0, z: 0 }, fov: 75 };
  return Object.assign(new Function('THREE', 'worldCfg', 'propModels', 'renderer', 'camera', body)(
    THREE, opts.world || { lodPx: 2 }, props,
    { domElement: { clientHeight: 720, height: 720 } }, cam), { cam });
}
// a prop whose GEOMETRY sits `off` units from its own origin — an ordinary exported GLB
function prop(originZ, off, size, extra = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  m.castShadow = true; m.position.set(0, 0, off);
  g.add(m); g.position.set(0, 0, originZ); g.updateMatrixWorld(true);
  Object.assign(g.userData, extra);
  return g;
}

{ // 1. the centre is measured, and it is an OFFSET from the origin so the tick stays allocation-free
  const p = prop(-320, 300, 40);
  const r = rig([p]); r.tick();
  eq(Math.round(p.userData._lodCz), 300, 'the geometry centre is remembered relative to the prop origin');
  eq(Math.round(p.userData._lodCx), 0);
  eq(Math.round(p.userData._lodR), 35, '...alongside the radius');
}
{ // THE CASE IT FIXES: judged where the geometry IS, not where its origin is
  // A small prop 300 m from its own origin, with the camera standing right beside the GEOMETRY.
  const p = prop(-310, 300, 3);          // geometry centre at z = -10, origin at z = -310
  const r = rig([p], { world: { lodPx: 8 } });
  r.tick(); r.tick();
  eq(p.visible, true, 'a prop 10 m away is drawn — even though its ORIGIN is 310 m away');
  // and the reverse: standing at the origin must NOT keep distant geometry alive
  const q = prop(-10, -300, 3);          // origin 10 m away, geometry 310 m away
  const r2 = rig([q], { world: { lodPx: 8 } });
  r2.tick(); r2.tick();
  eq(q.visible, false, '...and standing at the ORIGIN does not keep geometry 310 m away drawn');
}
{ // the near floor is measured to the centre too, or it would protect the wrong point in space
  const p = prop(-500, 480, 0.5);        // geometry 20 m away, well inside the 40 m floor
  const r = rig([p], { world: { lodPx: 16 } });
  r.tick(); r.tick();
  eq(p.visible, true, 'the near floor protects the geometry, not the origin');
}

// --- 2. the report -----------------------------------------------------------------------------------
{
  const big = prop(-6, 0, 20), small = prop(-4000, 0, 0.4), lamp = prop(-4000, 0, 0.4);
  lamp.add(new THREE.PointLight(0xffffff, 1, 5)); lamp.updateMatrixWorld(true);
  const r = rig([big, small, lamp], { world: { lodPx: 2 } });
  r.tick(); r.tick();
  const rep = r.report();
  eq(rep.px, 2, 'the report states the threshold in force');
  eq(rep.culled, 1, '...how many props are hidden right now');
  assert(rep.noShadow >= 1, '...how many stopped casting');
  eq(rep.eligible, 2, '...and how many are even eligible (the lamp is not — it carries a light)');
  assert(rep.minR > 0 && rep.minR < 1,
    'THE TELL: the smallest measured radius (' + rep.minR.toFixed(2) + 'm) — a large model reading a tiny radius is the class of bug 1273 could not rule out');
  // fresh props: reusing the ones above would carry their flags into a rig whose _lodAnyCulled starts false
  const off = rig([prop(-6, 0, 20), prop(-4000, 0, 0.4)], { world: { lodPx: 0 } });
  off.tick();
  eq(off.report().px, 0, 'with culling off the report says so');
  eq(off.report().culled, 0, '...and nothing is hidden');
}
{ // it must never throw — it runs inside the Level Check panel
  const r = rig([null, undefined, prop(-5, 0, 1)], { world: { lodPx: 2 } });
  r.tick();
  const rep = r.report();
  assert(rep && typeof rep.culled === 'number', 'null slots in propModels do not break the report');
  const empty = rig([], { world: { lodPx: 2 } });
  eq(empty.report().minR, 0, 'an empty level reports 0 rather than Infinity');
}
{ // surfaced where a creator already looks for "why does my level look wrong"
  const li = extractFunction('levelIssues');
  assert(/lodReport\(\)/.test(li), 'the Level Check panel asks for it');
  assert(/r\.px>0 && \(r\.culled>0 \|\| r\.noShadow>0\)/.test(li),
    '...and says nothing at all when culling is off or idle — an opt-in feature must not nag');
  assert(/Smallest measured prop radius/.test(li), '...reporting the radius, which is the diagnostic number');
  assert(/set Cull below \(px\) back to 0/.test(li), '...and naming the one-step way out');
  assert(/issues\.push\(/.test(li.slice(li.indexOf('lodReport'))), 'it joins the same plain-string list as every other issue');
}

done('build 1274: culling measures from the geometry’s CENTRE rather than the prop origin (a probe built an ordinary GLB whose geometry sits 300m from its own origin, where the old measure asked how far the camera was from empty space), and the culler now reports what it removed and the smallest radius it measured into the Level Check panel — so 1273’s unreproducible report becomes one number next time instead of another round of hypotheses');
