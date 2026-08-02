import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1291: every Ctrl+Z ran restoreLevel — a full teardown and respawn of every prop, light, zone and
// marker, with each imported model re-fetched or re-cloned and re-materialised. So nudging a crate and
// undoing it cost the same as loading the level, on the step the editor's core rhythm repeats constantly.
// Build 1163 had already had to bolt a by-nid reselect onto the far side, because the rebuild threw the
// selection away — that is the shape of a workaround for a step that should not have been happening.
//
// Measured live, stock level, 56 props, undoing one nudge. The step replaced: 74.33 ms -> 0.44 ms (169x).
// The whole Ctrl+Z, which is what the creator feels: 108.5 ms -> 24.4 ms (4.4x) — the remainder is
// serializeLevel (needed for the redo entry) and renderEditorFields, neither of which this build touches.
// Verified end to end by OBJECT IDENTITY: after undoing a move, propByNid returns the SAME JS object and
// the selection still holds it; after undoing a tag edit it returns a different one — the reload running.

const diff = new Function(extractFunction('_undoMoveDiff') + '; return _undoMoveDiff;')();
const P = (nid, t, extra) => Object.assign({ src: 'prim:box', t: t.slice(), nid }, extra || {});
const L = (props, extra) => Object.assign({ v: 1, world: { sun: 1 }, game: { objective: 'eliminate' }, props }, extra || {});
const T0 = [1, 2, 3, 0, 0, 0, 1, 1, 1];
const T1 = [1, 9, 3, 0, 0, 0, 1, 1, 1];

// ---------------------------------------------------------------- what it accepts
{
  const a = L([P('n1', T0), P('n2', T0)]);
  eq(diff(a, L([P('n1', T0), P('n2', T0)])).length, 0, 'two identical states need no work at all');
  const one = diff(a, L([P('n1', T1), P('n2', T0)]));
  eq(one.length, 1, 'one moved prop -> one move');
  eq(one[0].nid, 'n1', '...identified by nid, never by index');
  eq(JSON.stringify(one[0].t), JSON.stringify(T1), '...carrying the TARGET transform');
  eq(diff(a, L([P('n1', T1), P('n2', T1)])).length, 2, 'a group drag moves several');
  // every component counts, not just position
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const t = T0.slice(); t[k] += 0.001;
    eq(diff(a, L([P('n1', t), P('n2', T0)])).length, 1, 'component ' + k + ' of the transform is compared');
  }
}

// ---------------------------------------------------------------- what it REFUSES, which is the safety
{
  const a = L([P('n1', T0), P('n2', T0)]);
  eq(diff(a, L([P('n1', T0)])), null, 'a deleted prop is a reload');
  eq(diff(a, L([P('n1', T0), P('n2', T0), P('n3', T0)])), null, 'an added prop is a reload');
  eq(diff(a, L([P('n2', T0), P('n1', T0)])), null, 'a REORDER is a reload — propModels order is level data');
  eq(diff(a, L([P('n1', T0, { src: 'https://x/y.glb' }), P('n2', T0)])), null, 'a different model is a different mesh');
  eq(diff(L([P(null, T0)]), L([P(null, T1)])), null,
    'NO NID DISQUALIFIES THE WHOLE DIFF — without identity the index is the only link, and a silent mismatch writes a transform onto the wrong prop');
  eq(diff(L([P('', T0)]), L([P('', T1)])), null, '...an empty one too');
  eq(diff(a, L([P('nX', T0), P('n2', T0)])), null, 'a changed nid is a reload');
  // ANY other field on the prop
  for (const extra of [{ mat: { col: 1 } }, { tg: 'door' }, { dyn: 1 }, { sg: [{ w: 'use', d: 'open' }] },
                       { nm: 'crate' }, { eh: 1 }, { elk: 1 }, { gid: 'g1' }, { xa: { mode: 'loop' } },
                       { veh: {} }, { j: { type: 'hinge' } }, { itr: 1 }, { anim: 'trigger' }])
    eq(diff(a, L([P('n1', T0, extra), P('n2', T0)])), null,
      'a change to ' + Object.keys(extra)[0] + ' falls through to the reload');
  // ...and any change ABOVE the props
  eq(diff(a, L([P('n1', T1), P('n2', T0)], { world: { sun: 2 } })), null, 'a world setting is a reload');
  eq(diff(a, L([P('n1', T1), P('n2', T0)], { game: { objective: 'race' } })), null, 'a game setting is a reload');
  eq(diff(a, L([P('n1', T1), P('n2', T0)], { logic: { nodes: [] } })), null, 'an ADDED top-level key is a reload');
  eq(diff(L([P('n1', T0)], { lights: [1] }), L([P('n1', T1)])), null, 'a REMOVED top-level key is a reload');
}
{ // malformed input is a reload, never a throw and never a partial answer
  eq(diff(null, L([])), null);
  eq(diff(L([]), null), null);
  eq(diff(undefined, undefined), null);
  eq(diff({}, {}), null, 'a level with no props array is a reload');
  eq(diff(L([P('n1', T0)]), L([{ src: 'prim:box', nid: 'n1' }])), null, 'a missing transform is a reload');
  eq(diff(L([P('n1', T0)]), L([Object.assign(P('n1', T0), { t: [1, 2, 3] })])), null, 'a short transform is a reload');
  eq(diff(L([P('n1', T0)]), L([Object.assign(P('n1', T0), { t: 'nope' })])), null, 'a non-array transform is a reload');
  eq(diff(L([null]), L([null])), null, 'a hole in the array is a reload');
}
{ // THE COMPARISON IS BY EXCLUSION, not by an allow-list of fields — which is what keeps it correct when a
  // field is added later. A future prop key nobody updated here must REFUSE, not be silently ignored.
  const a = L([P('n1', T0)]);
  eq(diff(a, L([P('n1', T1, { someFutureField: 7 })])), null,
    'an unknown prop field disqualifies the fast path, because it was never enumerated as "allowed to differ"');
  assert(/JSON\.stringify\(Object\.assign\(\{\}, a, \{t:0\}\)\) !== JSON\.stringify\(Object\.assign\(\{\}, b, \{t:0\}\)\)/.test(src),
    'the prop compare strips the transform and compares the rest whole');
  assert(/JSON\.stringify\(Object\.assign\(\{\}, cur, \{props:0\}\)\) !== JSON\.stringify\(Object\.assign\(\{\}, tgt, \{props:0\}\)\)/.test(src),
    '...and the level compare strips the props and compares the rest whole');
  assert(/Both sides come from the same `serializeLevel`, so key order matches/.test(src),
    'and why a string compare is a true deep compare here is written down — it is the assumption that carries it');
}

