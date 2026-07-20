// (build 1022) BUILD-MODE ROTATION ON REAL INPUT DEVICES — field report: "changes the degrees
// display but doesn't actually rotate anything." Reproduced in-browser: the wheel handler
// stepped ±90° per wheel EVENT. A clicky mouse sends one event per notch (the only case the
// old code — and the old harness — covered); a high-resolution wheel sends ~4 small-delta
// events per notch = 360° = visibly nothing while the readout flickers, and one trackpad
// swipe (~22 events) spun the ghost ~20 times. Now deltas ACCUMULATE (normalized across
// deltaModes) and fire one 90° step per ~notch of travel. Rotation also gains inputs it never
// had: R / Shift+R (keyboard), RB / LB (gamepad), and a touch ROT chip.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the notch accumulator ----
const fns = extractFunction('_bmRotStep', src) + '\n' + extractFunction('_bmSpin', src);
let clock = 1000, measured = 0, hinted = 0;
const b = { yaw: 0 };
const spin = new Function('buildMode', 'performance', '_bmMeasure', '_bmHint', 'dy', 'mode',
  fns + '\n_bmSpin(dy, mode);');
const step = new Function('buildMode', 'performance', '_bmMeasure', '_bmHint', 'dir',
  fns + '\n_bmRotStep(dir);');
const S = (dy, mode) => spin(b, { now: () => clock }, () => measured++, () => hinted++, dy, mode||0);

// a clicky mouse: one event of 120 per notch -> exactly one 90° step
S(120); near(b.yaw, Math.PI/2, 1e-9, 'one clicky notch = one 90° step');
eq(measured, 1, '...and the ghost re-measures once');

// THE FIELD BUG: a high-res wheel notch = a burst of 4×30 -> must still be ONE step (was four = 360°)
b.yaw = 0; measured = 0; clock += 1000;
for(let i=0;i<4;i++){ S(30); clock += 8; }
near(b.yaw, Math.PI/2, 1e-9, 'a 4×30 high-res burst = ONE step (the old code spun a full invisible 360°)');
eq(measured, 1, 'one re-measure, not four');

// a trackpad swipe: ~22 tiny events -> one controlled step, not ~20 spins
b.yaw = 0; clock += 1000;
for(let i=0;i<22;i++){ S(8); clock += 6; }
near(b.yaw, Math.PI/2, 1e-9, 'one trackpad swipe = one deliberate step (was ~20 random spins)');

// scrolling the other way steps back; a direction flip never has to fight leftover travel
b.yaw = 0; clock += 1000;
S(60); clock += 8; S(-120);
near(b.yaw, -Math.PI/2, 1e-9, 'a direction flip discards opposing leftovers and steps clean');

// a pause ends the gesture: stale sub-notch travel never leaks into the next flick
b.yaw = 0; clock += 1000;
S(60); clock += 400; S(60);
eq(b.yaw, 0, 'two sub-notch nudges >250ms apart do not add up to a phantom step');
clock += 8; S(40); near(b.yaw, Math.PI/2, 1e-9, 'continuing the same gesture completes the notch');

// Firefox line-mode wheels (deltaMode 1, ±3 lines/notch) still step once per notch
b.yaw = 0; clock += 1000;
S(3, 1); near(b.yaw, Math.PI/2, 1e-9, 'deltaMode=1 (lines) normalizes to a full notch');

// the direct step used by R / RB / LB / touch
b.yaw = 0; b._wAcc = 55;
step(b, { now: () => clock }, () => {}, () => {}, -1);
near(b.yaw, -Math.PI/2, 1e-9, '_bmRotStep steps backwards on demand');
eq(b._wAcc, 0, '...and zeroes any pending wheel travel');

// ---- the wiring: every input rotates ----
assert(/if\(typeof buildMode!=='undefined' && buildMode\)\{ _bmSpin\(e\.deltaY, e\.deltaMode\); return; \}/.test(src),
  'the wheel listener feeds the accumulator (deltaMode included)');
assert(/if\(e\.code===BINDS\.reload\)\{ if\(typeof buildMode!=='undefined' && buildMode\)\{ e\.preventDefault\(\); _bmRotStep\(e\.shiftKey\?-1:1\); return; \} reload\(\); \}/.test(src),
  'R rotates while the ghost is out (Shift+R backwards); reload otherwise');
assert(/if\(edge\(5\)\)\{ if\(typeof buildMode!=='undefined' && buildMode\) _bmRotStep\(1\); else cycleWeapon\(1\); \}/.test(src)
    && /if\(edge\(4\)\)\{ if\(typeof buildMode!=='undefined' && buildMode\) _bmRotStep\(-1\); else cycleWeapon\(-1\); \}/.test(src),
  'RB/LB rotate the ghost on a pad (weapon cycling there was pointless)');
assert(/<button class="tBtn" id="tRot" aria-label="Rotate the build ghost" style="display:none">ROT<\/button>/.test(html),
  'the touch ROT chip exists');
assert(/body\.touch #tRot\s+\{ left: calc\(20px \+ env\(safe-area-inset-left\)\); bottom: calc\(252px/.test(html),
  '...stacked just above BUILD');
assert(/tap\('tRot', \(\)=>\{ if\(typeof buildMode!=='undefined' && buildMode\) _bmRotStep\(1\); \}\);/.test(src),
  '...and taps rotate');
const hint = extractFunction('_bmHint', src);
assert(/tr\.style\.display=\(typeof isTouch!=='undefined' && isTouch\)\?'flex':'none';/.test(hint),
  'the chip only appears with the build hint, only on touch');
const exitFn = extractFunction('exitBuildMode', src);
assert(/getElementById\('tRot'\); if\(tr\) tr\.style\.display='none';/.test(exitFn), 'leaving build mode hides it');
assert(/Scroll\/R rotate/.test(hint) && /RB rotate/.test(hint) && /ROT rotate/.test(hint),
  'every layout of the hint teaches its rotate input');

done('build 1022: build rotation steps per notch (hi-res wheels + trackpads fixed) and works from R, RB/LB, and touch');
