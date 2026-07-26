import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 367: (1) editor visuals reliably torn down on deploy, (2) forward arrow on the preview avatar,
//            (3) third-person shoulder offset.

// --- (1) the real fix: updateGizmo() only HIDES when called, and nothing called it after editorOpen
//         flipped on the Play-level path, so the gizmo froze visible. Now forced at the flip (both sites). ---
assert((src.match(/editorOpen=false; _editorOpenFlag=false; editorAimPreview=false; editorFreeFly=false; editorTopView=false;\s*\n(?:\s*if\(typeof _edMenuSync==='function'\)[^\n]*\n)?\s*if\(typeof updateGizmo==='function'\) updateGizmo\(\);/g)||[]).length === 2, 'both deploy paths force updateGizmo() once editorOpen is false');
assert(/if\(typeof setSpawnMarkersVisible==='function'\) setSpawnMarkersVisible\(false\);[\s\S]{0,400}if\(typeof setAudioZoneMarkersVisible==='function'\) setAudioZoneMarkersVisible\(false\);/.test(src), 'spawn + pickup + audio markers hidden at the flip');
// updateGizmo genuinely hides when not in the editor (the mechanism the fix relies on)
const ug = extractFunction('updateGizmo');
assert(/const movable = editorOpen &&/.test(ug) && /if\(!pos\)\{ gr\.translate\.visible=gr\.scale\.visible=gr\.rotate\.visible=false; gizmo\.visible = false; return; \}/.test(ug), 'updateGizmo hides everything when editorOpen is false');

// --- (2) forward arrow on the preview avatar ---
assert(/const _fArr=new THREE\.ArrowHelper\(new THREE\.Vector3\(0,0,-1\)/.test(src), 'forward arrow points TRUE forward (-Z, the engine forward at yaw 0) — build 383');
assert(/_fArr\.line\.raycast=\(\)=>\{\}; _fArr\.cone\.raycast=\(\)=>\{\}; mk\.add\(_fArr\)/.test(src), 'arrow is non-pickable and parented to the origin marker (so it tracks the avatar)');

// --- (3) third-person shoulder offset ---
assert(/let tpSide = 0;/.test(src) && /let tpDist = 4\.2;/.test(src) && /let tpHeight = 0;/.test(src), 'side/distance/height are persisted, clamped prefs (build 371)');
const tp = extractFunction('tpCameraPushback');
assert(/let camx = px - fx\*dist \+ rx\*side, camy = py - fy\*dist \+ height, camz = pz - fz\*dist \+ rz\*side;/.test(tp), 'camera carries blended side + height framing (build 373)');
assert(/if\(side \|\| height\)\{ _tpLookAt\.set\(camx \+ fx, camy \+ fy, camz \+ fz\); camera\.lookAt\(_tpLookAt\); \}/.test(tp), 'view stays parallel to forward so the crosshair is accurate');
assert(/_tpLookAt\.set\(camx \+ fx, camy \+ fy, camz \+ fz\); camera\.lookAt\(_tpLookAt\)/.test(tp), 'looks parallel to forward so the crosshair stays accurate (build 370)');
assert(/_tpBack=new THREE\.Vector3\(\), _tpEye=new THREE\.Vector3\(\), _tpLookAt=new THREE\.Vector3\(\)/.test(src), '_tpLookAt declared with the other tp vectors');
// editor slider wired to the pref + localStorage
assert(/mkSlider\('Side'/.test(src) && /mkSlider\('Distance'/.test(src) && /mkSlider\('Height'/.test(src), 'Player tab exposes Side/Distance/Height sliders');
done();
