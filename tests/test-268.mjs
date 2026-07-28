import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 373: third-person aim framing — right-click blends the camera from hip framing (tpSide/Dist/Height)
// to a separate aim framing (tpAimSide/Dist/Height) via the existing adsBlend ramp. Each axis interpolates
// independently; the view still looks parallel to forward so the crosshair stays accurate.

// the three aim prefs exist, persisted + clamped
assert(/let tpAimSide = 0\.9;/.test(src) && /let tpAimDist = 2\.6;/.test(src) && /let tpAimHeight = 0;/.test(src), 'aim framing prefs exist with sensible defaults');
assert(/localStorage\.getItem\('breach_tp_aim_side'\)/.test(src) && /localStorage\.getItem\('breach_tp_aim_dist'\)/.test(src) && /localStorage\.getItem\('breach_tp_aim_height'\)/.test(src), 'aim prefs persist');

// the camera blends hip->aim by adsBlend, per axis
const tp = extractFunction('tpCameraPushback');
assert(/const _b = \(typeof adsBlend==='number'\) \? adsBlend : 0;/.test(tp), 'reads the aim-down-sights blend');
// build 1086: the per-axis blend lives in _tpFrame, which takes the ramp as an argument — play passes
// adsBlend, the editor preview passes its own hip/aim switch.
assert(/_tpFrame\(_p, _camYaw, _camPitch, _b\)/.test(tp), '...and hands it to the framing');   // build 1103: via the freezable camera pose
{ const f=extractFunction('_tpFrame');
  assert(/const side = tpSide \+ \(tpAimSide - tpSide\)\*b;/.test(f), 'side interpolates hip->aim');
  assert(/const height = tpHeight \+ \(tpAimHeight - tpHeight\)\*b;/.test(f), 'height interpolates hip->aim');
  assert(/const dist = tpDist \+ \(tpAimDist - tpDist\)\*b;/.test(f), 'distance interpolates hip->aim'); }

// executable: the blend math lands on hip at _b=0 and aim at _b=1, and midway between
function blend(hip, aim, b){ return hip + (aim - hip)*b; }
assert(blend(0, 0.9, 0) === 0, 'b=0 -> hip side');
assert(Math.abs(blend(0, 0.9, 1) - 0.9) < 1e-9, 'b=1 -> aim side');
assert(Math.abs(blend(4.2, 2.6, 0.5) - 3.4) < 1e-9, 'b=0.5 -> halfway distance');

// the wall-clip test now collides the FULL offset camera position (build 799) at the blended distance
assert(/let camx = _f\.x, camy = _f\.y, camz = _f\.z;/.test(tp) && /_cameraCollide\(px, py, pz, camx, camy, camz, TP_MIN/.test(tp), 'the blended-distance camera position is collided against world geometry');

// Player tab exposes a second slider group for the aim framing
assert(/aimHdr\.innerHTML='<b>\\u2026when aiming \(right-click\)<\/b>'/.test(src), 'a "when aiming" slider group is shown');
assert(/mkSlider\('Side', \(\)=>tpAimSide/.test(src) && /mkSlider\('Distance', \(\)=>tpAimDist/.test(src) && /mkSlider\('Height', \(\)=>tpAimHeight/.test(src), 'aim Side/Distance/Height sliders wired');
done();