// ---------------------------------------------------------------- the apply
const mkRig = () => {
  const log = [];
  const mkObj = (nid) => ({ userData: { nid, footR: 0.5 },
    position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    rotation: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    scale: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } } });
  const objs = { n1: mkObj('n1'), n2: mkObj('n2') };
  const fn = new Function('propByNid', '_maxTerrainOver', 'retileProcSurface', '_propProcSpan',
    'refreshPropCollider', '_homeSync', extractFunction('_applyUndoMoves') + '; return _applyUndoMoves;')(
    (nid) => objs[nid] || null,
    (x, z, r) => (x === 1 ? 10 : 0),                    // a terrain that lifts by 10 at x=1
    (o, span) => log.push(['retile', o.userData.nid, span]),
    (o) => Math.max(Math.abs(o.scale.x || 0), Math.abs(o.scale.y || 0), Math.abs(o.scale.z || 0)),
    (o) => log.push(['collider', o.userData.nid]),
    (o) => log.push(['home', o.userData.nid]));
  return { fn, objs, log };
};
{
  const { fn, objs, log } = mkRig();
  eq(fn([{ nid: 'n1', t: [1, 2, 3, 0.4, 0.5, 0.6, 2, 3, 4] }]), true, 'a resolvable move applies');
  eq(objs.n1.position.x, 1);
  eq(objs.n1.position.y, 12, 'THE Y IS TERRAIN-RELATIVE (build 893) — the ground offset is added back');
  eq(objs.n1.position.z, 3);
  eq(objs.n1.rotation.y, 0.5, 'rotation lands');
  eq(objs.n1.scale.z, 4, 'scale lands');
  // the gizmo drag's own sequence, so an undone transform is identical to a dragged one
  eq(log.filter(e => e[0] === 'collider').length, 1, 'the collider is refreshed');
  eq(log.filter(e => e[0] === 'home').length, 1, 'a dynamic prop’s authored home is resynced (build 713)');
  const rt = log.find(e => e[0] === 'retile');
  assert(rt, 'the procedural grain is retiled (build 1139)');
  eq(rt[2], 4, '...to the NEW span, so a scaled prop’s grain keeps its physical size');
}
{ // ALL-OR-NOTHING: one unresolvable nid must move nothing at all
  const { fn, objs, log } = mkRig();
  eq(fn([{ nid: 'n1', t: [1, 2, 3, 0, 0, 0, 1, 1, 1] }, { nid: 'gone', t: [4, 5, 6, 0, 0, 0, 1, 1, 1] }]), false,
    'an unresolvable prop fails the whole apply');
  eq(objs.n1.position.x, undefined, '...and the resolvable one was NOT moved — every object is resolved first');
  eq(log.length, 0, '...nothing was touched at all');
  eq(fn(null), false, 'a null diff never throws');
}
{ // no moves is a legitimate answer, not a fallback
  const { fn, log } = mkRig();
  eq(fn([]), true, 'an empty diff succeeds and does nothing');
  eq(log.length, 0);
}

