// build 1225: align / distribute / array over the multi-selection — the arrangement verbs every other
// editor's second toolbar carries, absent here entirely (the panel critic's finding). Two semantics are
// the load-bearing part and both are EXECUTED below: group members move as ONE UNIT (a click selects the
// whole group, so per-prop align would smash a group's arrangement flat), and alignment lines up
// world-space BOUNDING EDGES, not origins (two crates of different sizes "aligned min" share a face
// plane — what a builder means). Array rides the 1162 _pfEntryOf/_pfSpawnEntry pair, so copies carry
// full config and each copy is its own group.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const CORE = ['_selBoxOf', '_arrUnits', '_unitSpan', '_arrTouch', '_arrDone', 'alignSelectedProps', 'distributeSelectedProps', 'arraySelectedProps']
  .map(n => extractFunction(n)).join('\n');   // (.map(extractFunction) would pass the array index as the src param)

// a prop stub: world box + position; moving the position does not move the stub box, which is fine —
// every unit is measured before it is moved and moved exactly once.
const P = (x0, x1, gid) => ({ position: { x: 0, y: 0, z: 0 }, userData: { box: { min: { x: x0, y: 0, z: 0 }, max: { x: x1, y: 1, z: 1 } }, ...(gid ? { groupId: gid } : {}) } });

const drive = (props, run) => {
  const body =
    'const snaps = { n: 0 }; const pushUndoSnapshot = () => snaps.n++;\n' +
    'const refreshPropCollider = () => {};\n' +
    'const selProps = props;\n' +
    'const spawned = [];\n' +
    'const _pfPivotOf = (list) => ({ x: 100, y: 0, z: 0 });\n' +
    'const _pfEntryOf = (o, pv) => ({ src: "box", t: [0,0,0,0,0,0,1,1,1] });\n' +
    'let _gidSeq = 0; const _newGroupId = () => "g" + (++_gidSeq);\n' +
    'const _pfSpawnEntry = (p, at, mark, gid, cb) => spawned.push({ at, gid });\n' +
    CORE + '\n' + run;
  return new Function('props', body)(props);
};

// ---------------------------------------------------------------- align, executed
{
  const r = drive([P(0, 2), P(5, 6), P(9, 12)],
    'const n = alignSelectedProps("x", "min"); return { n, xs: props.map(p => p.position.x), snaps: snaps.n };');
  eq(r.n, 3, 'align min: three units aligned');
  eq(r.xs[0], 0, 'the unit already on the selection minimum does not move');
  eq(r.xs[1], -5, 'box [5,6] slides its LOW EDGE to 0 — edges align, not origins');
  eq(r.xs[2], -9, 'box [9,12] the same');
  eq(r.snaps, 1, 'exactly ONE undo snapshot for the whole gesture (1163 rule)');
}
{
  const r = drive([P(0, 2), P(9, 12)],
    'alignSelectedProps("x", "max"); return props.map(p => p.position.x);');
  eq(r[0], 10, 'align max: box [0,2] slides its HIGH edge to the selection max 12');
  eq(r[1], 0, '...and the box defining that max holds still');
}
{
  const r = drive([P(0, 2), P(9, 12)],
    'alignSelectedProps("x", "center"); return props.map(p => p.position.x);');
  near(r[0], 5, 1e-9, 'align center: box centre 1 -> the selection centre 6');
  near(r[1], -4.5, 1e-9, 'box centre 10.5 -> 6');
}
{ // GROUPS MOVE AS ONE UNIT — the internal arrangement survives
  const r = drive([P(0, 1, 'gA'), P(3, 4, 'gA'), P(10, 11)],
    'const n = alignSelectedProps("x", "min"); return { n, xs: props.map(p => p.position.x) };');
  eq(r.n, 2, 'two units: the group and the lone prop');
  eq(r.xs[0], 0, 'the group (unit span [0,4]) is already on the minimum — neither member moves');
  eq(r.xs[1], 0, '...including the member at [3,4], which a per-prop align would have SMASHED to 0');
  eq(r.xs[2], -10, 'the lone prop lines up with the group\'s edge');
}
{ // thresholds refuse without touching undo
  const r = drive([P(0, 1)], 'const n = alignSelectedProps("x", "min"); return { n, snaps: snaps.n };');
  eq(r.n, 0, 'one unit: nothing to align'); eq(r.snaps, 0, '...and no undo snapshot is burned');
  const r2 = drive([P(0, 1), P(5, 6)], 'const n = distributeSelectedProps("x"); return { n, snaps: snaps.n };');
  eq(r2.n, 0, 'two units: nothing to distribute'); eq(r2.snaps, 0, '...same');
}

