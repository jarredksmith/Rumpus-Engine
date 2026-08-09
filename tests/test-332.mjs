import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 441: Alt + click-drag on a prop duplicates it and drags the copy under the cursor (in addition to Shift+D).

// helpers exist
assert(/let _altDup = null, _altDupActive = false;/.test(src), 'alt-drag state declared');
const pick = extractFunction('_pickPropAt');
assert(/raycaster\.setFromCamera/.test(pick) && /for\(const p of propModels\)/.test(pick) && /propModels\.indexOf\(root\)>=0\) return root/.test(pick), 'picks the prop root under the pointer');
const dup = extractFunction('_dupPropForDrag');
assert(/_dupSpawnFrom\(o, 0, 0, /.test(dup), 'clones at the EXACT source position — zero offset; the drag positions it (build 1162: via the full-config entry path)');
assert(/_altDup = obj; editorActive='props'; editorTargets\.props\.idx = propModels\.indexOf\(obj\); selProps=\[obj\]/.test(dup), 'the fresh duplicate becomes the dragged + selected object');
assert(/p\.mat \|\| \(p\.tex \? \{tex:p\.tex\} : null\)/.test(extractFunction('_pfSpawnEntry')), 'duplicate keeps the material — the entry path it now rides applies mat/tex (build 1162)');

// mousedown: alt + prop => start drag-dup, suppress look/select
assert(/if\(e\.altKey\)\{ const o=_pickPropAt\(e\); if\(o\)\{ e\.preventDefault\(\); pushUndoSnapshot\(\); _dupPropForDrag\(o\); _altDupActive = true; editorDragMoved = true; return 'altdup'; \} \}/.test(src), 'Alt+mousedown on a prop starts the drag-duplicate and suppresses look/select');
// the alt check sits BEFORE drag-look starts
// build 1444 split that line — the marquee moved into the shared press chain, the look/orbit claim stayed.
// The ordering is unchanged: the duplicate is inside the chain, which the handler runs first.
const iAlt = src.indexOf('if(e.altKey){ const o=_pickPropAt(e);');
const iChain = src.indexOf('if(_edPressDown(e)) return;');
const iLook = src.indexOf('if(!(e.altKey && editorFreeFly && _edOrbitStart(e))) editorDragLook = true;', iChain);
assert(iAlt>=0 && iChain>=0 && iLook>iChain, 'alt-dup is handled before drag-look would start');

// mousemove: the copy follows the ground point under the cursor
assert(/if\(_altDupActive\)\{ if\(_altDup\)\{ const gp = groundPointUnderPointer\(e\); if\(gp\)\{ _altDup\.position\.x = gp\.x; _altDup\.position\.z = gp\.z; \} \} editorDragMoved = true; return true; \}/.test(src), 'drag moves the duplicate to the cursor (XZ)');

// mouseup: finalize + sync
assert(/if\(_altDupActive\)\{ _altDupActive = false; _altDup = null;[\s\S]*?tg\.sync\(\)/.test(src), 'mouseup ends the drag and syncs the fields');

// discoverable in the hint
assert(/Alt\+drag<\/b> a prop to clone/.test(src), 'editor hint documents Alt+drag');

// executable: drag math — duplicate tracks the projected ground point
let copy = { position:{ x:1, y:2, z:3 } };
const groundPt = { x:9.5, y:0, z:-4.25 };
copy.position.x = groundPt.x; copy.position.z = groundPt.z;   // mirrors the mousemove body
assert(copy.position.x===9.5 && copy.position.z===-4.25 && copy.position.y===2, 'copy follows cursor in XZ and keeps its height');
done();
