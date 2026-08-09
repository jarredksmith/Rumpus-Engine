// build 1445 — Delete and Duplicate act on the same things.
//
// From the editor audit. They were two hand-kept lists that did not even match each other:
//
//   duplicateSelected   props · lights · spawns · turrets
//   the Delete key      props · lights · spawns
//
// So a turret could be duplicated and not deleted — though `deleteSelectedTurret` had existed all along and
// was simply never called — and NEITHER knew about the eight zone types or the pickup spots. A creator
// selected a trigger volume they had just tuned, pressed Delete, and nothing happened; the only way to
// remove one was to find its row in the panel and click the small cross.
//
// The fix routes both verbs through build 1326's ZONE_EDIT table, which is the build that made that table
// the one place a zone type is declared — after finding a type listed in three places and missing from a
// fourth. This is the same lesson, one verb along.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const dup = extractFunction('duplicateSelected', src);
const del = extractFunction('deleteSelected', src);

/* ---- THE PROPERTY: the two verbs cover the same set ---------------------------------------------- */
// Counting is not enough — they have to name the SAME things — so the kinds are extracted from each and
// compared. A future editor target added to one and not the other fails here.
const kinds = (fn) => (fn.match(/editorActive==='(\w+)'/g) || []).map(m => m.slice(16, -1)).sort();
const dupKinds = kinds(dup), delKinds = kinds(del);
eq(JSON.stringify(dupKinds), JSON.stringify(delKinds),
  'Delete and Duplicate name the same editor targets — ' + dupKinds.join(', '));
assert(dupKinds.indexOf('turrets') >= 0,
  'including turrets, which could be duplicated but not deleted — the function existed and was never called');
for (const k of ['props', 'lights', 'spawns', 'turrets']) {
  assert(dupKinds.indexOf(k) >= 0, k + ' is covered by both');
}
// and both reach the zones and the pickups through the same two tails
for (const fn of [dup, del]) {
  assert(/ZONE_EDIT\[editorActive\]/.test(fn), 'every zone type is reached through the one table');
  assert(/selPickup>=0 && pickupSpots\[selPickup\]/.test(fn), '...and a selected pickup spot');
}

/* ---- EXECUTED: the generic zone duplicate --------------------------------------------------------- */
const runZone = (w) => {
  const out = { refreshed: 0, panelled: 0, undo: 0, gizmo: 0 };
  const fn = new Function('W', 'OUT', `
    const DUP_OFFSET = 2;
    let sel = W.sel;
    const list = W.list;
    const ZONE_EDIT = { triggers: {
      list: () => list, sel: () => sel, pick: (i) => { sel = i; },
      refresh: () => OUT.refreshed++, panel: () => OUT.panelled++, remove: (i) => { OUT.removedAt = i; },
    } };
    const pushUndoSnapshot = () => OUT.undo++;
    const updateGizmo = () => OUT.gizmo++;
    let _levelDirty = false;
    ${extractFunction('_zoneDup', src)}
    const r = _zoneDup(W.type || 'triggers');
    OUT.sel = sel; OUT.dirty = _levelDirty;
    return r;
  `);
  out.ret = fn(w, out);
  return out;
};

