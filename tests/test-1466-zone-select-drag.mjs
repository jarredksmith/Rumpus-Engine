// build 1466 — a clicked zone gets a gizmo and a panel, not just a selection.
//
// Reported from play, AFTER build 1464 claimed this closed: "Still no way to select, drag, or delete a
// water zone, a waterfall, or an effect zone by clicking on it. You still have to navigate to the world
// menu and scroll to the bottom."
//
// THE ZONE TYPE WAS WRITTEN OUT BY HAND IN FIVE PLACES, and I fixed two of them and shipped:
//
//   1. the RESOLVER      — what a clicked object belongs to        (build 1326)
//   2. the RAYCAST LIST  — what can be hit at all                  (build 1464)
//   3. the POST-PICK chain — what to DO with the pick              (here)
//   4. `movable`         — whether the selection grows handles     (here)
//   5. `getSelPos`       — where those handles go                  (here)
//
// Lists 3, 4 and 5 each named SIX of the eight, and the two missing were water zones and effect zones —
// exactly what the report says. 1464's probe asked `editorActive === type`, which the generic tail at the
// end of the pick chain satisfies, so it read HIT for all eight and I believed it. The selection was real
// the whole time; what it never got was a gizmo to drag and a panel to edit.
//
// The measurand was the fault. A creator does not care whether a variable holds an index.

