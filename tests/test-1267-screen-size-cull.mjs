import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1267: SCREEN-SIZE PROP CULLING — the audit's rendering-scale ceiling. The engine had ANIMATION lod
// and no geometric one: every prop drew at full cost at any distance, so a level's draw cost was flat in
// the camera. The measure is screen size (radius/distance), not distance, because a distance threshold has
// to be authored per object or it hides a cathedral and keeps a pebble.
//
// Measured live on a seeded 600-prop field spread to 300 m, with a CONTROL PAIR (0 -> ... -> 0 returns to
// byte-identical counters), rendering the real scene through renderScene:
//   lodPx 0 : 304 calls  4,624 tris    0 culled   35 visible lights
//   lodPx 2 : 106 calls  2,248 tris  494 culled   35 visible lights   <- the shipped default
//   lodPx 4 :  67 calls  1,780 tris  564 culled   35 visible lights
//   lodPx 8 :  52 calls  1,600 tris  590 culled   35 visible lights
//   lodPx 0 : 304 calls  4,624 tris    0 culled   35 visible lights   <- control returns exactly
// So it buys DRAW CALLS first (-65% at the default) and triangles second — which is the right shape, since
// the props small enough to cull are by definition the cheap ones per triangle.
//
// And on the STOCK level it correctly does nothing: 59 props / 4,858 tris / 107 calls, ZERO props under 8 px.

// ---------------------------------------------------------------- the premise, against the real build
{
  // The whole bullet clause below rests on this: r149's Raycaster ignores `visible` ENTIRELY. If a future
  // three honoured it, a culled prop would stop being HIT at all and _shotGhost could not save it — the
  // failure would be silent and only visible as bullets passing through distant walls.
  const grp = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  grp.add(m); grp.position.set(0, 0, -10); grp.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
  assert(rc.intersectObject(grp, true).length > 0, 'a visible mesh is hit');
  m.visible = false; grp.updateMatrixWorld(true);
  assert(rc.intersectObject(grp, true).length > 0, 'r149 raycasts a mesh with visible=false');
  m.visible = true; grp.visible = false; grp.updateMatrixWorld(true);
  assert(rc.intersectObject(grp, true).length > 0,
    'r149 raycasts through an INVISIBLE ANCESTOR too — so a culled prop still receives the hit');
}

// ---------------------------------------------------------------- the tick, executed
const LOD_HYST = +extractConst('LOD_HYST');
const LOD_BUDGET = +extractConst('LOD_BUDGET');
eq(LOD_HYST > 1, true, 'the hysteresis re-show threshold is above the hide threshold');

function rig(props, opts = {}) {
  const body = [
    'const LOD_HYST = ' + LOD_HYST + ', LOD_BUDGET = ' + LOD_BUDGET + ';',
    'let _lodCursor = 0, _lodAnyCulled = false;',
    'let editorOpen = ' + (opts.editorOpen ? 'true' : 'false') + ';',
    extractFunction('_lodPxNow'), extractFunction('_lodEligible'),
    extractFunction('_lodRestoreAll'), extractFunction('_lodTick'),
    'return { tick:_lodTick, restore:_lodRestoreAll, px:_lodPxNow, elig:_lodEligible,',
    '  any:()=>_lodAnyCulled, setEditor:(v)=>{ editorOpen=v; } };',
  ].join('\n');
  const cam = { position: { x: 0, y: 0, z: 0 }, fov: 75 };
  return new Function('THREE', 'worldCfg', 'propModels', 'renderer', 'camera', body)(
    THREE, opts.world || { lodPx: 2 }, props, { domElement: { height: 720 } }, cam);
}
// a prop is a real Object3D so _lodEligible's Box3 and traverse are the real ones
function prop(x, z, size, extra = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  g.add(m); g.position.set(x, 0, z); g.updateMatrixWorld(true);
  Object.assign(g.userData, extra);
  return g;
}

