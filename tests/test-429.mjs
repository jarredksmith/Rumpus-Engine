import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 563: top-view marquee. Left-drag on empty space in top view draws a box and selects every prop whose
// center projects inside it (Shift adds). Pan moves to right/middle-drag; fly mode left-drag still looks.

// state + helpers exist
assert(/let _marqueeOn=false, _marqueeX0=0, _marqueeY0=0, _marqueeEl=null;/.test(src), 'marquee state');
assert(/function _marqueeStart\(e\)\{/.test(src) && /function _marqueeMove\(e\)\{/.test(src) && /function _marqueeFinish\(e\)\{/.test(src), 'marquee start/move/finish helpers');

// wiring: top-view left-drag starts the marquee (not pan); fly still looks
assert(/if\(editorTopView\) _marqueeStart\(e\); else editorDragLook = true;/.test(src), 'top-view left-drag starts the marquee');
// mousemove updates the box; mouseup finishes it
assert(/if\(_marqueeOn\)\{ _marqueeMove\(e\); editorDragMoved = true; return; \}/.test(src), 'drag updates the marquee box');
assert(/if\(_marqueeOn\)\{ _marqueeFinish\(e\); \}/.test(src), 'mouseup finalizes the marquee');
// pan moved to middle/right drag in top view + context menu suppressed
assert(/e\.button!==1 && e\.button!==2\)\) return; if\(editorTopView\)\{ editorDragPan=true;/.test(src), 'middle/right-drag pans in top view');
assert(/addEventListener\('contextmenu', e=>\{ if\(editorOpen && editorTopView\) e\.preventDefault\(\); \}\)/.test(src), 'context menu suppressed in top view (so right-drag pan works)');

// finish: tiny drag falls back to a click; real drag selects projected props, Shift adds
const mf = extractFunction('_marqueeFinish');
assert(/Math\.abs\(e\.clientX-_marqueeX0\)<=4 && Math\.abs\(e\.clientY-_marqueeY0\)<=4\)\{ editorDragMoved=false; return; \}/.test(mf), 'a negligible drag is treated as a click, not a marquee');
assert(/_marqueeV\.setFromMatrixPosition\(p\.matrixWorld\); _marqueeV\.project\(cam\);/.test(mf), 'each prop center is projected through the active camera');
assert(/if\(e\.shiftKey\)\{ for\(const o of hits\) for\(const m of _mem\(o\)\) if\(selProps\.indexOf\(m\)<0\) selProps\.push\(m\); \}/.test(mf), 'Shift adds the boxed props (whole groups) to the selection (build 798)');
assert(/else \{ const set=\[\]; for\(const o of hits\) for\(const m of _mem\(o\)\) if\(set\.indexOf\(m\)<0\) set\.push\(m\); selProps = set; selLights = \[\]; \}/.test(mf), 'no-Shift replaces the selection with the boxed props + their groups (empty box clears)');
assert(/editorActive='props'/.test(mf) && /updateSelectionHighlight/.test(mf) && /renderEditorFields/.test(mf), 'selection routes to props + refreshes highlight/panel');

// hint documents it
assert(/marquee-select props/.test(src), 'editor hint documents the marquee');

// --- executable model: NDC -> screen px containment (the actual test _marqueeFinish runs per prop) ---
function inBox(ndcX, ndcY, ndcZ, view, box){
  const sx = view.left + (ndcX*0.5+0.5)*view.width;
  const sy = view.top  + (-ndcY*0.5+0.5)*view.height;
  return ndcZ < 1 && sx>=box.x0 && sx<=box.x1 && sy>=box.y0 && sy<=box.y1;
}
const view = { left:0, top:0, width:100, height:100 };
const box = { x0:10, y0:10, x1:90, y1:90 };
eq(inBox(0, 0, 0.5, view, box), true,  'NDC center (->50,50px) is inside a 10..90 box');
eq(inBox(0.9, 0, 0.5, view, box), false, 'NDC x=0.9 (->95px) is outside x1=90');
eq(inBox(0, 0, 1.2, view, box), false, 'a point behind the camera (z>=1) is excluded');
eq(inBox(-0.6, 0.6, 0.5, view, box), true, 'top-left-ish NDC maps inside the box');

done('top-view marquee: left-drag selects projected props, Shift adds, pan on right/middle-drag (build 563)');
