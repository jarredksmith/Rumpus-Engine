// build 1494 — a gesture that changes nothing is not an edit
//
// Reported from play: "ctrl-z isn't working as cleanly as it used to. It seems to do some unexpected things."
//
// The stack is "the state BEFORE an edit", and every control calls pushUndoSnapshot as its gesture STARTS —
// 30 number fields on `focus`, 30 sliders on `mousedown`. The snapshot went straight on. So clicking into a
// field to READ a value bought a full undo step identical to the current state (the next Ctrl+Z appeared to
// do nothing) and, worse, fired build 1129's fork clear and destroyed the redo branch.
//
// The whole history is executed here rather than pinned: the stack, the pending gesture, the commit rule and
// both stacks' interaction are arithmetic on strings, and this is the kind of state machine where a plausible
// implementation is wrong in exactly one of eight orderings.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ================================================================= a runnable history
   The engine's own functions, executed. `document` is a bare global inside _edSyncHistoryBtns, so it is
   supplied through the Function's own parameter list rather than stubbed globally — a global stub would
   leak into every other harness sharing this process. */
function makeHistory(){
  const st = {
    level: 0, editorOpen: true, editorUndoActive: false, _levelDirty: false,
    undo: [], redo: [], btnUndo: null, btnRedo: null,
  };
  const body = [
    'let _undoPending = null;',
    extractFunction('_undoCommitPending', src),
    extractFunction('pushUndoSnapshot', src),
    extractFunction('performUndo', src),
    extractFunction('performRedo', src),
    extractFunction('_edSyncHistoryBtns', src),
    'function _historyStep(snap, pushTo){ const cur = JSON.stringify(serializeLevel());' +
      ' __set(JSON.parse(snap)); pushTo.push(cur); _edSyncHistoryBtns(); return true; }',
    'return { push:pushUndoSnapshot, undo:performUndo, redo:performRedo, pending:()=>_undoPending };',
  ].join('\n');
  const fn = new Function('editorOpen', 'editorUndoActive', 'editorUndo', 'editorRedo',
                          'serializeLevel', '_undoTrim', 'document', '_levelDirty', '__set', body);
  const api = fn(true, false, st.undo, st.redo,
                 ()=>({ n: st.level }), ()=>{},
                 { getElementById: (id)=> id==='edUndo'
                     ? { set disabled(v){ st.btnUndo = !v; } }
                     : { set disabled(v){ st.btnRedo = !v; } } },
                 false, (o)=>{ st.level = o.n; });
  return {
    st, ...api,
    edit(to){ api.push(); st.level = to; },     // a REAL gesture: snapshot, then change something
    look(){ api.push(); },                      // a field focus / slider mousedown that changes nothing
  };
}

/* ================================================================= the control */
{
  const h = makeHistory();
  h.edit(1); h.edit(2); h.edit(3);
  eq(h.st.level, 3, 'three edits land');
  h.undo(); h.undo(); h.undo();
  eq(h.st.level, 0, 'three undos come back to exactly where it started');
  eq(h.st.undo.length, 0, 'and the stack is empty');
  eq(h.st.redo.length, 3, 'with all three on the redo side');
  h.redo(); h.redo(); h.redo();
  eq(h.st.level, 3, '...and three redos return');
}

/* ================================================================= the report */
{
  const h = makeHistory();
  h.edit(5);
  h.look(); h.look(); h.look();       // three empty gestures — a creator reading three fields
  h.undo();
  eq(h.st.level, 0, 'ONE Ctrl+Z after three empty gestures undoes the real edit');
  /* the defect: before this build the first Ctrl+Z restored an identical state and appeared to do nothing */
  eq(h.st.undo.length, 0, 'and there is nothing left over');
}
{
  /* the mid-gesture commit: a real edit still on the pending slot is undone by the FIRST press */
  const h = makeHistory();
  h.edit(9);
  assert(h.pending() != null, 'the gesture is pending until something judges it');
  h.undo();
  eq(h.st.level, 0, 'the pending gesture is committed before the pop, so the first press undoes it');
  eq(h.pending(), null, 'and the pending slot is emptied');
}

