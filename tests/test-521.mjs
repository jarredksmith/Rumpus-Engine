import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 673: in the editor, the "4" key toggles proportional (uniform) scaling on/off — a shortcut for the
// Gizmo panel's "Proportional scaling" checkbox, sitting next to the 1/2/3 gizmo-mode keys (Move/Rotate/Scale).

// --- the keydown handler flips scaleProportional and re-renders the panel ---
assert(/if\(editorOpen && e\.code==='Digit4' && !e\.repeat\)\{[\s\S]*?scaleProportional = !scaleProportional;[\s\S]*?\}/.test(src),
  '4 toggles scaleProportional in the editor');
assert(/if\(editorOpen && e\.code==='Digit4' && !e\.repeat\)\{[\s\S]*?renderEditorFields\(\)[\s\S]*?e\.preventDefault\(\);/.test(src),
  'the toggle refreshes the panel + consumes the key');

// --- the toggle is guarded to the editor (the in-game Digit4 is the 4th weapon slot) ---
assert(/if\(e\.code==='Digit4' && owned\[3\]\) switchWeapon\(owned\[3\]\);/.test(src), 'in live play 4 still switches to weapon slot 4');

// --- the panel advertises the new key ---
assert(/keys <b>1 2 3<\/b>, <b>4<\/b> proportional/.test(src), 'the Gizmo hint mentions the 4 key');
assert(/Proportional scaling <b>\(4\)<\/b> /.test(src), 'the checkbox label shows its (4) shortcut');

done('build 673: editor "4" toggles proportional scaling');
