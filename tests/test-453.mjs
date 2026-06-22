import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 599: two bug fixes.

// (1) the inventory authoring panel must not depend on renderEditorFields's local `hint` —
//     it defines its own, so rendering it no longer throws "hint is not defined".
const ri = extractFunction('renderInvItems');
assert(/const hint=\(h, html, margin\)=>\{ const d=document\.createElement\('div'\); d\.className='hint';/.test(ri), 'renderInvItems carries its own hint helper');
assert(/function renderInvItems\(host\)\{/.test(src), 'renderInvItems is a standalone function (no closure over editor locals)');

// (2) eliminated players cannot fire. Both the input gate and shoot() itself check duelDead.
assert(/if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen\) return;/.test(src), 'mousedown is ignored while eliminated');
const sh = extractFunction('shoot');
assert(/if\(duelDead\) return;/.test(sh), 'shoot() bails out while eliminated (covers a latched trigger)');

done('fixes: inventory authoring hint scope + no firing while eliminated (build 599)');
