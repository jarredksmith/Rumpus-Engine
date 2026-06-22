import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 600: DoF focus-plane visual feedback in the cinematic editor.

const rp = extractFunction('refreshCinePreview');
// only drawn when rack focus is on
assert(/if\(_curShot\.focusOn\)\{/.test(rp), 'focus planes only render when rack focus is on');
// a disc placed at the focus distance along the camera aim, facing back at the waypoint
assert(/const center=p\.clone\(\)\.addScaledVector\(dir, Math\.max\(0\.1,dist\)\)/.test(rp), 'disc sits at the focus distance along the aim ray');
assert(/disc\.lookAt\(p\)/.test(rp) && /ring\.lookAt\(p\)/.test(rp), 'focus plane faces the camera');
// reuses the same aim rules as playback/arrows (authored look, path-ahead, or spawn)
assert(/if\(q\.length>=6\)\{ dir=new THREE\.Vector3\(q\[3\],q\[4\],q\[5\]\)\.sub\(p\)/.test(rp), 'authored look target drives the focus ray');
assert(/_curShot\.look==='path' && fp\.length>=2/.test(rp), 'path framing uses the look-ahead direction');
// start = focusFrom (cyan), end = focusTo (orange)
assert(/focusDisc\(0, _curShot\.focusFrom, 0x4ad8ff\)/.test(rp), 'cyan disc marks focusFrom at the start');
assert(/focusDisc\(fp\.length-1, _curShot\.focusTo, 0xff9a3a\)/.test(rp), 'orange disc marks focusTo at the end');

// sliders + toggle refresh the preview live
assert(/CS\.focusFrom=v; if\(typeof refreshCinePreview==='function'\) refreshCinePreview\(\)/.test(src), 'dragging focus start updates the planes live');
assert(/CS\.focusTo=v; if\(typeof refreshCinePreview==='function'\) refreshCinePreview\(\)/.test(src), 'dragging focus end updates the planes live');
assert(/CS\.focusOn=c\.checked; if\(typeof refreshCinePreview==='function'\) refreshCinePreview\(\)/.test(src), 'toggling rack focus shows/hides the planes');

done('DoF focus-plane visual: cyan focusFrom + orange focusTo discs, live as you tune (build 600)');
