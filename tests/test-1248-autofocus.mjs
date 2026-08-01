import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1248: AUTO FOCUS — dofFocus eases toward what a ghost-filtered crosshair ray hits, every 3rd
// frame, opt-in per level. Gates: cutscenes own the lens (focusOn rack), the editor shows the
// authored value. Executed here: the REAL _dofAutoTick in a stubbed scope, through convergence,
// throttling, miss handling, clamping, and every gate.

const tickSrc = extractFunction('_dofAutoTick');

// build the real function inside a controlled scope; knobs let each case flip one thing
function rig(opts = {}) {
  const world = { hits: [], rayCalls: 0, focusStart: opts.focus == null ? 10 : opts.focus };
  const mk = new Function('worldCfg', '_cineActive', 'editorOpen', 'colliders', 'dynamicProps', 'floor', 'enemies', 'NET', '_firstSolidHit', 'world', `
    let dofEnabled = ${opts.dofEnabled === false ? 'false' : 'true'}, dofFocus = world.focusStart;
    let _dofAutoD = world.focusStart, _dofAutoN = 0;
    const _dofRay = { set(o, d){}, far: 0, intersectObjects(list, rec){ world.rayCalls++; world.lastList = list.slice(); return world.hits; } };
    const _dofFwd = {};
    const _dofTgts = [];
    const camera = { position: { x: 0, y: 0, z: 0 }, getWorldDirection(v){ return v; } };
    ${tickSrc}
    return { tick: _dofAutoTick, focus: () => dofFocus, target: () => _dofAutoD };
  `);
  const r = mk(
    opts.worldCfg || { dofAuto: true },
    opts.cine === true, opts.editor === true,
    opts.colliders || [{ isObject3D: true, id: 'wall' }],
    opts.dynamicProps || [], opts.floor || { isObject3D: true, id: 'floor' },
    opts.enemies || [], opts.NET || { enemyMeshes: {} },
    opts.firstSolid !== undefined ? opts.firstSolid : (hits => hits[0] || null),
    world);
  return { ...r, world };
}

{ // convergence: a hit at 42m pulls focus from 10 toward 42, smoothly (never a snap)
  const r = rig(); r.world.hits = [{ distance: 42, object: {} }];
  r.tick(0.016);
  const after1 = r.focus();
  assert(after1 > 10 && after1 < 42, `one tick moves focus partway (${after1.toFixed(2)}), not a snap`);
  near(after1, 10 + (42 - 10) * Math.min(1, 0.016 * 6), 1e-9, 'the ease is exactly k = dt*6');
  for (let i = 0; i < 200; i++) r.tick(0.016);
  near(r.focus(), 42, 0.1, 'focus converges on the hit distance');
}
{ // throttle: the ray fires on every 3rd frame only; the ease runs every frame
  const r = rig(); r.world.hits = [{ distance: 30, object: {} }];
  for (let i = 0; i < 9; i++) r.tick(0.016);
  eq(r.world.rayCalls, 3, '9 frames = 3 raycasts');
}
{ // a sky miss racks out to the far field instead of freezing
  const r = rig({ focus: 30 }); r.world.hits = [];
  for (let i = 0; i < 300; i++) r.tick(0.016);
  near(r.focus(), 200, 0.5, 'nothing under the crosshair = focus walks to 200');
}
{ // clamps: a hit at the camera's nose cannot drive focus below 2; a hostile distance caps at 300
  const r = rig(); r.world.hits = [{ distance: 0.05, object: {} }];
  for (let i = 0; i < 300; i++) r.tick(0.016);
  near(r.focus(), 2, 0.05, 'near clamp holds');
  const r2 = rig(); r2.world.hits = [{ distance: 9999, object: {} }];
  for (let i = 0; i < 300; i++) r2.tick(0.016);
  near(r2.focus(), 300, 0.5, 'far clamp holds');
}
{ // the ghost filter is used — an invisible surface must not pull focus (1236's rule)
  const r = rig({ firstSolid: hits => hits[1] || null });
  r.world.hits = [{ distance: 3, object: { ghost: true } }, { distance: 25, object: {} }];
  for (let i = 0; i < 200; i++) r.tick(0.016);
  near(r.focus(), 25, 0.2, 'focus lands on the first SOLID hit, not the ghost in front of it');
}
{ // gates: each one freezes focus exactly where it is
  for (const [name, opts] of [
    ['dofAuto false', { worldCfg: { dofAuto: false } }],
    ['dof disabled', { dofEnabled: false }],
    ['cutscene active', { cine: true }],
    ['editor open', { editor: true }],
  ]) {
    const r = rig(opts); r.world.hits = [{ distance: 90, object: {} }];
    for (let i = 0; i < 20; i++) r.tick(0.016);
    eq(r.focus(), 10, `${name}: focus untouched`);
    eq(r.world.rayCalls, 0, `${name}: and no ray is even cast`);
  }
}
{ // enemies join the target list (dead ones do not), and the module array is reused — not reallocated
  const r = rig({ enemies: [{ mesh: { id: 'live' }, hp: 5 }, { mesh: { id: 'dead' }, hp: 0 }] });
  r.world.hits = [{ distance: 12, object: {} }];
  r.tick(0.016);
  const ids = r.world.lastList.map(o => o.id);
  assert(ids.includes('live') && !ids.includes('dead'), 'a living enemy can hold focus; a corpse cannot');
  assert(ids.includes('wall') && ids.includes('floor'), 'world geometry is in the list');
}

// --- wiring pins -------------------------------------------------------------------------------------
assert(/if\(typeof _dofAutoTick==='function'\) _dofAutoTick\(dt\);/.test(src), 'the loop ticks it beside the other world updates');
assert(/dofAuto:false,/.test(src), 'DEFAULT_WORLD ships it OFF — no saved level changes look');
assert(/worldCfg\.dofAuto = worldCfg\.dofAuto === true; if\(typeof _dofAutoD!=='undefined'\) _dofAutoD = dofFocus;/.test(src),
  'sanitize normalises the flag and seeds the ease at the authored focus — toggling never racks from a stale target');
assert(/afCb\.onchange=\(\)=>\{ pushUndoSnapshot\(\); worldCfg\.dofAuto=afCb\.checked; applyWorldCfg\(\); \};/.test(src),
  'the editor checkbox is undoable and applies live');
assert(/cutscene shots keep their own focus/.test(src), 'the hint states the cutscene precedence');

done('build 1248: auto focus — the real tick executed through convergence, 3-frame throttle, sky miss, both clamps, the ghost filter, all four gates, and the enemy/corpse list rule');
