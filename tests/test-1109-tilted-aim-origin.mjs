// build 1109: a tilted third-person camera no longer fires from the sky.
//
// Third-person shots have always raycast from the CAMERA through the crosshair — fine when the
// camera sits at head height behind the shoulder. Build 1101's Tilt slider raises the boom (5 m at
// 60°, 4.4 m at 45°), so the shot ORIGIN went up there with it: bullets cleared cover the character
// was crouched behind, were stopped by ceilings the character was standing under, and the tracer
// visibly started in mid-air. Any tilted chase camera now uses the body-relative ballistics the
// twin-stick views already used: the pellet leaves the character's muzzle and travels to whatever
// the crosshair is on, so hits still land under the crosshair but the shot is honest.
import { gameSource, extractFunction, assert, near, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- the trigger condition
assert(/function _bodyAimActive\(\)\{\n  return cursorAimActive\(\) \|\| \(typeof tpActive==='function' && tpActive\(\) && typeof tpTilt==='number' && Math\.abs\(tpTilt\) > 1\);\n\}/.test(src),
  'body ballistics engage for cursor views AND any meaningfully tilted chase camera');
assert(/const _TP_CENTER = \{ x:0, y:0 \};/.test(src) && /function _aimNdcNow\(\)\{ return cursorAimActive\(\) \? _vAimNdc : _TP_CENTER; \}/.test(src),
  'the aim point is the cursor in cursor views, screen centre otherwise');
// a 1-degree deadzone keeps ordinary untilted chase on the classic camera ray (no behaviour change)
assert(/Math\.abs\(tpTilt\) > 1/.test(src), 'an untilted chase camera is untouched');

// ---------------------------------------------------------------- the three weapons paths
assert(/const _vmA = \(typeof _bodyAimActive==='function' && _bodyAimActive\(\)\) \? _aimNdcNow\(\) : null;/.test(src),
  'gunfire uses it');
assert(/if\(typeof _bodyAimActive==='function' && _bodyAimActive\(\)\)\{   \/\/ build 1109: tilted chase lobs from the body too/.test(src),
  'grenades use it');
assert(/if\(typeof _bodyAimActive==='function' && _bodyAimActive\(\)\)\{\n    o\.set\(player\.pos\.x, player\.pos\.y-0\.2, player\.pos\.z\);/.test(src),
  'rockets use it');
// _vAimPt is only maintained by the cursor solver — a tilted chase camera must not inherit it stale
assert(/_vmTgt = _cH \? _cH\.point\.clone\(\) : \(cursorAimActive\(\) \? _vAimPt\.clone\(\) : raycaster\.ray\.at\(120, new THREE\.Vector3\(\)\)\);/.test(src),   // build 1236: ghost-filtered resolve (_cH) — same fallback chain
  'with nothing under the crosshair, the fallback target is far down the crosshair ray itself');

// ---------------------------------------------------------------- executable: the height it was firing from
// _tpFrame is the shared framing function; run it at several tilts to show what the old
// camera-origin rule meant in practice.
{
  const tf = extractFunction('_tpFrame');
  const frame = (tilt) => new Function('tpTilt',
    `const tpSide=0, tpDist=4.2, tpHeight=0, tpAimSide=0, tpAimDist=4.2, tpAimHeight=0; const _TPF={};\n${tf}\nreturn _tpFrame;`
  )(tilt)({ x: 0, y: 1.4, z: 0 }, 0, 0, 0);
  near(frame(0).y, 1.4, 0.001, 'untilted: the camera is at chest height — firing from it was always fine');
  const t45 = frame(45).y, t60 = frame(60).y;
  assert(t45 > 4.3, 'at 45° the camera sits ' + t45.toFixed(2) + ' m up');
  assert(t60 > 5.0, 'at 60° it sits ' + t60.toFixed(2) + ' m up — a shot origin well above any cover');
  // the character's own muzzle stays at chest height regardless of tilt: that is the new origin
  assert(Math.abs(frame(60).py - 1.4) < 1e-6, 'the PIVOT (the character) never moves with tilt — hence body ballistics');
}

done('build 1109: tilt moves the camera, not the gun');
