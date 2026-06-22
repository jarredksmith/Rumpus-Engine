import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const page = (typeof html!=='undefined' && html) ? html : src;
// build 615: the camera preview is draggable, and the integrity HUD hides in the editor (no overlap).

// integrity HUD hidden while editing
assert(/body\.editing #stats \{ display:none !important; \}/.test(page), 'CSS hides #stats (integrity) when editing');
assert(/document\.body\.classList\.toggle\('editing', !!editorOpen\)/.test(src), 'the editing body class is toggled from editor state');
// and it is NOT gated to touch any more (the toggle stands on its own line, outside the isTouch block)
assert(/\}\s*\n\s*document\.body\.classList\.toggle\('editing', !!editorOpen\)/.test(src), 'editing class applies on all platforms, not just touch');

// drag: header is a handle, updates a persisted position
assert(/_cinePvPos=null; try\{ const s=localStorage\.getItem\('breach_cinepvpos'\)/.test(src), 'dragged position restores from storage');
const ep = extractFunction('_ensureCinePvPanel');
assert(/hdr\.addEventListener\('pointerdown', \(e\)=>\{ if\(e\.target===sld \|\| e\.target===x\) return;/.test(ep), 'drag starts on the header but not on the scrubber/close');
assert(/_cinePvPos=\{ left, top \}; p\.style\.left=left\+'px'; p\.style\.top=top\+'px'/.test(ep), 'dragging moves the panel by top-left');
assert(/let left=Math\.max\(0, Math\.min\(innerWidth-W, e\.clientX-_drag\.dx\)\), top=Math\.max\(0, Math\.min\(innerHeight-H, e\.clientY-_drag\.dy\)\)/.test(ep), 'drag is clamped on-screen');
assert(/localStorage\.setItem\('breach_cinepvpos', JSON\.stringify\(_cinePvPos\)\)/.test(ep), 'position persists on drop');

// render: honors the dragged position, else auto-corner; scissor follows the frame's real rect
const rw = extractFunction('_renderCinePvWindow');
assert(/if\(_cinePvPos\)\{[\s\S]*_cinePvPanel\.style\.left=L\+'px'; _cinePvPanel\.style\.top=T\+'px'/.test(rw), 'uses the dragged position when set');
assert(/const L=Math\.max\(0, Math\.min\(innerWidth-W, _cinePvPos\.left\)\), T=Math\.max\(0, Math\.min\(innerHeight-ph, _cinePvPos\.top\)\)/.test(rw), 're-clamps a stored position into view');
assert(/const fr=_cinePvFrame\.getBoundingClientRect\(\);/.test(rw), 'scissor rect is derived from the frame element');
assert(/const X=Math\.round\(fr\.left\), Yb=Math\.round\(size\.y - fr\.bottom\), Wr=Math\.max\(2,Math\.round\(fr\.width\)\), Hr=Math\.max\(2,Math\.round\(fr\.height\)\)/.test(rw), 'maps the frame rect to scissor coords (Y from bottom)');
assert(/_cinePvCam\.aspect=Wr\/Hr/.test(rw), 'preview camera aspect matches the actual frame');

done('preview window: draggable + persisted, integrity HUD hidden in editor (build 615)');