// ---------------------------------------------------------------- distribute, executed
{
  const r = drive([P(-0.5, 0.5), P(0.5, 1.5), P(1.5, 2.5), P(8.5, 9.5)],   // centres 0, 1, 2, 9
    'const n = distributeSelectedProps("x"); return { n, xs: props.map(p => p.position.x), snaps: snaps.n };');
  eq(r.n, 4, 'four units distributed');
  eq(r.xs[0], 0, 'the outermost LOW unit holds still');
  eq(r.xs[3], 0, 'the outermost HIGH unit holds still');
  near(r.xs[1], 2, 1e-9, 'centre 1 slides to 3 (even spacing 0,3,6,9)');
  near(r.xs[2], 4, 1e-9, 'centre 2 slides to 6');
  eq(r.snaps, 1, 'one undo snapshot');
}

// ---------------------------------------------------------------- array, executed
{
  const r = drive([P(0, 1), P(2, 3)],
    'const n = arraySelectedProps(3, 2, 0, 0); return { n, spawned, snaps: snaps.n };');
  eq(r.n, 3, 'three copies made');
  eq(r.spawned.length, 6, '...each copy spawns every selected prop (2 x 3)');
  near(r.spawned[0].at.x, 102, 1e-9, 'copy 1 lands one step from the pivot');
  near(r.spawned[4].at.x, 106, 1e-9, 'copy 3 lands three steps out');
  assert(r.spawned[0].gid && r.spawned[1].gid === r.spawned[0].gid, 'a multi-prop copy is grouped so it moves as one');
  assert(r.spawned[2].gid !== r.spawned[0].gid, '...and each copy is its OWN group, never chained to the source');
  eq(r.snaps, 1, 'one undo snapshot — one Ctrl+Z removes the whole array');
}
{ // refusals and caps
  const r = drive([P(0, 1)], 'const n = arraySelectedProps(5, 0, 0, 0); return { n, snaps: snaps.n };');
  eq(r.n, 0, 'a zero step refuses (copies would z-fight inside each other)');
  eq(r.snaps, 0, '...before burning the undo snapshot');
  const big = Array.from({ length: 60 }, (_, i) => P(i, i + 1));
  const r2 = drive(big, 'const n = arraySelectedProps(24, 2, 0, 0); return { n, spawned };');
  eq(r2.n, 1, '60 props selected: the ~100-prop gesture budget caps 24 requested copies to 1');
  eq(r2.spawned.length, 60, '...spawning exactly one copy of the selection');
}

// ---------------------------------------------------------------- wiring pins
{
  assert(/id = 'edArrAxis'/.test(src), 'the Arrange row carries the axis selector');
  assert(/'Spread', 'Space the selection evenly along the axis/.test(src), '...and the distribute button');
  assert(/num\('edArrN', 3, 34/.test(src) && /num\('edArrDx', _spanX/.test(src),
    'the array row: count + steps, dx prefilled with the selection\'s own width so copies land side by side');
  assert(/Math\.min\(24, count \| 0\)/.test(src), 'copy count hard-capped at 24');
  assert(/entries = list\.map\(o => _pfEntryOf\(o, pivot\)\)/.test(src),
    'array copies through the 1162 full-config pair — signals, tags, materials all ride');
  assert(/let _arrAxisSel = 'x';/.test(src), 'the axis choice survives panel re-renders');
}

done('build 1225: align / distribute / array executed against the real functions — edges align (not origins), groups move as single units with their internal arrangement intact, the outermost props anchor a distribute, arrays step from the pivot with each copy its own group, zero-step and sub-threshold gestures refuse before burning an undo snapshot, and the 24-copy / ~100-prop caps hold');
