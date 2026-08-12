// Undo, reported from play: "ctrl-z isn't working as cleanly as it used to. It seems to do some unexpected
// things."
//
// The stack is "the state BEFORE an edit": pushUndoSnapshot() serializes the level and pushes it, and every
// control calls it as the gesture STARTS — a slider's mousedown, a number field's focus. So the questions
// this probe asks are the two that design can get wrong: does a gesture that changes NOTHING still consume
// an undo step, and does it destroy the redo branch?
//
// Every row carries its own control, because "undo did something odd" is exactly the kind of report that a
// probe can confirm by accident.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  const open = await P(`(function(){
    if(!editorOpen) toggleEditor();
    setEditorMode('build');
    editorActive='props';
    return { editorOpen, mode: editorMode, props: propModels.length };
  })()`);
  console.log('editor   ', JSON.stringify(open));

  /* A CLEAN BASELINE: three real edits, three undos, back where we started. If this row is not clean,
     nothing below it means anything. */
  const clean = await P(`(function(){
    editorUndo.length=0; editorRedo.length=0;
    const o = propModels.find(p=>p && p.userData && p.userData.src==='box');
    window.__o = o;
    const x0 = o.position.x;
    const step = ()=>{ pushUndoSnapshot(); o.position.x += 1; refreshPropCollider(o); };
    step(); step(); step();
    const after = o.position.x;
    performUndo(); performUndo(); performUndo();
    return { x0:+x0.toFixed(3), afterThree:+after.toFixed(3), backTo:+window.__o.position.x.toFixed(3),
             undo:editorUndo.length, redo:editorRedo.length };
  })()`);
  console.log('control  ', JSON.stringify(clean), ' <- three edits, three undos, exactly back');

  /* THE FIRST QUESTION: does a gesture that changes nothing consume a step? A creator clicks into a number
     field to READ it, tabs away, changes nothing. */
  const noop = await P(`(function(){
    const o = window.__o;
    editorUndo.length=0; editorRedo.length=0;
    pushUndoSnapshot(); o.position.x += 5;          // one real edit
    const moved = o.position.x;
    pushUndoSnapshot();                              // a field FOCUS with no typing — 30 controls do this
    pushUndoSnapshot();                              // and a slider MOUSEDOWN with no drag — 30 more
    const depth = editorUndo.length;
    performUndo();
    const afterOne = o.position.x;
    return { moved:+moved.toFixed(3), stackDepth:depth, afterOneUndo:+afterOne.toFixed(3),
             undoDidNothing: Math.abs(afterOne - moved) < 1e-9, stillToUndo:editorUndo.length };
  })()`);
  console.log('no-op    ', JSON.stringify(noop), ' <- stackDepth > 1 means an empty gesture bought a step');

  /* THE SECOND QUESTION, and the one that loses work: does looking at a field destroy the REDO branch? */
  const redo = await P(`(function(){
    const o = window.__o;
    editorUndo.length=0; editorRedo.length=0;
    const x0 = o.position.x;
    pushUndoSnapshot(); o.position.x += 7; refreshPropCollider(o);
    const edited = o.position.x;
    performUndo();                                   // back to x0, redo now holds the edit
    const redoBefore = editorRedo.length;
    pushUndoSnapshot();                              // click into a field. Change NOTHING.
    const redoAfter = editorRedo.length;
    const ok = performRedo();
    return { x0:+x0.toFixed(3), edited:+edited.toFixed(3), redoBefore, redoAfter,
             redoRan: !!ok, x:+o.position.x.toFixed(3),
             lostTheBranch: redoBefore > 0 && redoAfter === 0 };
  })()`);
  console.log('redo     ', JSON.stringify(redo), ' <- lostTheBranch true = a look at a field threw the redo away');

  /* THE CONTROL FOR THAT: a REAL edit still forks the history (build 1129). Measured as the creator
     experiences it — by PRESSING redo — rather than by reading the stack, because the fork now happens when
     the gesture is judged rather than when it starts, so the stack is briefly ahead of the truth. */
  const fork = await P(`(function(){
    const o = window.__o;
    editorUndo.length=0; editorRedo.length=0;
    pushUndoSnapshot(); o.position.x += 3; refreshPropCollider(o);
    performUndo();
    const redoBefore = editorRedo.length;
    pushUndoSnapshot(); o.position.x += 9; refreshPropCollider(o);   // a REAL new edit
    const x = o.position.x;
    const ran = performRedo();                                        // the old branch must be unreachable
    return { redoBefore, redoRan: !!ran, xUnchanged: Math.abs(o.position.x - x) < 1e-9,
             redoAfterPress: editorRedo.length, forked: !ran };
  })()`);
  console.log('fork     ', JSON.stringify(fork), ' <- forked: a real edit makes the old branch unreachable');

  /* AND THE ORDERING THAT MADE THE TWO ABOVE INTERACT: the identical-to-last skip used to return BEFORE the
     redo clear, so an empty gesture behaved differently depending on whether its state happened to match the
     top of the stack. Now that a no-op never forks at all, a run of empty gestures must leave a redo branch
     completely alone — which is what this row measures. */
  const dedupe = await P(`(function(){
    const o = window.__o;
    editorUndo.length=0; editorRedo.length=0;
    pushUndoSnapshot();                               // pushes the current state
    const first = editorUndo.length;
    pushUndoSnapshot();                               // identical -> the skip fires
    const second = editorUndo.length;
    editorRedo.push('{"fake":1}');                    // pretend a redo branch exists
    pushUndoSnapshot();                               // identical again -> skip, and the redo clear is skipped WITH it
    return { first, second, redoKept: editorRedo.length };
  })()`);
  console.log('dedupe   ', JSON.stringify(dedupe), ' <- redoKept 1: three empty gestures leave the branch alone');

  await P(`(function(){ if(editorOpen) toggleEditor(); __release(); return 1; })()`);
}, { headless: true });
