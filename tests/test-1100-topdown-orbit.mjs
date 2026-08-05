// build 1100: top-down games can let PLAYERS orbit the camera (gameCfg.viewOrbit, opt-in).
//
// Hold middle mouse and drag sideways to spin the camera about the player. Off by default so
// authored fixed-angle games frame exactly as before. Movement is screen-relative since build
// 1085, so WASD keeps matching the screen at any spin. Editor previews never orbit (gameOn
// gate) and each session starts back at the authored angle.
import { gameSource, assert, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */


const src = gameSource();

// the runtime yaw is gated: in-game only, top view only, opt-in only
assert(/function _vcamOrbitOn\(\)\{ return typeof gameOn!=='undefined' && gameOn && !\(typeof editorOpen!=='undefined' && editorOpen\) && gameCfg\.view==='top' && !!gameCfg\.viewOrbit; \}/.test(src),
  'the orbit gate: playing, not editing, top-down view, creator opted in');
assert(/if\(e\.button!==1 \|\| !_orbitTarget\(\)\) return; _vcamOrbitDrag=true; e\.preventDefault\(\);/.test(src),
  'middle-mouse press starts the orbit drag (and stops browser autoscroll)');
// build 1106: THE bug — pointer lock freezes clientX, so the original clientX-baseline drag always
// measured zero in-game and the camera never moved. The lock delta (movementX) is the real signal.
assert(/const d=\(typeof e\.movementX==='number'\) \? e\.movementX : 0; if\(!d\) return;/.test(src),
  'the drag reads the pointer-lock delta, not the frozen clientX');
assert(/if\(t==='top'\) _vcamUserYaw=\(_vcamUserYaw - d\*0\.35\)%360;/.test(src),
  'sideways drag spins the camera (sign matches the look handler: drag right turns right)');
assert(/else _ccYaw -= d\*0\.35\*\(Math\.PI\/180\);/.test(src),
  'the same drag swings the frozen ARPG chase camera');
assert(/function _orbitTarget\(\)\{\n  if\(_vcamOrbitOn\(\)\) return 'top';\n  if\(typeof chaseCursorOn==='function' && chaseCursorOn\(\)\) return 'chase';/.test(src),
  'top-down needs the creator opt-in; ARPG chase always allows it (its camera is frozen by design)');
assert(/\(vm==='top' && _vcamOrbitOn\(\)\) \? _vcamUserYaw : 0/.test(src),
  'the player yaw adds to the authored yaw inside the single shared pose function');
assert(/if\(typeof _vcamUserYaw!=='undefined'\) _vcamUserYaw=0;/.test(src),
  'a new session starts back at the authored angle');

// persistence: saved with the level, read back by both loaders
assert(/viewOrbit: !!gameCfg\.viewOrbit, chaseCursorAim/.test(src), 'serialized into the level');
const loads = src.match(/gameCfg\.viewOrbit = !!g\.viewOrbit;/g) || [];
assert(loads.length >= 1, 'both level loaders restore it (' + loads.length + ')');

// the gameplay-settings checkbox, top-down only
assert(/Players can orbit the camera/.test(src), 'the toggle is in the camera-view section');
assert(/gameCfg\.viewOrbit=orbCb\.checked; _levelDirty=true;/.test(src), '...and writes the flag');

done('build 1100: top-down players can spin the camera — if the creator says so');
