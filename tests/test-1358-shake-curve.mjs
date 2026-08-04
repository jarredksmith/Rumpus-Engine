// (build 1358) THE SHAKE CURVE WAS THROWING AWAY 85-96% OF EVERY GUNSHOT.
//
// `const s = shake * shake` carried the comment "ease — feels punchier". Trauma-squared is a real and
// standard curve — for a trauma value that REACHES 1. Every call site in this engine is far below that:
// gunfire lives at 0.045-0.16, and squaring a number in that range only shrinks it, by 85-96%.
//
// Measured at the shipped 78 deg fov, driving the real block to convergence (a critic's harness, reproduced
// below in `peak`):
//     smg     addShake(0.045)   0.0020 deg   0.02 px @1080p    33 ms
//     rifle   addShake(0.080)   0.0080 deg   0.09 px           50 ms
//     shotgun addShake(0.160)   0.0393 deg   0.46 px           83 ms
// A tenth of a pixel for two frames is not a camera shake. Firing this game read as clicking a mouse.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const blk = src.slice(src.indexOf('if(shake > 0.001){'), src.indexOf('} else { shake = 0; camera.rotation.z = _camLean; }') + 60);

// ---- the curve is linear now, and the square is gone ----
{
  assert(/const s = shake, _st = _pnow\(\) \* 0\.001;/.test(blk),
    'the amplitude is the trauma itself — squaring a value that never approaches 1 is pure attenuation');
  assert(!/shake \* shake/.test(blk), 'and the square is gone, not merely commented');
}

// ---- what a player actually sees, executed ----
{
  const N = new Function('return ' + extractFunction('_shakeN', src).replace(/^function _shakeN/, 'function') + ';')();
  const DECAY = Number(extractConst('SHAKE_DECAY'));
  const DEG = 180 / Math.PI;
  // peak angular deviation over one second of the noise, times the block's own 0.04 coefficient
  const amp = (k) => { let m = 0; for (let i = 0; i < 4000; i++) m = Math.max(m, Math.abs(N(i / 1000, k))); return m; };
  const peak = (s) => amp(0) * 0.04 * s * DEG;

  const rifle = peak(0.13), smg = peak(0.075), shot = peak(0.26), rocket = peak(0.9);
  assert(rifle > 0.2 && rifle < 0.6, 'a rifle shot moves the view ~0.3 deg — it was 0.008 (' + rifle.toFixed(3) + ')');
  assert(shot > rifle * 1.5, 'and a shotgun moves it twice as far (' + shot.toFixed(3) + ')');
  assert(smg < rifle, 'the SMG stays the lightest of the three');
  assert(rocket > 1.5, 'a rocket at your feet is a real jolt, past a degree and a half (' + rocket.toFixed(3) + ')');
  // durations: amplitude-proportional, which is right — a rocket shakes far longer than a shot
  const ms = (s) => (s / DECAY) * 1000;
  assert(ms(0.13) > 100, 'a rifle shake lasts longer than two frames now (' + ms(0.13).toFixed(0) + ' ms)');
  assert(ms(0.9) > 600 && ms(0.9) < 1200, 'and a rocket lasts most of a second (' + ms(0.9).toFixed(0) + ' ms)');
}

// ---- smooth noise of TIME, not white noise per frame ----
{
  const N = new Function('return ' + extractFunction('_shakeN', src).replace(/^function _shakeN/, 'function') + ';')();
  assert(!/Math\.random\(\)/.test(blk),
    'white noise resampled per frame makes one shake a DIFFERENT visual phenomenon at 30 Hz and at 144 Hz');
  // bounded, so the amplitude coefficient means what it says
  let mx = 0; for (let i = 0; i < 20000; i++) mx = Math.max(mx, Math.abs(N(i / 997, i % 3)));
  assert(mx <= 1.0001, 'the noise is bounded to +/-1 (' + mx.toFixed(4) + ')');
  // smooth: adjacent samples at a real frame step differ by a small fraction of the range
  let worst = 0;
  for (let i = 0; i < 5000; i++) worst = Math.max(worst, Math.abs(N((i + 1) / 60, 0) - N(i / 60, 0)));
  assert(worst < 1.9, 'and continuous — no step approaches the full swing a random pair would give');
  // deterministic in time, so two consumers of the same instant agree
  eq(N(1.234, 0), N(1.234, 0), 'it is a pure function of time');
  assert(N(1.234, 0) !== N(1.234, 1), '...and the three axes are decorrelated');
  // the three axes must not be in phase, or the shake is a diagonal line rather than a shake
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 4000; i++) { const a = N(i / 400, 0), b = N(i / 400, 1); dot += a * b; na += a * a; nb += b * b; }
  assert(Math.abs(dot / Math.sqrt(na * nb)) < 0.35, 'x and y are close to uncorrelated');
}

// ---- everything the shake already promised is untouched ----
{
  const add = extractFunction('addShake', src);
  assert(/a11y\.shake/.test(add), 'build 1313’s motion-comfort scale still gates every call');
  assert(/Math\.min\(1,/.test(add), '...and the trauma still clamps at 1');
  assert(/camera\.rotation\.z  = _camLean \+/.test(blk),
    'build 1210’s strafe lean is still the BASE of the roll, not overwritten by it');
  assert(/\} else \{ shake = 0; camera\.rotation\.z = _camLean; \}/.test(blk),
    'and a settled camera returns exactly to the lean');
  // the two sites that write `shake` directly (a car slam, a multi-kill punch) still scale by a11y
  eq((src.match(/shake = Math\.max\(shake,/g) || []).length, 2, 'the two direct writers are unchanged');
}

// ---- the call site was retuned for the new curve, not left at values tuned for the old one ----
{
  assert(/addShake\(curWep==='shotgun'\?0\.26:\(curWep==='smg'\?0\.075:0\.13\)\)/.test(src),
    'gunfire amounts moved with the curve — leaving them would have kept the frame nearly still');
  // the hit amounts are damage-scaled and deliberately NOT retuned: they were already in a usable range
  eq((src.match(/addShake\(Math\.min\(0\.5, dmg\/55\)\)/g) || []).length, 2,
    'taking damage still scales with the hit, unchanged');
}

done('build 1358: the camera shake is linear, smooth in time, and lasts longer than two frames');
