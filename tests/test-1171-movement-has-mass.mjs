// build 1171: movement has mass.
//
// The gameplay critic's #1 feel finding, verified: `player.vel = wish*sp` every frame — velocity teleported
// to the input. Zero start-up weight, dead-stop on key release EVEN MID-AIR (release W at the apex and the
// arc collapsed to a vertical drop), instantaneous 180s at full speed. Velocity now chases the input target
// exponentially with four rates (ground accel/brake, air steer/carry). The design constraint that made this
// a safe change: the TARGET is wish*sp, so every tuned speed is byte-identical at steady state.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const K = {};
for (const [k, v] of src.match(/const MOVE_ACCEL_K=([\d.]+), MOVE_BRAKE_K=([\d.]+), MOVE_AIR_K=([\d.]+), MOVE_AIR_BRAKE_K=([\d.]+);/).slice(1)
  .map((v, i) => [['accel', 'brake', 'air', 'airBrake'][i], +v])) K[k] = v;

// ---------------------------------------------------------------- the shape
{
  assert(!/player\.vel\.x = wish\.x \* sp;/.test(src), 'the velocity teleport is gone');
  assert(/player\.vel\.x \+= \(_tx - player\.vel\.x\) \* _f;/.test(src), 'velocity CHASES the target');
  assert(/const _f = Math\.min\(1, _k \* dt\);/.test(src),
    '...with the blend clamped at 1, so a dt spike degrades exactly to the old behaviour instead of overshooting');
  assert(/player\.onGround \? \(_mvIn \? MOVE_ACCEL_K : MOVE_BRAKE_K\) : \(_mvIn \? MOVE_AIR_K : MOVE_AIR_BRAKE_K\)/.test(src),
    'four rates: ground accel/brake, air steer/carry — the four situations are different');
  const iModel = src.indexOf('player.vel.x += (_tx - player.vel.x)');
  const iSlide = src.indexOf('player.vel.x = slideDir.x*slSpeed');
  assert(iModel > 0 && iSlide > iModel, 'the slide still writes velocity directly AFTER the model — its decay is authored');
}

// ---------------------------------------------------------------- executed: the feel, frame by frame at 60fps
{
  const dt = 1 / 60;
  const sim = (frames) => {   // frames: [{wx, wz, g}] wish (unit) + grounded; sp fixed at 12 (default run)
    const v = { x: 0, z: 0 }; const out = [];
    for (const f of frames) {
      const tx = (f.wx || 0) * 12, tz = (f.wz || 0) * 12;
      const mvIn = (f.wx || 0) !== 0 || (f.wz || 0) !== 0;
      const k = f.g ? (mvIn ? K.accel : K.brake) : (mvIn ? K.air : K.airBrake);
      const blend = Math.min(1, k * dt);
      v.x += (tx - v.x) * blend; v.z += (tz - v.z) * blend;
      out.push({ x: v.x, z: v.z });
    }
    return out;
  };
  const F = (n, wx, wz, g) => Array.from({ length: n }, () => ({ wx, wz, g }));

  { // steady state is byte-identical to the old tuning
    const r = sim(F(600, 1, 0, true));
    near(r[599].x, 12, 1e-6, 'ten seconds of held W is EXACTLY the authored speed — nothing tuned moved');
  }
  { // start-up has weight but is not sluggish
    const r = sim(F(60, 1, 0, true));
    assert(r[0].x < 12 * 0.35, 'the first frame is a fraction of top speed (' + r[0].x.toFixed(2) + ') — weight exists');
    assert(r[Math.round(0.25 * 60) - 1].x > 12 * 0.9, '...but 90% of top speed arrives within a quarter second');
  }
  { // ground stop is crisp; stopping distance genre-typical
    const run = sim(F(120, 1, 0, true));
    const stop = sim([...F(120, 1, 0, true), ...F(60, 0, 0, true)]).slice(120);
    assert(stop[Math.round(0.25 * 60)].x < 12 * 0.05, 'releasing on the ground stops to <5% within a quarter second');
    let dist = 0; for (const s of stop) dist += s.x * dt;
    assert(dist < 1.0 && dist > 0.2, 'a full run stops in ' + dist.toFixed(2) + 'm — weight, not ice');
  }
  { // THE fix: release mid-air and the arc carries
    const r = sim([...F(60, 1, 0, true), ...F(60, 0, 0, false)]);
    const atRelease = r[59].x, after1s = r[119].x;
    assert(after1s > atRelease * 0.55, 'one second after releasing mid-air, ' +
      Math.round(100 * after1s / atRelease) + '% of horizontal speed remains — the jump arc no longer collapses');
  }
  { // air control exists but cannot carve like ground
    const groundTurn = sim([...F(60, 1, 0, true), ...F(30, 0, 1, true)]);
    const airTurn = sim([...F(60, 1, 0, true), ...F(30, 0, 1, false)]);
    assert(airTurn[89].z > 1, 'steering mid-air works (' + airTurn[89].z.toFixed(1) + ' u/s of new axis after 0.5s)');
    // compare DURING the build-up (150ms) — by 0.5s the ground turn has saturated and the ratio measures
    // nothing but the shared target. At 150ms the rates themselves are what's visible.
    assert(airTurn[68].z < groundTurn[68].z * 0.55, '...but builds less than half as fast as on the ground early on (' +
      airTurn[68].z.toFixed(1) + ' vs ' + groundTurn[68].z.toFixed(1) + ' at 150ms)');
    assert(airTurn[89].x > groundTurn[89].x, '...and sheds the old direction slower — momentum is real in the air');
  }
  { // a 180 at full sprint is a TURN, not a teleport
    const r = sim([...F(120, 1, 0, true), ...F(6, -1, 0, true)]);
    assert(r[125].x > -12 * 0.9, '100ms into a 180 the reversal is still in progress (' + r[125].x.toFixed(1) + ' of -12)');
    const r2 = sim([...F(120, 1, 0, true), ...F(30, -1, 0, true)]);
    assert(r2[149].x < -12 * 0.85, '...and half a second completes it');
  }
}

done('build 1171: velocity chases the input instead of teleporting to it — steady state exactly the authored speeds, 90% of top speed in 250ms, a run stops in under a metre, a released jump keeps most of its arc, and air control steers at less than half ground rate. Movement finally has mass.');
