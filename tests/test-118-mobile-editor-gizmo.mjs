// (build 168) Mobile editor manipulation: a press on the look-pad first tries to grab a gizmo axis handle
// (drag = move/rotate/scale); a drag with no grab orbits the fly-cam; a clean tap (no movement) dispatches a
// click into the existing select handler to pick the prop/light/spawn under it. Gizmo enlarged on touch.
import { gameSource, done, assert } from './harness.mjs';
const src = gameSource();

// gizmo grab attempted on press in the editor
// build 1444 moved the press chain into _edPressDown, which the mouse runs too — so the pad now reaches
// the terrain brush and the marquee as well, and the gizmo grab it always had is the chain's second link.
assert(/if\(editorOpen\)\{ editorDragMoved=false; if\(typeof _edPressDown==='function'\)\{ if\(!_edPressDown\(e\)\) gizmoDrag=null; \} \}/.test(src), 'press grabs a gizmo handle or arms a look/tap');
assert(/if\(tryGizmoGrab\(e\)\)\{ editorDragMoved = true; return 'gizmo'; \}/.test(src), '...and the grab is still what a press tries');
// drag drives gizmo when grabbed, else look
assert(/if\(gizmoDrag\)\{ gizmoDragMove\(e\); editorDragMoved = true; return true; \}/.test(src), 'drag moves the grabbed handle');
assert(/if\(!\(typeof _edPressMove==='function' && _edPressMove\(e\)\)\)\{/.test(src), '...through the chain the mouse drags with');
assert(/_edPressMove\(e\)\)\)\{ touchLookDX\+=dx; touchLookDY\+=dy; if\(Math\.abs\(dx\)\+Math\.abs\(dy\)>3\) editorDragMoved=true; \}/.test(src), 'drag with no grab orbits the cam');
// clean tap -> synthetic click into the select handler
assert(/if\(!editorDragMoved\)\{ renderer\.domElement\.dispatchEvent\(new MouseEvent\('click', \{ clientX:e\.clientX, clientY:e\.clientY, bubbles:true \}\)\); \}/.test(src), 'a tap selects via the existing click handler');
// gizmo bigger on touch
assert(/gizmo\.scale\.setScalar\(Math\.max\(0\.4, d\*0\.06\) \* \(isTouch\?1\.5:1\)\);/.test(src), 'gizmo enlarged for touch');
done('mobile editor select + gizmo drag');
