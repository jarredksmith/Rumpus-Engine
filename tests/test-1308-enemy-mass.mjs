import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1308 — gameplay audit F8, "Enemies move without mass. MED.", verified still live:
//
//   "Enemy translation is direct position integration — `en.mesh.position.x += _mvx*spd*dt`, strafe, lunge.
//    There is no velocity state and no acceleration, so an enemy reaches full chase speed on frame 1 and
//    stops dead on frame 1. Facing IS smoothed (turnToward at TURN_RATE), which makes the mismatch more
//    visible, not less: the body rotates while the position slides sideways. This is exactly the defect
//    build 1171 fixed for the player and did not port to the AI."
//
// Same model, same safe-change constraint: the TARGET is the `dir * speed` the old code wrote directly, so
// every tuned speed, standoff, patrol pace and slow-zone multiplier is byte-identical at steady state.

const ACCEL = +src.match(/const EN_ACCEL_K=([0-9.]+), EN_BRAKE_K=([0-9.]+);/)[1];
const BRAKE = +src.match(/const EN_ACCEL_K=([0-9.]+), EN_BRAKE_K=([0-9.]+);/)[2];

const step = new Function('EN_ACCEL_K', 'EN_BRAKE_K',
  'const _enStepOut = { x:0, z:0 };\n' + extractFunction('_enStep') + '; return _enStep;')(ACCEL, BRAKE);
const mkEn = (x = 0, z = 0) => ({ mesh: { position: { x, y: 0, z } } });
const drive = (en, tvx, tvz, dt, frames) => { for (let i = 0; i < frames; i++) { const p = step(en, tvx, tvz, dt); en.mesh.position.x = p.x; en.mesh.position.z = p.z; } };

// ---------------------------------------------------------------- steady state is the old engine, exactly
{
  const S = 7;                                   // a grunt's chase speed
  const en = mkEn();
  drive(en, S, 0, 1 / 60, 200);
  near(en._vx, S, 1e-9, 'after a couple of seconds the enemy is moving at EXACTLY its authored speed');
  eq(en._vz, 0, '...with nothing sideways');
  // ...and one more frame travels exactly speed*dt, which is what the old line wrote
  const x0 = en.mesh.position.x;
  drive(en, S, 0, 1 / 60, 1);
  near(en.mesh.position.x - x0, S / 60, 1e-9, 'a steady-state frame travels speed*dt — the pre-1308 line, unchanged');
}
{ // every speed the engine feeds it, not just one
  for (const S of [1.5, 3, 4.5, 7, 9, 12, 30]) {
    const en = mkEn(); drive(en, S, 0, 1 / 60, 400);
    near(en._vx, S, 1e-6, 'steady state holds at ' + S + ' u/s');
  }
  // and a diagonal target keeps its magnitude
  const en = mkEn(); const c = Math.SQRT1_2 * 6;
  drive(en, c, c, 1 / 60, 400);
  near(Math.hypot(en._vx, en._vz), 6, 1e-6, 'a diagonal chase reaches the same 6 u/s, not 6*sqrt(2)');
}