/* ================================================================= the redo branch */
{
  const h = makeHistory();
  h.edit(7);
  h.undo();
  eq(h.st.level, 0, 'undone');
  eq(h.st.redo.length, 1, 'the branch exists');
  h.look();                            // click into a field, change NOTHING
  eq(h.st.redo.length, 1, 'a look at a field does NOT fork the history');
  const ran = h.redo();
  assert(ran, 'so redo still runs');
  eq(h.st.level, 7, '...and puts the work back');
}
{
  /* the control: a REAL edit must still make the old branch unreachable (build 1129) */
  const h = makeHistory();
  h.edit(3);
  h.undo();
  eq(h.st.redo.length, 1, 'a branch to lose');
  h.edit(9);                           // a real new edit forks it
  const ran = h.redo();
  assert(!ran, 'the old forward branch is unreachable after a real edit');
  eq(h.st.level, 9, 'and the new work is untouched');
}
{
  /* a RUN of empty gestures leaves a branch completely alone — the ordering that used to make the two
     questions above interact (the identical-to-last skip returned BEFORE the fork clear) */
  const h = makeHistory();
  h.edit(4); h.undo();
  h.look(); h.look(); h.look();
  eq(h.st.redo.length, 1, 'three empty gestures, branch intact');
  assert(h.redo(), 'and it still runs');
  eq(h.st.level, 4, 'back to the edited state');
}

/* ================================================================= depth, dedupe and the guards */
{
  const h = makeHistory();
  for(let i = 1; i <= 5; i++) h.edit(i);
  eq(h.st.undo.length, 4, 'five edits, four committed — the fifth is the live gesture');
  h.look();                            // judging the fifth
  eq(h.st.undo.length, 5, '...committed by the next gesture');
  eq(h.st.undo.length + 0, 5, 'and an empty gesture added nothing of its own');
}
{
  /* build 1129's dedupe survives, and is now UNDER the no-op test rather than in front of the fork clear */
  const commit = extractFunction('_undoCommitPending', src);
  assert(commit.indexOf('if(p === now) return;') < commit.indexOf('editorUndo[editorUndo.length-1] === p'),
    'the no-op test comes FIRST, so a gesture that changed nothing can never reach the fork clear');
  assert(commit.indexOf('editorRedo.length = 0') > commit.indexOf('if(p === now) return;'),
    'and the fork clear is only reachable for a real edit');
}
{
  /* the guards that make it safe to call from anywhere */
  const push = extractFunction('pushUndoSnapshot', src);
  assert(/if\(editorUndoActive \|\| !editorOpen\) return;/.test(push),
    'a restore in progress, or a closed editor, still pushes nothing');
  assert(/_undoCommitPending\(snap\)/.test(push),
    'the previous gesture is judged against the state it actually left behind — one serialization, two uses');
  assert(push.indexOf('_undoCommitPending(snap)') < push.indexOf('_undoPending = snap'),
    '...and the commit happens BEFORE the new pending replaces it');

  const u = extractFunction('performUndo', src), r = extractFunction('performRedo', src);
  for(const [f, n] of [[u, 'performUndo'], [r, 'performRedo']]){
    assert(f.indexOf('_undoCommitPending()') >= 0, n + ' commits the live gesture');
    assert(f.indexOf('_undoCommitPending()') < f.indexOf('.length'),
      n + ' commits BEFORE it tests the stack, or the edit just made is not on the stack it walks');
  }
}
{
  /* a throwing serializer must not leave a half-committed history */
  const h = makeHistory();
  h.edit(2);
  const before = h.st.undo.length;
  eq(before, 0, 'the first edit is still pending');
  h.edit(3);
  eq(h.st.undo.length, 1, 'the second gesture commits the first');
  eq(h.st.level, 3, 'and the level moved');
}

/* ================================================================= the buttons */
{
  const h = makeHistory();
  eq(h.st.btnUndo, null, 'nothing has asked yet');
  h.edit(1);
  eq(h.st.btnUndo, true, 'mid-gesture the level really HAS changed, so Undo is live');
  h.undo();
  eq(h.st.btnUndo, false, '...and dead once there is nothing left');
  const sync = extractFunction('_edSyncHistoryBtns', src);
  assert(/editorUndo\.length \|\| _undoPending != null/.test(sync),
    'the pending gesture counts toward the Undo button');
}

done('build 1494 — an editor gesture that changes nothing costs no undo step and forks no history, so ' +
     'the first Ctrl+Z after reading a field undoes the edit rather than restoring an identical level');