import { gameSource, extractConst, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const ZE_SRC = extractConst('ZONE_EDIT', src);
const TYPES = [...ZE_SRC.matchAll(/^\s{2}(\w+):\s*\{/gm)].map(m => m[1]);
eq(TYPES.length, 8, 'eight zone types');

// ---------------------------------------------------------------- 1. no list may name a zone type again
// The rule this build exists to enforce: every consumer asks the table. A regex for a zone type name
// inside these three places is the fifth list coming back.
{
  const pickTail = src.slice(
    src.indexOf("if(picked && picked!=='pickups') selPickup = -1;"),
    src.indexOf("function updateEditorOut()"));
  assert(pickTail.length > 500 && pickTail.length < 6000, 'the post-pick chain was found');

  assert(/else if\(picked && ZONE_EDIT\[picked\]\)\{/.test(pickTail),
    'THE FIX: one zone branch, off the same table');
  for(const t of TYPES)
    assert(!new RegExp("picked==='" + t + "'").test(pickTail),
      'no zone type is named by hand in the post-pick chain any more: ' + t);

  // ...and the branch does the three things the fall-through never did
  const zb = pickTail.slice(pickTail.indexOf("else if(picked && ZONE_EDIT[picked])"));
  assert(/revealZoneTool\(picked\)/.test(zb), 'it OPENS the panel section — the fall-through did not');
  assert(/updateGizmo\(\)/.test(zb), 'it builds the GIZMO — the fall-through did not, which is the "cannot drag" half');
  assert(/updateSelectionHighlight\(\)/.test(zb), '...and highlights the selection');
  assert(/_zd\.refresh\(\)/.test(zb), '...and repaints the markers so the selected one reads as selected');
  assert(/gizmoMode='translate'/.test(zb), '...in translate mode, which is the only one a zone has');
}

{
  const giz = extractFunction('updateGizmo', src);
  assert(/const _zsel = ZONE_EDIT\[editorActive\] \? \(ZONE_EDIT\[editorActive\]\.sel\(\) >= 0\) : false;/.test(giz),
    'the movable test asks the table');
  assert(/_zsel \|\|/.test(giz), '...and that is what puts a zone in it');
  for(const t of TYPES)
    assert(!new RegExp("editorActive==='" + t + "'").test(giz),
      'updateGizmo names no zone type by hand: ' + t);
  assert(/if\(ZONE_EDIT\[editorActive\]\) mode='translate';/.test(giz),
    'every zone is translate-only, from the table rather than from a list of five');
}

{
  const gsp = extractFunction('getSelPos', src);
  assert(/const _zd = ZONE_EDIT\[editorActive\];/.test(gsp), 'the handle position asks the table');
  assert(/_zd\.markers\(\) \|\| \[\]\)\[_i\]/.test(gsp), '...and a zone handle sits on that zone\'s marker');
  assert(/_i >= 0 && _m/.test(gsp), '...with nothing selected resolving to null rather than index -1');
  for(const t of TYPES)
    assert(!new RegExp("editorActive==='" + t + "'").test(gsp),
      'getSelPos names no zone type by hand: ' + t);
}

// ---------------------------------------------------------------- 2. executed: all three, per type
{
  const run = new Function('TYPES', 'ACTIVE', 'SEL', `
    const ZONE_EDIT = {};
    const MARK = {};
    for(const t of TYPES){
      MARK[t] = [{ position:{ x:1, y:0, z:2 } }, { position:{ x:9, y:0, z:8 } }];
      ZONE_EDIT[t] = { markers: () => MARK[t], sel: () => (t === ACTIVE ? SEL : -1) };
    }
    const editorActive = ACTIVE;
    const _zsel = ZONE_EDIT[editorActive] ? (ZONE_EDIT[editorActive].sel() >= 0) : false;
    let pos = null;
    { const _zd = ZONE_EDIT[editorActive];
      if(_zd){ const _i = _zd.sel(), _m = (_zd.markers() || [])[_i];
        pos = (_i >= 0 && _m) ? _m.position : null; } }
    let mode = 'scale';
    if(ZONE_EDIT[editorActive]) mode = 'translate';
    return { movable: _zsel, pos, mode };`);

  for(const t of TYPES){
    const r = run(TYPES, t, 1);
    assert(r.movable, t + ': a selected zone is movable');
    eq(JSON.stringify(r.pos), '{"x":9,"y":0,"z":8}', t + ': ...and the handle sits on ITS marker, at the selected index');
    eq(r.mode, 'translate', t + ': ...in translate mode');
  }
  const none = run(TYPES, TYPES[0], -1);
  eq(none.movable, false, 'nothing selected: not movable');
  eq(none.pos, null, '...and no handle position, so the gizmo hides itself rather than sitting at the origin');
  const notAZone = run(TYPES, 'props', 0);
  eq(notAZone.movable, false, 'a non-zone target is untouched by any of this');
  eq(notAZone.mode, 'scale', '...and keeps whatever mode it had');
}

// ---------------------------------------------------------------- 3. the other two lists stay derived
// Builds 1326 and 1464 are what these three complete; if either regresses, the click never arrives.
{
  assert(/for\(const type in ZONE_EDIT\)/.test(src), 'the raycast list is still derived (build 1464)');
  assert(/for\(const type in ZONE_EDIT\)/.test(extractFunction('_zoneHitAt', src)),
    'the resolver is still derived (build 1326)');
  assert(/const def = ZONE_EDIT\[type\]/.test(extractFunction('_zoneMove', src)),
    'and so is the drag write-back, which is why DRAG was the one verb that never broke');
}

done('build 1466 (reported from play, after 1464 claimed it closed): a clicked zone gets a GIZMO and a PANEL, not just a selection. "Still no way to select, drag, or delete a water zone, a waterfall, or an effect zone by clicking on it." The zone type was written out by hand in FIVE places — the resolver (fixed in 1326), the raycast list (fixed in 1464), the post-pick chain, `movable`, and `getSelPos` — and the last three each named SIX of the eight, missing exactly water zones and effect zones. The pick chain has a generic tail that sets `editorActive` and re-renders, so those two WERE being selected; what the tail never does is call `revealZoneTool` (the panel section never opens) or `updateGizmo` (there are no drag handles). A selection you cannot see and cannot drag is not a selection. All three lists now ask ZONE_EDIT, so there is no sixth list to fall out of, and the five hand-written zone branches in the pick chain collapse to one. THE MEASURAND WAS THE REAL FAULT: 1464\'s probe asserted `editorActive === type`, which the generic tail satisfies, so it read HIT for all eight and I shipped believing it — a creator does not care whether a variable holds an index. It now measures the gizmo and the revealed panel, and drags and deletes each zone through the real paths: 8/8 on select, gizmo, panel, drag and delete, with a prop as the control. And DRAG read false for all eight on its first run — a failed control, which was my calling a function that does not exist (`_zoneMoveTo`; the real one is `_zoneMove(type, v)`) rather than anything in the engine');