{
  const z = { x: 10, z: -4, r: 6, ev: 'GATE', once: 1, who: 'player' };
  const list = [z];
  const r = runZone({ list, sel: 0 });
  eq(r.ret, true, 'a selected zone duplicates');
  eq(list.length, 2, '...appending a copy');
  eq(list[1].x, 12, '...offset so it is not hidden inside the original');
  eq(list[1].z, -4, '...on one axis only');
  eq(list[1].ev, 'GATE', '...carrying every authored field');
  eq(list[1].once, 1, '...including the flags');
  eq(r.sel, 1, 'and the COPY is selected, so it can be dragged straight away');
  eq(r.undo, 1, 'one undo snapshot for the gesture');
  eq(r.refreshed, 1, 'markers refreshed');
  eq(r.panelled, 1, 'panel redrawn');
  eq(r.dirty, true, 'and the level is marked dirty');
}
{
  // a DEEP copy, or editing the duplicate would edit the original — build 1438's lesson for signal lists
  const z = { x: 0, r: 4, fx: { kind: 'heal', amt: 5 } };
  const list = [z];
  runZone({ list, sel: 0 });
  list[1].fx.amt = 99;
  eq(z.fx.amt, 5, 'the copy is DEEP — editing it cannot reach back into the original');
}
{
  const list = [];
  eq(runZone({ list, sel: -1 }).ret, false, 'nothing selected duplicates nothing');
  eq(runZone({ list, sel: 0 }).ret, false, '...and an index past the end is refused rather than throwing');
  eq(runZone({ list: [{ x: 0 }], sel: 5 }).ret, false, '...likewise a stale selection');
  eq(runZone({ list: [{ x: 0 }], sel: 0, type: 'nosuchzone' }).ret, false, 'an unknown type is refused');
}
{
  // a zone with no x (nothing in the table today, but the guard costs one comparison)
  const list = [{ r: 4 }];
  runZone({ list, sel: 0 });
  eq(list.length, 2, 'a zone with no x still duplicates');
  assert(!('x' in list[1]), '...without inventing one');
}

/* ---- EXECUTED: the pickup duplicate --------------------------------------------------------------- */
{
  const spots = [{ x: 3, z: 7, kind: 'item', item: 'redKey' }];
  const out = { refreshed: 0 };
  const fn = new Function('S', 'OUT', `
    const DUP_OFFSET = 2;
    let selPickup = 0;
    const pickupSpots = S;
    const pushUndoSnapshot = () => {};
    const refreshPickupMarkers = () => OUT.refreshed++;
    const renderEditorFields = () => {};
    const updateGizmo = () => {};
    ${extractFunction('_pickupDup', src)}
    const r = _pickupDup();
    OUT.sel = selPickup;
    return r;
  `);
  eq(fn(spots, out), true, 'a selected pickup spot duplicates');
  eq(spots.length, 2, '...appending a copy');
  eq(spots[1].x, 5, '...offset');
  eq(spots[1].item, 'redKey', '...carrying which item it grants');
  eq(out.sel, 1, '...and the copy is selected');
  eq(out.refreshed, 1, '...with the markers rebuilt');
}