// ---------------------------------------------------------------- the step, executed
const mkStep = () => {
  const st = { restored: 0, fastRefresh: 0, resel: 0, active: [], serial: null, throwOnApply: false };
  const fn = new Function('serializeLevel', 'restoreLevel', '_undoMoveDiff', '_applyUndoMoves',
    '_edFastRefresh', '_selNids', '_reselectByNids', '_edSyncHistoryBtns', 'ST',
    'let editorUndoActive=false;\n' + extractFunction('_historyStep') +
    '; return { step:_historyStep, act:()=>editorUndoActive };')(
    () => st.serial,
    (lv) => { st.restored++; st.serial = lv; },
    diff,
    (mv) => { if (st.throwOnApply) throw new Error('boom'); st.active.push(true); return st.applyOK !== false; },
    () => st.fastRefresh++,
    () => ['n1'],
    () => st.resel++,
    () => {}, st);
  return { st, fn };
};
{
  const { st, fn } = mkStep();
  st.serial = L([P('n1', T0)]);
  const target = JSON.stringify(L([P('n1', T1)]));
  const redo = [];
  eq(fn.step(target, redo), true, 'the step reports success');
  eq(st.fastRefresh, 1, 'a pure transform diff took the fast path');
  eq(st.restored, 0, 'THE POINT: the level was never reloaded');
  eq(st.resel, 0, 'and build 1163’s by-nid reselect did not have to run — the selection was never lost');
  eq(redo.length, 1, 'the state left behind is pushed to the opposite stack');
}
{ // anything else still reloads, exactly as before
  const { st, fn } = mkStep();
  st.serial = L([P('n1', T0)]);
  const redo = [];
  fn.step(JSON.stringify(L([P('n1', T0), P('n2', T0)])), redo);
  eq(st.restored, 1, 'an added prop reloads');
  eq(st.resel, 1, '...and reselects by nid on the far side (build 1163)');
  eq(st.fastRefresh, 0);
}
{ // A THROW MID-APPLY FALLS BACK, and the reload rebuilds from the snapshot so a partial apply cannot survive
  const { st, fn } = mkStep();
  st.serial = L([P('n1', T0)]);
  st.throwOnApply = true;
  const redo = [];
  eq(fn.step(JSON.stringify(L([P('n1', T1)])), redo), true, 'the step still succeeds');
  eq(st.restored, 1, 'a throwing fast path falls through to the reload');
  eq(st.fastRefresh, 0);
  assert(!fn.act(), 'and the re-entrancy guard is released, or every later edit would stop recording history');
}
{ // an apply that reports failure (unresolvable nid) also falls back
  const { st, fn } = mkStep();
  st.serial = L([P('n1', T0)]); st.applyOK = false;
  fn.step(JSON.stringify(L([P('n1', T1)])), []);
  eq(st.restored, 1, 'a refused apply reloads instead');
}
{ // unparseable history is refused rather than half-applied
  const { st, fn } = mkStep();
  st.serial = L([P('n1', T0)]);
  eq(fn.step('{not json', []), false, 'a corrupt snapshot returns false and changes nothing');
  eq(st.restored, 0); eq(st.fastRefresh, 0);
}

// ---------------------------------------------------------------- wiring
{
  assert(/function performUndo\(\)\{\n  if\(!editorUndo\.length\) return false;\n  return _historyStep\(editorUndo\.pop\(\), editorRedo\);/.test(src),
    'undo and redo are the same step in opposite directions — one implementation, so the fast path cannot reach only one of them');
  assert(/function performRedo\(\)\{\n  if\(!editorRedo\.length\) return false;\n  return _historyStep\(editorRedo\.pop\(\), editorUndo\);/.test(src));
  assert(/if\(typeof _levelDirty!=='undefined'\) _levelDirty=true;/.test(extractFunction('_edFastRefresh')),
    'the fast path still marks the level dirty, or autosave would miss an undo');
  assert(/updateGizmo/.test(extractFunction('_edFastRefresh')),
    '...and moves the gizmo, which is bolted to the selection that survived');
  assert(/169x/.test(src), 'the measurement is recorded beside the code, not only in the commit');
  assert(/108\.5 ms\s+->\s+24\.4 ms\s+\(4\.4x\)/.test(src),
    '...INCLUDING the end-to-end figure, which is smaller than the core speedup and is the one a creator feels');
  assert(/Those\n\/\/ are now the floor/.test(src),
    '...and what now dominates the gesture is named, so the next build knows where to look');
}

done('build 1291: undo stops reloading the level for a move — every Ctrl+Z ran restoreLevel, a full teardown and respawn of every prop with each imported model re-fetched, so nudging a crate cost as much as loading the level (measured live on the stock 56-prop scene: 74.33 ms, against 0.44 ms for the new path — 169x). The fast path is deliberately narrow and refuses everything that is not purely a set of prop transforms — by EXCLUSION, so a prop field added later refuses rather than being ignored — requires a nid on every entry, resolves every object before moving any of them, and falls back to the old reload on any throw');
