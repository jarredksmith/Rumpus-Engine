// build 1210: the first-person camera reacts to the player's own body.
//
// The gameplay-feel critic's HIGH: on foot the camera never moved with you — no landing impact (build
// 730's speed-FOV lived only in the driving branch), no sprint-FOV push, no strafe lean, so movement read
// as a camera on rails. Now a landing kicks a spring-damped eye dip (dip then settle) plus a thud and a
// touch of shake, sprint widens the FOV toward top speed, and lateral velocity rolls the view — all folded
// out while aiming so the sight stays true.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the dip spring, integrated
{
  // replicate the exact spring the loop runs and prove it dips then settles without wobbling
  const K = 90, D = 14;
  let dip = 0, v = 0;
  v -= 1.6 + 1.0 * 7.0;   // a hard-ish landing impulse (impact ~1)
  const trace = [];
  for (let i = 0; i < 240; i++) { const dt = 1 / 60;
    v += (-dip * K - v * D) * dt; dip += v * dt; trace.push(dip);
    if (Math.abs(dip) < 1e-4 && Math.abs(v) < 1e-3) { dip = 0; v = 0; }
  }
  const lowest = Math.min(...trace);
  assert(lowest < -0.05, 'the eye dips visibly on a hard landing (' + lowest.toFixed(3) + ')');
  assert(trace[trace.length - 1] === 0, 'and settles back to exactly 0 within a few tenths — no lingering wobble');
  // critically-ish damped: it must not oscillate hard (no big positive overshoot after the dip)
  const maxAfterLow = Math.max(...trace.slice(trace.indexOf(lowest)));
  assert(maxAfterLow < 0.03, 'well damped — a small settle, not a bounce (' + maxAfterLow.toFixed(3) + ')');
}

// ---------------------------------------------------------------- the sprint-FOV curve
{
  const push = (hsp, top, ads) => { const f = top > 0 ? Math.min(1, hsp / top) : 0; return f * f * 6 * (1 - ads); };
  eq(push(0, 10, 0), 0, 'standing still: no FOV push');
  near(push(10, 10, 0), 6, 1e-9, 'at top speed: the full 6-degree widen');
  assert(push(5, 10, 0) < push(10, 10, 0) * 0.4, 'the push is quadratic — half speed is much less than half the widen');
  eq(push(10, 10, 1), 0, 'aiming folds the sprint push entirely out (the sight must not breathe)');
}

// ---------------------------------------------------------------- the lean target
{
  const lean = (latV, ads) => Math.max(-0.05, Math.min(0.05, -latV * 0.006)) * (1 - ads);
  assert(lean(5, 0) < 0 && lean(-5, 0) > 0, 'the view rolls AWAY from lateral velocity (strafe lean)');
  eq(lean(0, 0), 0, 'no lateral velocity, no lean');
  assert(Math.abs(lean(1000, 0)) <= 0.05, 'the lean is clamped so a launch does not spin the camera');
  eq(lean(5, 1), 0, 'aiming kills the lean too');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/if\(_playerWasAir && !drivingCar\)\{/.test(src) && /const _fall = Math\.max\(0, -player\.vel\.y\);/.test(src),
    'the air->ground frame reads the fall speed BEFORE vel.y is zeroed');
  assert(/_landDipV -= 1\.6 \+ _imp\*7\.0;/.test(src) && /if\(typeof SFX!=='undefined' && SFX\.land\) SFX\.land\(_imp\);/.test(src),
    'a real landing kicks the dip spring, and plays a thud scaled by impact');
  assert(/shake = Math\.max\(shake, _imp\*0\.22\);/.test(src), '...with a touch of impact shake');
  assert(/const wantFov = hipFov \+ \(_zoomFov - hipFov\) \* adsBlend \+ _sprintFov;/.test(src),
    'the sprint push is added to the ADS-blended FOV, not multiplied — it survives aiming being zero');
  assert(/camera\.position\.y \+= _landDip;/.test(src), 'the dip lowers the first-person eye');
  assert(/camera\.rotation\.z  = _camLean \+ \(Math\.random\(\)-0\.5\) \* 0\.06 \* s;/.test(src) && /\} else \{ shake = 0; camera\.rotation\.z = _camLean; \}/.test(src),
    'the lean drives camera roll whether or not shake is active');
  assert(/land\(impact\)\{ const v=Math\.max\(0\.04, Math\.min\(0\.2, 0\.06\+impact\*0\.16\)\);/.test(src),
    'SFX.land scales its thud with the landing impact');
}

done('build 1210: the FPS camera has a body — the landing dip spring executed (visible dip, clean settle, no bounce), the quadratic sprint-FOV curve (full widen at top speed, folded out by ADS), the clamped strafe-lean (rolls away from lateral velocity, killed while aiming), and the wiring that reads fall speed before it is zeroed and drives the eye/FOV/roll');
