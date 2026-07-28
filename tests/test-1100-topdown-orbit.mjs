// build 1100: top-down games can let PLAYERS orbit the camera (gameCfg.viewOrbit, opt-in).
//
// Hold middle mouse and drag sideways to spin the camera about the player. Off by default so
// authored fixed-angle games frame exactly as before. Movement is screen-relative since build
// 1085, so WASD keeps matching the screen at any spin. Editor previews never orbit (gameOn
// gate) and each session starts back at the authored angle.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// the runtime yaw is gated: in-game only, top view only, opt-in only
assert(/function _vcamOrbitOn\(\)\{ return typeof gameOn!=='undefined' && gameOn && !\(typeof editorOpen!=='undefined' && editorOpen\) && gameCfg\.view==='top' && !!gameCfg\.viewOrbit; \}/.test(src),
  'the orbit gate: playing, not editing, top-down view, creator opted in');
assert(/if\(e\.button!==1 \|\| !_vcamOrbitOn\(\)\) return; _vcamOrbitDrag=\{ x:e\.clientX \}; e\.preventDefault\(\);/.test(src),
  'middle-mouse press starts the orbit drag (and stops browser autoscroll)');
assert(/_vcamUserYaw=\(_vcamUserYaw \+ \(e\.clientX-_vcamOrbitDrag\.x\)\*0\.35\)%360;/.test(src),
  'sideways drag spins the camera');
assert(/\(vm==='top' && _vcamOrbitOn\(\)\) \? _vcamUserYaw : 0/.test(src),
  'the player yaw adds to the authored yaw inside the single shared pose function');
assert(/if\(typeof _vcamUserYaw!=='undefined'\) _vcamUserYaw=0;/.test(src),
  'a new session starts back at the authored angle');

// persistence: saved with the level, read back by both loaders
assert(/viewOrbit: !!gameCfg\.viewOrbit, chaseCursorAim/.test(src), 'serialized into the level');
const loads = src.match(/gameCfg\.viewOrbit = !!level\.game\.viewOrbit;/g) || [];
assert(loads.length >= 2, 'both level loaders restore it (' + loads.length + ')');

// the gameplay-settings checkbox, top-down only
assert(/Players can orbit the camera/.test(src), 'the toggle is in the camera-view section');
assert(/gameCfg\.viewOrbit=orbCb\.checked; _levelDirty=true;/.test(src), '...and writes the flag');

done('build 1100: top-down players can spin the camera — if the creator says so');
