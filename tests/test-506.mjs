import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 656: editor shortcut keys — F toggles free-fly, T toggles top-down view. Mirrors the View toolbar
// buttons, and is guarded so typing F/T in a text field (search / URL / names) doesn't fly the camera.

// the combined handler exists and is editor-gated + non-repeat
assert(/if\(editorOpen && !e\.repeat && \(e\.code==='KeyF' \|\| e\.code==='KeyT'\) && !e\.ctrlKey && !e\.metaKey && !e\.altKey\)\{/.test(src), 'F/T are handled only while the editor is open (and not as a modifier combo)');

// guarded against typing into inputs
assert(/const tag = \(e\.target && e\.target\.tagName\) \|\| '';\s*\n\s*if\(tag!=='INPUT' && tag!=='TEXTAREA'\)\{/.test(src), 'ignored while a text field is focused');

// F toggles fly (and exits top view); T toggles top view (and exits fly) — same as the toolbar
assert(/if\(e\.code==='KeyF'\)\{ editorFreeFly=!editorFreeFly; if\(editorFreeFly\)\{ editorTopView=false; flyInit=false; \}/.test(src), 'F toggles free-fly and leaves top view');
assert(/else \{ editorTopView=!editorTopView; if\(editorTopView\)\{ editorFreeFly=false; topPanX=0; topPanZ=0; topZoom=Math\.min\(Math\.max\(75, ARENA\*1\.12\), 2600\); \}/.test(src), 'T toggles top view, leaves fly mode, and fits the zoom to the whole arena (build 829)');
assert(/keys\['KeyF'\]=false;/.test(src), 'the F keydown is consumed so it does not also strafe');

// discoverability: the toolbar buttons advertise the keys, and the hint line lists them
assert(/shortcut: T/.test(src) && /shortcut: F/.test(src), 'the Top view / Fly buttons show their shortcut in a tooltip');
assert(/<b>F<\/b> fly · <b>T<\/b> top view/.test(src), 'the editor hint lists the F / T shortcuts');

done('build 656: F = fly, T = top view editor shortcuts');
