// build 1222: the sprint-FOV stops glitching — REPORTED FROM PLAY as "the scene zooms and bounces back,
// a stutter every few seconds while walking or running".
//
// And it was exactly that. Build 1210's sprint push was gated on player.onGround, which flickers FALSE for
// single frames mid-stride — the SAME flicker builds 926 (slide) and 1160 (jump) had to buffer — so the FOV
// snapped 6 degrees out and back in one frame, unsmoothed, every time the ground test blinked. Two fixes,
// both structural: the gate is GONE (speed-FOV tracks SPEED; airborne horizontal speed is still speed, and
// the landing dip remains the landing cue), and the value is EASED through a persistent _sprintFovCur so no
// single-frame condition of any kind can ever step the lens again.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the glitch, replayed against the fix
{
  // the eased update the loop runs: cur += (target - cur) * min(1, dt*8)
  const step = (cur, target, dt) => cur + (target - cur) * Math.min(1, dt * 8);

  // reproduce the REPORT: sprinting at top speed (target 6), the old gate blinks the target to 0 for ONE
  // frame, then back. With easing, the lens barely moves; without it (the old code), it jumped 6 degrees.
  let cur = 6;                       // settled at full sprint push
  const before = cur;
  cur = step(cur, 0, 1 / 60);        // the single flicker frame (even IF some condition zeroed the target)
  const dipped = before - cur;
  assert(dipped < 0.9, 'one adversarial zero-target frame moves the lens < 0.9 degrees (was a 6-degree snap) — the glitch cannot reproduce');
  cur = step(cur, 6, 1 / 60);
  assert(Math.abs(6 - cur) < 0.9, '...and it returns just as gently');

  // and the real fix is one level deeper: the flickering condition no longer exists at all
  assert(!/player\.vel && player\.onGround && typeof SPEED/.test(src),
    'the onGround gate is GONE from the sprint-FOV target — the mid-stride ground flicker can never reach the lens');

  // normal behaviour: starting a sprint ramps the push in over ~a quarter second, smoothly
  let c = 0; const frames = [];
  for (let i = 0; i < 30; i++) { c = step(c, 6, 1 / 60); frames.push(c); }
  assert(frames[0] < 1, 'the push does not arrive in one frame');
  assert(frames[29] > 5, '...but settles near the full 6 degrees within half a second');
  for (let i = 1; i < 30; i++) assert(frames[i] >= frames[i - 1], '...monotonically — it never overshoots or oscillates');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/let _landDip = 0, _landDipV = 0, _camLean = 0, _sprintFovCur = 0;/.test(src),
    'the eased value is persistent state beside the other 1210 camera channels');
  assert(/_sprintFovCur \+= \(_sprintTarget - _sprintFovCur\) \* Math\.min\(1, dt\*8\);/.test(src),
    'the loop eases toward the target');
  assert(/if\(Math\.abs\(_sprintFovCur - _sprintTarget\) < 0\.01\) _sprintFovCur = _sprintTarget;/.test(src),
    '...and snaps the last hundredth so a settled lens stops paying updateProjectionMatrix');
  assert(/const wantFov = hipFov \+ \(_zoomFov - hipFov\) \* adsBlend \+ _sprintFovCur;/.test(src),
    'the camera reads the EASED value, never the raw target');
  assert(/_sprintTarget = _f\*_f \* 6 \* \(1 - adsBlend\);/.test(src),
    'the target keeps 1210\'s quadratic curve and ADS fold-out unchanged');
}

done('build 1222: the sprint-FOV zoom-bounce stutter is dead — the flickering onGround gate is removed from the target entirely and the push eases through persistent state (an adversarial single-frame zero moves the lens under a degree where it used to snap six), while the quadratic curve, ADS fold-out and settle behaviour are all preserved');
