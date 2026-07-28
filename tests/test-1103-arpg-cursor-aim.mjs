// build 1103: ARPG cursor aim for the chase view (gameCfg.chaseCursorAim, opt-in).
//
// The mouse becomes a cursor (the twin-stick machinery), the character turns and shoots AT it,
// and the camera direction freezes so the boom stops whipping around with the spinning body.
// WASD moves relative to the frozen camera. Pair with the third-person Tilt slider for a
// Diablo-style almost-top-down action game.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the two gates
assert(/function chaseCursorOn\(\)\{\n  return typeof gameCfg!=='undefined' && gameCfg\.view==='chase' && !!gameCfg\.chaseCursorAim/.test(src),
  'chaseCursorOn: chase view + opt-in + live play only');
assert(/function cursorAimActive\(\)\{ return activeViewMode\(\)!=='fps' \|\| chaseCursorOn\(\); \}/.test(src),
  'cursorAimActive unifies "the cursor aims, not the head"');

// the mouse feeds the cursor, not the head
assert(/if\(typeof cursorAimActive==='function' && cursorAimActive\(\) && !drivingCar\)\{ _vcX \+= mx; _vcY \+= my; return; \}/.test(src),
  'pointer-locked mouse movement steers the twin-stick cursor in chase-cursor mode');

// the aim solver treats chase-cursor exactly like top-down (chest-plane cursor)
const va = extractFunction('_updateViewAim');
assert(/const cc = \(typeof chaseCursorOn==='function' && chaseCursorOn\(\)\);/.test(va) &&
       /const vm = cc \? 'top' : activeViewMode\(\);/.test(va),
  'the cursor solver reuses the top-down chest-plane path');
assert(/if\(cc && !_ccWasOn\) _ccYaw = player\.yaw;/.test(va), 'the camera yaw freezes where the player was looking');
assert(/if\(vm==='top' && !cc\) player\.pitch=0;/.test(va), 'chase-cursor keeps vertical aim for the avatar gun');

// the camera boom uses the frozen yaw + the Tilt slider (pitch 0)
const tp = extractFunction('tpCameraPushback');
assert(/const _camYaw = _cc \? _ccYaw : player\.yaw, _camPitch = _cc \? 0 : player\.pitch;/.test(tp),
  'the boom orbits the frozen yaw, level, while the body spins to the cursor');
assert(/if\(side \|\| height \|\| _cc \|\| \(typeof tpTilt==='number' && tpTilt\)\)/.test(tp),
  'the camera looks along the frozen boom, not the body yaw');

// firing, melee, grenades and rockets all resolve to the cursor
// (build 1109 widened the gate to _bodyAimActive so a TILTED chase camera also fires from the body)
assert(/const _vmA = \(typeof _bodyAimActive==='function' && _bodyAimActive\(\)\) \? _aimNdcNow\(\) : null;/.test(src),
  'pellets fire from the body toward the cursor target');
// melee + the scope gate read cursorAimActive directly; gunfire, grenades and rockets go through
// _bodyAimActive (which is cursorAimActive OR a tilted chase camera) — build 1109
const cursorGates = src.match(/typeof (cursorAimActive|_bodyAimActive)==='function' && (cursorAimActive|_bodyAimActive)\(\)/g) || [];
assert(cursorGates.length >= 5, 'melee, grenades, rockets and the scope gate all honour it (' + cursorGates.length + ' sites)');

// movement relative to the frozen camera
assert(/else if\(typeof chaseCursorOn==='function' && chaseCursorOn\(\)\)\{ forward\.set\(-Math\.sin\(_ccYaw\),0,-Math\.cos\(_ccYaw\)\); right\.set\(Math\.cos\(_ccYaw\),0,-Math\.sin\(_ccYaw\)\); \}/.test(src),
  'WASD moves relative to the frozen camera, not the cursor-spun body');

// persistence + UI
assert(/chaseCursorAim: !!gameCfg\.chaseCursorAim \}/.test(src), 'saved with the level');
const loads = src.match(/gameCfg\.chaseCursorAim = !!level\.game\.chaseCursorAim;/g) || [];
assert(loads.length >= 2, 'both loaders restore it (' + loads.length + ')');
assert(/ARPG cursor aim<\/b>/.test(src), 'the checkbox lives in the camera-view section');

done('build 1103: chase view plays like an ARPG — if the creator says so');