{ // the basic decision: far and small goes, near stays
  const near = prop(0, -5, 1), far = prop(0, -400, 0.4);
  const r = rig([near, far]);
  r.tick();
  eq(near.visible, true, 'a prop filling real screen space is drawn');
  eq(far.visible, false, 'a prop below the threshold is not');
  eq(far.userData._lodCull, true, '...and is marked as culled BY LOD, not merely hidden');
}
{ // hysteresis: a prop hovering at the boundary must not flicker frame to frame
  const o = prop(0, -100, 1);
  const world = { lodPx: 2 };
  const r = rig([o], { world });
  // place it exactly where the hide test trips, then walk it back a hair — not past the re-show threshold
  r.tick();
  const wasCulled = o.userData._lodCull;
  if (wasCulled) {
    // creep closer by less than the hysteresis margin: it must STAY culled
    o.position.z = -100 / LOD_HYST + 0.5;
    r.tick();
    eq(o.userData._lodCull, true, 'inside the hysteresis band a culled prop stays culled — no flicker');
    o.position.z = -20;               // clearly back in view
    r.tick();
    eq(o.userData._lodCull, false, '...and comes back once it is properly big again');
    eq(o.visible, true);
  }
}
{ // A LIGHT IS NEVER HIDDEN. Hiding one changes the scene's light count and recompiles every lit material
  // mid-frame — the freeze of builds 636 / 977 / 1153 / 1155. Seven of the stock level's 59 props carry one.
  const lamp = prop(0, -400, 0.4);
  lamp.add(new THREE.PointLight(0xffffff, 1, 10));
  lamp.updateMatrixWorld(true);
  const r = rig([lamp]);
  r.tick(); r.tick();
  eq(lamp.visible, true, 'a prop carrying a light is NEVER culled, however small on screen');
  eq(lamp.userData._lodNo, true, '...and is marked ineligible once, so the subtree walk is not repeated');
}
{ // build 1250 emitters opt out (frustumCulled=false by design, and already tiny)
  const fx = prop(0, -400, 0.4, { fx: true });
  const r = rig([fx]); r.tick();
  eq(fx.visible, true, 'an effect emitter is not culled');
}
{ // the logic graph owns hideprop's visibility (1170) — LOD must never fight it
  const hidden = prop(0, -5, 1, { _pvHidden: true });
  hidden.visible = false;
  const r = rig([hidden]);
  r.tick();
  eq(hidden.visible, false, 'a graph-hidden prop stays hidden even when it is big on screen');
  eq(!!hidden.userData._lodCull, false, '...and LOD never claims it');
  r.restore();
  eq(hidden.visible, false, 'and restore-all does not un-hide what the graph hid');
}
{ // AUTHORING is not playing: a prop that vanishes for being small is indistinguishable from one you
  // failed to place, so the editor never culls — and opening it restores whatever was culled.
  const far = prop(0, -400, 0.4);
  const r = rig([far]);
  r.tick();
  eq(far.visible, false, 'culled in play');
  r.setEditor(true);
  r.tick();
  eq(far.visible, true, 'opening the editor restores every culled prop');
  eq(far.userData._lodCull, false, '...and clears the flag, so nothing is left in a half state');
}
{ // 0 is off, and turning it off restores — the control pair the live measurement reproduced
  const far = prop(0, -400, 0.4);
  const world = { lodPx: 4 };
  const r = rig([far], { world });
  r.tick();
  eq(far.visible, false);
  world.lodPx = 0;
  r.tick();
  eq(far.visible, true, 'lodPx 0 restores everything — the setting is fully reversible');
}
{ // hostile / malformed values can never blank the level
  eq(rig([], { world: { lodPx: 1e9 } }).px(), 16, 'an absurd threshold is clamped');
  eq(rig([], { world: { lodPx: -5 } }).px(), 0, 'a negative one is off');
  eq(rig([], { world: {} }).px(), 0, 'an absent one is off');
  eq(rig([], { world: { lodPx: NaN } }).px(), 0, 'NaN is off, never a threshold that hides the world');
}
{ // a GLB still loading has no bounds — measuring it would give radius 0 and cull it while it is in your face
  const empty = new THREE.Group(); empty.position.set(0, 0, -5); empty.updateMatrixWorld(true);
  const r = rig([empty]);
  r.tick(); r.tick();
  eq(empty.visible, true, 'a prop with no measurable bounds yet is left alone');
  eq(empty.userData._lodNo, undefined, '...and is NOT cached as ineligible, so it is re-asked once the model lands');
}
{ // the budget is a rolling window, so a huge level costs a fixed slice per frame rather than a spike
  const many = []; for (let i = 0; i < LOD_BUDGET * 3; i++) many.push(prop(0, -400, 0.4));
  const r = rig(many);
  r.tick();
  const after1 = many.filter(o => o.userData._lodCull).length;
  assert(after1 > 0 && after1 <= LOD_BUDGET, 'one tick examines at most the budget (' + after1 + ' of ' + many.length + ')');
  r.tick(); r.tick(); r.tick();
  eq(many.filter(o => o.userData._lodCull).length, many.length, 'and the cursor rolls until every prop has been judged');
}

