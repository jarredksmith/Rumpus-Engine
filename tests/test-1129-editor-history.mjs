// build 1129: the level editor has a real edit history, and Ctrl+S saves.
//
// Ctrl+Z was a ONE-WAY TRAPDOOR. There was no redo anywhere in the level editor — the animation
// editor had _aeUndo/_aeRedo since build 1046, but the thing creators spend all their time in did not
// — so one stray keypress in a direct-manipulation tool destroyed work with no way back.
//
// And Ctrl+S did nothing at all, which is worse than not being bound: the keydown handler already
// preventDefaults Ctrl+S (it is caught by the guard that stops the browser's Save Page dialog on
// Ctrl+W/A/S/D), so the most reflexive key in any editor was actively swallowed and then dropped.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the two stacks
assert(/const editorRedo = \[\];/.test(src), 'there is a redo stack');
{
  const push = extractFunction('pushUndoSnapshot');
  assert(/editorRedo\.length = 0;/.test(push),
    'a new edit clears the redo branch — after an undo, editing forks the history and the old forward branch is unreachable');
  assert(/if\(editorUndo\.length > 60\) editorUndo\.shift\(\);/.test(push), 'the undo stack is still bounded');
}
{
  // build 1291: undo and redo are ONE step in opposite directions (_historyStep), so each of these is now
  // asserted once instead of twice — which is stronger, not weaker: the two can no longer drift apart.
  const u = extractFunction('performUndo'), r = extractFunction('performRedo'), h = extractFunction('_historyStep');
  assert(/return _historyStep\(editorUndo\.pop\(\), editorRedo\);/.test(u) &&
         /return _historyStep\(editorRedo\.pop\(\), editorUndo\);/.test(r),
    'and redo does the mirror image — the same step, with the stacks swapped');
  // undo has to capture the state it is LEAVING: pushUndoSnapshot stores pre-edit states, so the
  // post-edit state exists nowhere else and there would be nothing to redo
  assert(/let cur = null; try \{ cur = JSON\.stringify\(serializeLevel\(\)\); \} catch\(e\)\{\}/.test(h),
    'undo captures the state it is leaving');
  assert(/pushTo\.push\(cur\); if\(pushTo\.length > 60\) pushTo\.shift\(\);/.test(h),
    '...onto a bounded redo stack');
  assert(/editorUndoActive = true;/.test(h) && /finally \{ editorUndoActive = false; \}/.test(h),
    'the step suppresses snapshots during its own restore, and restores the flag even if the restore throws');
  assert((h.match(/finally \{ editorUndoActive = false; \}/g) || []).length === 2,
    '...on the fast path too, or a failed fast apply would leave history recording switched off');
}

// ---------------------------------------------------------------- executable: the history round-trips
{
  // a miniature of the real thing: the same two-stack logic against a scalar "level"
  let level = 'A';
  const editorUndo = [], editorRedo = [];
  let editorUndoActive = false;
  const serialize = () => level;
  const restore = (v) => { level = v; };
  const push = () => { if (editorUndoActive) return; const snap = serialize();
    if (editorUndo.length && editorUndo[editorUndo.length-1] === snap) return;
    editorUndo.push(snap); if (editorUndo.length > 60) editorUndo.shift(); editorRedo.length = 0; };
  const undo = () => { if (!editorUndo.length) return false; const snap = editorUndo.pop(); const cur = serialize();
    editorUndoActive = true; try { restore(snap); } finally { editorUndoActive = false; }
    editorRedo.push(cur); return true; };
  const redo = () => { if (!editorRedo.length) return false; const snap = editorRedo.pop(); const cur = serialize();
    editorUndoActive = true; try { restore(snap); } finally { editorUndoActive = false; }
    editorUndo.push(cur); return true; };
  const edit = (v) => { push(); level = v; };

  edit('B'); edit('C'); edit('D');
  eq(level, 'D', 'three edits');
  undo(); eq(level, 'C', 'undo one');
  undo(); eq(level, 'B', 'undo two');
  redo(); eq(level, 'C', 'redo one');
  redo(); eq(level, 'D', 'redo two');
  assert(!redo(), 'redo at the tip does nothing');
  eq(level, 'D', '...and changes nothing');
  // the fork: editing after an undo must drop the forward branch
  undo(); undo(); eq(level, 'B', 'back to B');
  edit('X'); eq(level, 'X', 'a new edit from B');
  assert(!redo(), 'the old C/D branch is gone — redo would resurrect work the author replaced');
  eq(level, 'X', '...and redo did not move us');
  // and undo still walks back through the new branch
  undo(); eq(level, 'B', 'undo returns to B');
  undo(); eq(level, 'A', '...and on back to the start');
  assert(!undo(), 'undo at the root does nothing');
  // a full round trip is lossless
  edit('P'); edit('Q'); const at = level;
  undo(); undo(); redo(); redo();
  eq(level, at, 'undo-undo-redo-redo returns exactly where it started');
}

