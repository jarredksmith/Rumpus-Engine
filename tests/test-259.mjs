import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 361: the Material section no longer leaks onto other tabs (Save, World, Enemies, Weapons).
// Root cause: the material renderer set its section's display from selection ALONE, re-showing it
// after applyEditorMode() had correctly hidden it on a tab switch (a shape stays selected across tabs).

// the renderer must gate visibility on the section belonging to the current mode, not just selection
assert(/const matInMode = \(MODE_SECTIONS\[editorMode\]\|\|\[\]\)\.indexOf\('material'\)>=0;/.test(src), 'material visibility consults the active tab');
assert(/const matOn = matInMode && !!\(selObj && isMatPrimitive\(selObj\.userData\.src\)\);/.test(src), 'shown only when a shape is selected AND material belongs to the tab');
// and only the build tab lists material, so every other tab hides it
assert(/build:\s*\['gizmo','object','material','transform'\]/.test(src), 'only the Build tab owns the material section');
for(const tab of ['scene','player','enemies','rules','kit','files']){
  const m = src.match(new RegExp(tab+":\\s*\\[([^\\]]*)\\]"));
  if(m) assert(!/['"]material['"]/.test(m[1]), 'tab '+tab+' does not list material');
}
done();