// ---------------------------------------------------------------- the bullet clause
{
  const ghost = new Function('THREE', extractFunction('_shotGhost') + '; return _shotGhost;')(THREE);
  const solidMat = new THREE.MeshBasicMaterial();
  const mk = (mat, ud = {}, parentUd = null) => {
    const g = new THREE.Group(); if (parentUd) Object.assign(g.userData, parentUd);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); Object.assign(m.userData, ud);
    g.add(m); return m;
  };
  const plain = mk(solidMat);
  eq(ghost(plain, null), false, 'an ordinary drawn surface stops a bullet');

  // THE INTEGRATION: 1236 made any invisible ancestor a ghost. A prop the RENDERER skipped for size is not
  // a ghost — it is a solid that simply was not drawn, and a distant wall must keep stopping shots.
  const culledMesh = mk(solidMat, {}, { _lodCull: true });
  culledMesh.parent.visible = false;
  eq(ghost(culledMesh, null), false, 'a SCREEN-SIZE-CULLED prop still stops a bullet');

  // ...while 1236's actual case is untouched: a genuinely invisible collision volume is still a ghost
  const hiddenMesh = mk(solidMat, {}, {});
  hiddenMesh.parent.visible = false;
  eq(ghost(hiddenMesh, null), true, 'a prop hidden for any OTHER reason is still a ghost (build 1236 intact)');
  const invisMat = mk(new THREE.MeshBasicMaterial({ visible: false }));
  eq(ghost(invisMat, null), true, '...as is an invisible material');
  const proxy = mk(solidMat, { isHitProxy: true }, { _lodCull: true });
  proxy.parent.visible = false;
  eq(ghost(proxy, null), false, 'and a hit proxy is checked first, as always');
}

// ---------------------------------------------------------------- wiring
assert(/lodPx:2,/.test(src), 'the default threshold ships at 2 px — about a full stop, below anything you could see');
assert(/if\(typeof _lodTick==='function'\) _lodTick\(\);/.test(src), 'the frame loop drives it');
{
  const off = extractFunction('_postOffWorld');
  assert(!/lodPx/.test(off), 'a scene with post switched off keeps culling — this is a cost control, not a look');
}
assert(/slider\(b,'Cull below \(px\)','lodPx',0,16,1\)/.test(src), 'and it is authorable beside the other cost controls');

done('build 1267: screen-size prop culling — executed over real three objects (cull/restore, hysteresis, rolling budget, hostile thresholds, unloaded bounds), with the three invariants that make it safe proven: a prop carrying a LIGHT is never hidden (the light-count freeze), the editor never culls, and a culled prop still stops bullets while build 1236\'s real ghosts still do not');