// ---------------------------------------------------------------- keys
{
  // undo: unchanged
  assert(/if\(editorOpen && \(e\.ctrlKey\|\|e\.metaKey\) && e\.code==='KeyZ' && !e\.shiftKey\)\{/.test(src), 'Ctrl+Z still undoes');
  // redo on BOTH conventions
  assert(/if\(editorOpen && \(e\.ctrlKey\|\|e\.metaKey\) && \(\(e\.code==='KeyZ' && e\.shiftKey\) \|\| e\.code==='KeyY'\)\)\{/.test(src),
    'Ctrl+Shift+Z and Ctrl+Y both redo');
  // and Ctrl+S saves through the SAME button the menu and palette use, so there is one save path
  assert(/if\(editorOpen && \(e\.ctrlKey\|\|e\.metaKey\) && e\.code==='KeyS' && !e\.shiftKey && !e\.altKey\)\{/.test(src), 'Ctrl+S is bound');
  assert(/e\.preventDefault\(\); const b=document\.getElementById\('edSave'\); if\(b\) b\.click\(\);/.test(src),
    '...and it clicks the real Save button rather than calling saveLevel directly, so the toast and the dirty flag behave the same');
  // every one of them must ignore a keypress inside a text field, or typing "z" in a tag box undoes the level
  const hits = [...src.matchAll(/const tag = \(e\.target && e\.target\.tagName\) \|\| '';\n\s*if\(tag!=='INPUT' && tag!=='TEXTAREA'\)/g)].length;
  assert(hits >= 3, 'undo, redo and save all ignore keypresses inside a text field (' + hits + ')');
  // the guard that was eating Ctrl+S is still there — it has to be, or the browser opens Save Page
  assert(/if\(e\.ctrlKey && \(e\.code==='KeyW'\|\|e\.code==='KeyA'\|\|e\.code==='KeyS'\|\|e\.code==='KeyD'\)\) e\.preventDefault\(\);/.test(src),
    'the browser-shortcut guard is untouched');
}

// ---------------------------------------------------------------- reachable without a keyboard
assert(/<button id="edRedo" title="Redo \(Ctrl\+Shift\+Z\)" aria-label="Redo"/.test(src),
  'there is a redo button beside undo — build 910 added the undo one for touch authors, who have no keyboard at all');
assert(/rb\.onclick=\(\)=>\{ if\(typeof performRedo==='function'\) performRedo\(\); \}/.test(src), '...and it is wired');
assert(/\{ label:'Redo', key:'Ctrl\+Shift\+Z', run:\(\)=>\{ if\(typeof performRedo==='function'\) performRedo\(\); \} \},/.test(src),
  'and Edit > Redo sits beside Edit > Undo');
assert(/\{ label:'Save',                 key:'Ctrl\+S', run:\(\)=>_edClick\('edSave'\) \},/.test(src),
  'File > Save advertises its shortcut, which it could not before because it did not have one');
{
  const fn = extractFunction('_edSyncHistoryBtns');
  assert(/u\.disabled = !editorUndo\.length;/.test(fn) && /r\.disabled = !editorRedo\.length;/.test(fn),
    'both buttons grey out when their stack is empty');
  for (const caller of ['_historyStep', 'pushUndoSnapshot'])   // build 1291: performUndo/Redo are _historyStep
    assert(/_edSyncHistoryBtns\(\)/.test(extractFunction(caller)), caller + ' refreshes them');
}

done('build 1129: the editor history goes forward as well as back, and Ctrl+S saves');