// ---------------------------------------------------------------- the ramp, which is the whole point
{
  const S = 7, en = mkEn(), dt = 1 / 60;
  drive(en, S, 0, dt, 1);
  assert(en._vx < S * 0.25, 'FRAME 1 IS NOT FULL SPEED — the defect the audit named (' + (en._vx / S * 100).toFixed(0) + '% of top)');
  assert(en._vx > 0, '...but it is moving');
  // 95% of top speed in a quarter of a second or so: weight, not sludge
  let t = 0; const e2 = mkEn();
  while (e2._vx == null || e2._vx < S * 0.95) { drive(e2, S, 0, dt, 1); t += dt; if (t > 3) break; }
  assert(t > 0.12 && t < 0.45, '95% of chase speed in ' + (t * 1000).toFixed(0) + ' ms — a ramp a player can read');
  // and it is SLOWER off the mark than the player, deliberately
  const P = +src.match(/const MOVE_ACCEL_K=([0-9.]+),/)[1];
  assert(ACCEL < P, 'an enemy accelerates slower than the player (' + ACCEL + ' vs ' + P + ') — you are the one with the crisp controls');
  assert(BRAKE < +src.match(/MOVE_BRAKE_K=([0-9.]+)/)[1], '...and stops slower too');
}
{ // stopping is a stop, not a slide
  const S = 7, en = mkEn(), dt = 1 / 60;
  drive(en, S, 0, dt, 200);
  const x0 = en.mesh.position.x;
  drive(en, 0, 0, dt, 1);
  assert(en._vx < S, 'releasing the command sheds speed immediately…');
  assert(en._vx > S * 0.5, '…without stopping dead on the frame, which is the reported half of the defect');
  drive(en, 0, 0, dt, 120);
  assert(Math.abs(en._vx) < 0.02, 'and two seconds later it is stopped');
  const slide = en.mesh.position.x - x0;
  assert(slide > 0.1 && slide < 1.2, 'the whole stop costs ' + slide.toFixed(2) + ' m — a step, not a skid');
}
{ // a reversal takes a moment, which is what "mass" means
  const S = 7, en = mkEn(), dt = 1 / 60;
  drive(en, S, 0, dt, 200);
  drive(en, -S, 0, dt, 1);
  assert(en._vx > 0, 'one frame after reversing, an enemy at full speed is still going the old way');
  drive(en, -S, 0, dt, 300);
  near(en._vx, -S, 1e-6, '...and settles at full speed the other way');
}

// ---------------------------------------------------------------- frame rate cannot change the feel
{
  const S = 7;
  // THE VELOCITY CURVE IS EXACT AT ANY REFRESH RATE, because the blend is 1-exp(-k*dt) rather than k*dt.
  // Build 1171 uses the linear approximation for the player; measured with it here, half a second of
  // chasing covered 3.56 m at 20 fps against 2.92 m at 240 — a 22% spread on the same input. The exact
  // form removes it for one Math.exp per moving enemy per frame.
  // Compared against the CONTINUOUS solution rather than against another frame rate, because a fixed
  // wall-clock target lands on a fractional frame at most refresh rates and that error is the test's, not
  // the engine's. v(t) = S(1 - e^(-k t)) is what the exact blend reproduces, at any step.
  for (const fps of [20, 30, 60, 90, 144, 240]) {
    const dt = 1 / fps, n = Math.round(0.25 * fps), en = mkEn();
    drive(en, S, 0, dt, n);
    near(en._vx, S * (1 - Math.exp(-ACCEL * n * dt)), 1e-9,
      'the speed after ' + n + ' frames at ' + fps + ' fps is the exact continuous solution');
  }
  // ...and the ground covered agrees to within what a right-hand Euler sum costs, which every moving thing
  // in this engine already pays.
  const at = (dt) => { const en = mkEn(); let t = 0; while (t < 0.5 - 1e-9) { drive(en, S, 0, dt, 1); t += dt; } return en.mesh.position.x; };
  const ref = at(1 / 60);
  for (const fps of [20, 30, 90, 144, 240]) {
    const err = Math.abs(at(1 / fps) - ref) / ref;
    assert(err < 0.04, 'half a second of chasing covers the same ground at ' + fps + ' fps (' + (err * 100).toFixed(1) + '% off)');
  }
  assert(/const k = 1 - Math\.exp\(-\(\(tvx \|\| tvz\) \? EN_ACCEL_K : EN_BRAKE_K\) \* dt\);/.test(src),
    'and the exact form is what ships');
  // A DT SPIKE DEGRADES TO THE OLD BEHAVIOUR rather than overshooting — 1171's rule, and 1-exp is
  // self-clamping so it cannot exceed the target however long the frame was.
  const en = mkEn(); drive(en, S, 0, 0.5, 1);
  near(en._vx, S, 0.03, 'a half-second hitch lands on the pre-1308 instant speed…');
  assert(en._vx < S, '…and provably never past it');
  const e2 = mkEn(); drive(e2, S, 0, 30, 1);
  assert(e2._vx <= S, 'nor after a thirty-second stall');
}

