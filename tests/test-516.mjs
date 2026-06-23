import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 668: drag-to-position. In the HUD editor mode (.hudPreview) the HUD elements become draggable; dragging
// writes that element's dx/dy live, and the panel's X/Y sliders refresh on release.

// --- CSS makes the elements interactive + outlined only while theming the HUD ---
assert(/body\.hudPreview #hud #stats, body\.hudPreview #hud #ammoPanel, body\.hudPreview #hud #score,[\s\S]*?pointer-events: auto; cursor: move; outline: 1px dashed/.test(html), 'HUD elements are draggable + outlined in HUD preview');

// --- the drag wiring ---
assert(/let _hudDragWired = false;/.test(src), 'drag is wired once');
const wd = extractFunction('_wireHudDrag');
assert(/for\(const e of HUD_ELEMENTS\)\{[\s\S]*?dom\.addEventListener\('pointerdown'/.test(wd), 'each HUD element gets a pointerdown handler');
assert(/if\(!document\.body\.classList\.contains\('hudPreview'\)\) return;/.test(wd), 'dragging only acts while the HUD editor mode is showing');
assert(/drag = \{ x:ev\.clientX, y:ev\.clientY, dx:o\.dx\|\|0, dy:o\.dy\|\|0 \};/.test(wd), 'drag captures the start offset');
assert(/o\.dx = Math\.max\(-400, Math\.min\(400, Math\.round\(drag\.dx \+ \(ev\.clientX - drag\.x\)\)\)\);/.test(wd), 'pointer delta updates dx (clamped)');
assert(/o\.dy = Math\.max\(-400, Math\.min\(400, Math\.round\(drag\.dy \+ \(ev\.clientY - drag\.y\)\)\)\);/.test(wd), 'pointer delta updates dy (clamped)');
assert(/if\(typeof applyHudCfg==='function'\) applyHudCfg\(\); _levelDirty=true;/.test(wd), 'the drag applies live + marks the level dirty');
assert(/_hudElSel = e\.k;/.test(wd), 'dragging focuses that element in the panel');
assert(/const end=\(\)=>\{ if\(!drag\) return; drag=null; if\(typeof renderHudPanel==='function'\) renderHudPanel\(\); \};/.test(wd), 'release refreshes the panel sliders');
assert(/if\(typeof pushUndoSnapshot==='function'\) pushUndoSnapshot\(\);/.test(wd), 'a drag is one undo step');

// --- it is wired when the HUD panel renders ---
assert(/if\(typeof _wireHudDrag==='function'\) _wireHudDrag\(\);/.test(extractFunction('renderHudPanel')), 'renderHudPanel wires the drag handlers');

done('build 668: drag HUD elements to position them');
