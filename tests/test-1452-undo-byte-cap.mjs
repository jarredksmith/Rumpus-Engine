// build 1452 — the undo history is bounded in BYTES, not just in steps.
//
// It was capped at 60 entries and by nothing else, so what it HOLDS scaled with the level. Measured live:
// a full history on a 659-prop level is 64,944 bytes a snapshot and 3.72 MB, with the undo and redo stacks
// both live at once — so the real ceiling is twice that, on the content least able to afford it. A
// creator's level is the one thing here with no upper bound (build 1424's report was a 30-million-triangle
// scene), and a count cap is a memory bound that grows with it.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();
const MAXB = +extractConst("UNDO_MAX_BYTES", src);
const MIND = +extractConst('UNDO_MIN_DEPTH', src);
eq(MAXB, 8 * 1048576, 'lifted the real byte budget from source');
eq(MIND, 8, '...and the depth floor');

/* ---- EXECUTED: the trim ----------------------------------------------------------------------------- */
const trim = (undo, redo) => {
  const u = undo.slice(), r = redo.slice();
  const n = new Function('editorUndo', 'editorRedo', `
    const UNDO_MAX_BYTES = ${MAXB}, UNDO_MIN_DEPTH = ${MIND};
    ${extractFunction('_undoBytes', src)}
    ${extractFunction('_undoTrim', src)}
    return _undoTrim();
  `)(u, r);
  return { undo: u, redo: r, bytes: n };
};
const S = (n) => 'x'.repeat(n);

{
  // under budget: nothing moves at all
  const r = trim([S(1000), S(1000)], [S(1000)]);
  eq(r.undo.length, 2, 'a small history is untouched');
  eq(r.redo.length, 1, '...both stacks');
  eq(r.bytes, 3000, '...and the byte count is the sum of both, because both are live at once');
}
{
  // the measured shape: 60 snapshots of a 659-prop level. 60 x 64,944 = 3.9 MB, well under 8 MB — so the
  // count cap still binds and NOTHING a creator has today changes. That is the compatibility claim.
  const real = Array.from({ length: 60 }, () => S(64944));
  const r = trim(real, []);
  eq(r.undo.length, 60, 'the measured 659-prop history is entirely under budget — this build changes nothing there');
  eq(r.bytes, 60 * 64944, '...and nothing was dropped');
}
{
  // a level big enough to bind: ~200 KB a snapshot
  const big = Array.from({ length: 60 }, (_, i) => S(200000));
  const r = trim(big, []);
  assert(r.bytes <= MAXB, 'a huge level is trimmed under the budget (' + r.bytes + ' <= ' + MAXB + ')');
  assert(r.undo.length < 60, '...by dropping entries, ' + r.undo.length + ' left');
  assert(r.undo.length >= MIND, '...but never below the floor');
}
{
  // THE FLOOR IS THE FAIL-USEFUL DIRECTION: one snapshot larger than the whole budget must still leave a
  // usable history. A one-deep undo is worse than the memory it saves.
  const huge = Array.from({ length: 20 }, () => S(MAXB));
  const r = trim(huge, []);
  eq(r.undo.length, MIND, 'however enormous a single snapshot is, the creator keeps ' + MIND + ' steps');
  assert(r.bytes > MAXB, '...even though that is over budget — which is the point of a floor');
}
{
  // it trims the OLDEST — the same end the count cap already drops from, so it can never discard the step
  // the creator is about to reach for
  const marked = Array.from({ length: 60 }, (_, i) => 'i' + i + S(200000));
  const r = trim(marked, []);
  assert(r.undo[r.undo.length - 1].startsWith('i59'), 'the most recent step survives');
  assert(!r.undo.some((x) => x.startsWith('i0')), '...and the oldest is what went');
  // and they are still in order
  const idx = r.undo.map((x) => +/^i(\d+)/.exec(x)[1]);
  assert(idx.every((v, i) => i === 0 || v > idx[i - 1]), '...with the remaining history still in order');
}
{
  // the redo stack is trimmed too, and SECOND: a redo entry is forward history the creator has already
  // undone past, so losing its far end costs less than losing how they got here
  const r = trim(Array.from({ length: 10 }, () => S(500000)),
                 Array.from({ length: 10 }, () => S(500000)));
  assert(r.bytes <= MAXB, 'both stacks together are brought under budget');
  assert(r.undo.length >= MIND, 'the undo floor still holds');
  // undo is trimmed to its floor before redo gives anything up
  const r2 = trim(Array.from({ length: 30 }, () => S(400000)), [S(400000)]);
  assert(r2.undo.length < 30, 'undo trimmed first');
  eq(r2.redo.length, 1, '...and redo was left alone, because trimming undo was enough');
}
{
  // empty stacks must not loop forever or throw
  const r = trim([], []);
  eq(r.bytes, 0, 'an empty history measures zero');
  eq(r.undo.length, 0, '...and trims to nothing');
  const only = trim([], Array.from({ length: 40 }, () => S(500000)));
  assert(only.bytes <= MAXB, 'a redo-only overflow is trimmed');
  eq(only.undo.length, 0, '...without inventing undo entries');
}

/* ---- both growth sites are covered ------------------------------------------------------------------ */
// The stacks grow in exactly two places — pushUndoSnapshot, and _historyStep moving a step across — and a
// cap applied at one of them is a cap that leaks at the other.
{
  const push = extractFunction('pushUndoSnapshot', src);
  assert(/if\(editorUndo\.length > 60\) editorUndo\.shift\(\);/.test(push), 'the count cap is unchanged');
  assert(/_undoTrim\(\);/.test(push), '...and the byte cap runs beside it');
  const step = extractFunction('_historyStep', src);
  assert(/if\(pushTo\.length > 60\) pushTo\.shift\(\); _undoTrim\(\);/.test(step),
    'and the other growth site — a step moving from one stack to the other — is capped too');
  eq((src.match(/_undoTrim\(\)/g) || []).length, 3, 'trimmed at exactly the two growth sites, plus its definition');
  eq((src.match(/\.length > 60\)/g) || []).length, 2, 'and there are exactly two growth sites to cover');
}

/* ---- what this deliberately does NOT change --------------------------------------------------------- */
// Measured live: ~1 ms per snapshot at 659 props, and 5 of 6 focus-time snapshots are discarded because the
// state did not change — the dedup check runs AFTER the serialize. That is 412 call sites' worth of
// redundancy, and it is left alone: 1 ms per discrete user gesture is imperceptible, and moving the
// snapshot from focus to first-mutation would break build 1163's one-per-gesture rule at 412 sites.
{
  const push = extractFunction('pushUndoSnapshot', src);
  assert(push.indexOf('serializeLevel') < push.indexOf('=== snap'),
    'the dedup still runs after the serialize — measured at ~1 ms a gesture, and left alone deliberately');
  assert(/if\(editorUndoActive \|\| !editorOpen\) return;/.test(push),
    'and the two cheap early-outs that keep it out of play are untouched');
}

done('build 1452: the undo history is bounded in bytes as well as steps — 8 MB across both stacks with an ' +
     'eight-step floor, trimmed from the oldest end, so a 659-prop level is untouched while a level several ' +
     'times larger stops holding tens of megabytes of JSON it will never restore');