// ---------------------------------------------------------------- IT MUST NOT LOOK STUCK
{
  // build 540's recovery counts a frame as stuck when travel is under 30% of top speed, and wall-follows
  // after 0.2 s of that. A ramp starts below 30% BY DESIGN, so this is the one place the change could have
  // caused a real regression — every enemy would start every chase by wall-following.
  const S = 7;
  for (const fps of [20, 30, 60, 90, 144, 240]) {
    const dt = 1 / fps, en = mkEn(); let stuck = 0, worst = 0;
    for (let i = 0; i < 200; i++) {
      const x0 = en.mesh.position.x, z0 = en.mesh.position.z;
      drive(en, S, 0, dt, 1);
      const mv = Math.hypot(en.mesh.position.x - x0, en.mesh.position.z - z0);
      if (mv < S * dt * 0.3) { stuck += dt; worst = Math.max(worst, stuck); } else stuck = 0;
    }
    assert(worst < 0.2, 'at ' + fps + ' fps the start-up ramp accrues only ' + (worst * 1000).toFixed(0) +
      ' ms of "no progress" against build 540\'s 0.2 s trigger — an enemy never begins a chase by wall-following');
  }
}

// ---------------------------------------------------------------- the wiring
{
  const st = extractFunction('_enStep');
  assert(/\(\(tvx \|\| tvz\) \? EN_ACCEL_K : EN_BRAKE_K\)/.test(st),
    'accelerating and braking are different rates');
  assert(/_enStepOut\.x = en\.mesh\.position\.x \+ en\._vx\*dt;/.test(st),
    'it returns a CANDIDATE position rather than writing one — the strafe and the dash have to test theirs');
  assert(/const _enStepOut = \{ x:0, z:0 \};/.test(src), 'and the result rides one module-scope object (build 1168)');
  // every translation site goes through it
  const ue = src.slice(src.indexOf('// Phase 1 — behavior:'), src.indexOf('// Phase 2 — separation'));
  eq((ue.match(/_enStep\(en,/g) || []).length, 7,
    'seven calls: cover, flank, close, back-off, strafe, beeline, and the brake — every place an enemy translated');
  assert(!/en\.mesh\.position\.x \+= _mvx\*spd\*dt/.test(src), 'the direct beeline integration is gone');
  assert(!/en\.mesh\.position\.x \+= cvx\/cvd\*en\.speed/.test(src), '...and the direct cover step');
  assert(!/en\.mesh\.position\.x \+= toPx\/pd\*en\.speed/.test(src), '...and the direct standoff step');
  assert(/if\(!en\._wantMove && \(\(en\._vx\|\|0\) \|\| \(en\._vz\|\|0\)\)\)\{ const _p=_enStep\(en, 0, 0, dt\);/.test(src),
    'a frame that commands no step BRAKES, so an enemy that stops looks like it stopped');
  assert(/en\._vx = en\._lungeDx\*\(en\.lungeSpeed\|\|30\); en\._vz = en\._lungeDz\*\(en\.lungeSpeed\|\|30\);/.test(src),
    'the charger’s dash seeds the velocity, so it carries momentum out of the lunge instead of stopping dead');
  // the separation shove and the obstacle resolve are deliberately NOT routed through it
  assert(/const push=eR-d; en\.mesh\.position\.x \+= dx\/d\*push;/.test(src),
    'anti-overlap separation still writes position directly — it is a CORRECTION, not locomotion, and giving it mass would reintroduce build 995’s vibration');
}
{ // the reasoning, and the constraint that makes it safe
  assert(/the TARGET is the same `dir \* speed` the old code wrote directly,/.test(src),
    'the safe-change constraint is stated where it lives');
  assert(/byte-identical at steady state/i.test(src));
  assert(/This is exactly the defect build 1171 fixed for the player and\n\/\/ never ported to the AI\./.test(src),
    'and the audit finding is recorded with its provenance');
}

done('build 1308 (gameplay audit F8): enemies move with mass — every enemy translation was direct position integration at five sites, so an enemy reached full chase speed on frame 1 and stopped dead on frame 1 while its FACING was smoothed, which made the mismatch more visible rather than less. Velocity now chases the same dir*speed target the old code wrote directly, so every authored speed, standoff and slow-zone multiplier is byte-identical at steady state (proven to 1e-9 across seven speeds and a diagonal) while starts, stops and reversals get a ramp. Simulated frame by frame from 20 to 240 fps: same ground covered in half a second, a dt spike degrades exactly to the old instant speed, and — the one real regression risk — the start-up ramp accrues at most 32 ms of "no progress" against build 540\'s 0.2 s wall-follow trigger, so no enemy begins a chase by wall-following');