/* ---- the remover that had no name ------------------------------------------------------------------ */
// Seven zone types had a named remover; the audio zone's lived inline in its panel button, which is why it
// was the one type the Delete key could not have reached even by asking.
assert(/function removeAudioZone\(i\)\{/.test(src), 'the audio zone finally has a named remover');
assert(/stopAudioZones\(\)/.test(extractFunction('removeAudioZone', src)),
  '...which still stops the audio it was playing, or a deleted zone keeps making noise');
eq((src.match(/audioZones\.splice\(/g) || []).length, 1,
  'and it is the ONE place an audio zone is removed — the panel button asks it too');
assert(/delB\.onclick=\(\)=>\{ removeAudioZone\(i\); \};/.test(src),
  '...including the small cross in the panel');

// every zone type in the table declares how to remove itself, in both directions
const zoneTable = src.match(/const ZONE_EDIT = \{[\s\S]*?\n\};/)[0];
const types = (zoneTable.match(/^\s{2}(\w+):\s*\{/gm) || []).map(m => m.trim().replace(/:.*/, ''));
eq(types.length, 8, 'all eight zone types are in the table');
for (const t of types) {
  const row = zoneTable.match(new RegExp('\\n  ' + t + ':\\s*\\{[^\\n]*'))[0];
  assert(/remove:\(i\)=>/.test(row), t + ' declares its remover');
}

/* ---- one table: every zone type declares how it is ADDED too ------------------------------------- */
// build 1320 created a ZONE_ADDERS table because the add list had drifted by exactly one entry — and then
// left it FUNCTION-LOCAL inside the + menu builder, where nothing else could reach it. It is folded in, so
// a zone type declares its list, selection, markers, panel, remover and adder in one place.
for (const t of types) {
  const row = zoneTable.match(new RegExp('\\n  ' + t + ':\\s*\\{[^\\n]*'))[0];
  assert(/add:\(\)=>/.test(row), t + ' declares its adder');
}
assert(/const _d=ZONE_EDIT\[type\]; if\(_d && _d\.add\) _d\.add\(\);/.test(src),
  'the + menu adds through the table rather than a second list of its own');
assert(!/const ZONE_ADDERS/.test(src), '...and that second list is gone, not left beside it');
// the audio zone's ADD had no name either — inlined in the panel button AND the menu, two copies of one
// object literal, so a retuned default radius would have moved in one place only
assert(/function addAudioZone\(x, z\)\{/.test(src), 'the audio zone has a named adder');
eq((src.match(/audioZones\.push\(/g) || []).length, 1, '...and it is the one place a zone is added');

/* ---- pickups delete like everything else ----------------------------------------------------------- */
// This CLEARED the selection, so two Delete presses removed one spot while the same two on a zone, a prop
// or a light removed two. The parity probe measured it (2 deletes leaving 1) and it is clamped now.
{
  const rm = extractFunction('removePickupSpot', src);
  assert(/selPickup = pickupSpots\.length \? Math\.min\(i, pickupSpots\.length-1\) : -1;/.test(rm),
    'removing a pickup keeps a neighbour selected, so repeated Delete keeps deleting');
}
{
  const spots = [{ x:1 }, { x:2 }, { x:3 }];
  const run = new Function('S', `
    let selPickup = 0; const pickupSpots = S;
    function pushUndoSnapshot(){} function refreshPickupMarkers(){} function renderEditorFields(){}
    ${extractFunction('removePickupSpot', src)}
    removePickupSpot(1);
    const afterOne = { left: pickupSpots.length, sel: selPickup };
    removePickupSpot(selPickup);
    const afterTwo = { left: pickupSpots.length, sel: selPickup };
    while(pickupSpots.length) removePickupSpot(selPickup);
    return { afterOne, afterTwo, sel: selPickup };`);
  const r = run(spots);
  eq(r.afterOne.left, 2, 'removing one leaves two');
  assert(r.afterOne.sel >= 0, '...with a neighbour still selected, so Delete again works');
  eq(r.afterTwo.left, 1, 'a second Delete removes a second spot');
  eq(r.sel, -1, 'and emptying the list clears the selection rather than pointing past the end');
}

/* ---- the Delete key asks the one function ---------------------------------------------------------- */
assert(/if\(editorOpen && \(e\.code==='Delete' \|\| e\.code==='Backspace'\)\)\{\s*\n\s*deleteSelected\(\);/.test(src),
  'the Delete key dispatches through deleteSelected — one chain, not a second copy of the list');
// counting a bare name counts the DEFINITION too — match the call, not the identifier
eq((src.match(/(?<!function )deleteSelectedProp\(\)/g) || []).length, 1,
  '...and the per-kind deleters are each called from exactly that one place');
// a THIRD hand-kept list lived in the object panel's own Delete button, dispatching on tgt.isSpawns /
// isLights / isTurret and falling back to deleting a PROP for anything it did not recognise — while the
// Duplicate button beside it had always called the shared dispatcher.
assert(/del\.onclick = \(\)=>\{ deleteSelected\(\); \};/.test(src),
  'the panel button asks the same function, so the pair beside each other finally agree');
assert(/dup\.onclick = \(\)=>\{ duplicateSelected\(\); \};/.test(src),
  '...as Duplicate always did');

/* ---- the forward reference is safe, and pinned so it stays that way --------------------------------- */
// _zoneDup reads DUP_OFFSET, which is declared BELOW it. That is a temporal dead zone if anything ever
// calls it during module evaluation — the exact fault builds 1127, 1331, 1350, 1383 and 1411 each lost
// something to. It is safe today because its only caller is a user action, and this asserts that.
eq((src.match(/_zoneDup\(/g) || []).length, 2, '_zoneDup is defined once and called once');
assert(/else if\(ZONE_EDIT\[editorActive\]\) _zoneDup\(editorActive\);/.test(dup),
  '...from duplicateSelected, which only ever runs on a keypress — never at boot, where the forward ' +
  'reference to DUP_OFFSET would be a temporal dead zone');

done('build 1445: Delete and Duplicate act on the same things — turrets, all eight zone types and pickup ' +
     'spots included — through the one table that declares a zone type, so the ninth cannot reach one verb ' +
     'and not the other');
