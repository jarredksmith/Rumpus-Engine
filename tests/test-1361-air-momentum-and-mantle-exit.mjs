// build 1361: air control never BRAKES the player, and the mantle keeps momentum (feel critic #4 + #9).
//
// The airborne branch lerped velocity toward wish*sp — walk/sprint speed — so whenever the player was
// FASTER (slide-jump 21 m/s, blast-jump 30) holding forward DECELERATED them: nothing in the game exceeded
// ~12 m/s half a second after landing. Quake-derived projection: above the target speed along the wish the
// parallel term is zero (never negative); the perpendicular component keeps easing (course correction).
// Below the target the else branch is textually the old lerp. And the mantle: velocity is captured at the
// grab and restored x LEDGE_EXIT_KEEP along the pull direction at the pull-up exit; the held-forward pull
// delay drops 0.25 -> 0.08 s. The per-frame zeroing during the hang STAYS — a hang is stationary.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const K = {};
for (const [k, v] of src.match(/const MOVE_ACCEL_K=([\d.]+), MOVE_BRAKE_K=([\d.]+), MOVE_AIR_K=([\d.]+), MOVE_AIR_BRAKE_K=([\d.]+);/).slice(1)
  .map((v, i) => [['accel', 'brake', 'air', 'airBrake'][i], +v])) K[k] = v;
const KEEP = +src.match(/const LEDGE_EXIT_KEEP = ([0-9.]+);/)[1];
eq(KEEP, 0.7, 'the mantle exit keeps 70% of the arrival speed');

// ---------------------------------------------------------------- the REAL movement block, executed
const iB = src.indexOf('const _tx = wish.x * sp');
assert(iB > 0, 'the movement integration block exists');
const jB = src.indexOf('// build 874: side-scroll lane hold', iB);
assert(jB > iB, '...and ends where the lane hold begins');
const body = src.slice(iB, jB);
const stmts = body.slice(0, body.lastIndexOf('}'));   // started inside the bare block; strip its closing brace
const step = new Function('player', 'wish', 'sp', 'dt',
  'MOVE_ACCEL_K', 'MOVE_BRAKE_K', 'MOVE_AIR_K', 'MOVE_AIR_BRAKE_K', stmts);

const sim = (v0, frames, dtv) => {
  const player = { onGround: false, vel: { x: v0.x, y: 0, z: v0.z } };
  for (const f of frames) {
    player.onGround = !!f.g;
    const w = { x: f.wx || 0, z: f.wz || 0 };
    const L = Math.hypot(w.x, w.z); if (L > 1e-9) { w.x /= L; w.z /= L; }
    step(player, w, (f.sp != null ? f.sp : 12), dtv, K.accel, K.brake, K.air, K.airBrake);
  }
  return player.vel;
};
// the OLD model, for the below-target identity check and to quantify the defect the projection removes
const simOld = (v0, frames, dtv) => {
  const v = { x: v0.x, z: v0.z };
  for (const f of frames) {
    const w = { x: f.wx || 0, z: f.wz || 0 };
    const L = Math.hypot(w.x, w.z); if (L > 1e-9) { w.x /= L; w.z /= L; }
    const sp = (f.sp != null ? f.sp : 12);
    const _tx = w.x * sp, _tz = w.z * sp;
    const mvIn = w.x !== 0 || w.z !== 0;
    const k = f.g ? (mvIn ? K.accel : K.brake) : (mvIn ? K.air : K.airBrake);
    const _f = Math.min(1, k * dtv);
    v.x += (_tx - v.x) * _f; v.z += (_tz - v.z) * _f;
  }
  return v;
};
const F = (n, wx, wz, g, sp) => Array.from({ length: n }, () => ({ wx, wz, g, sp }));

{ // THE fix: a 21 m/s slide-jump holding forward lands FASTER than releasing
  const held = sim({ x: 21, z: 0 }, F(60, 1, 0, false, 14), 1 / 120);      // 0.5 s of held W, airborne
  const released = sim({ x: 21, z: 0 }, F(60, 0, 0, false, 14), 1 / 120);  // 0.5 s of no input (AIR_BRAKE)
  near(held.x, 21, 1e-9, 'holding forward above the target changes NOTHING — the parallel term is zero, not negative');
  assert(released.x < 21 && released.x > 21 * 0.7,
    'AIR_BRAKE is untouched — releasing still bleeds speed exactly as tuned (' + released.x.toFixed(1) + ' of 21)');
  assert(held.x > released.x, 'held forward now lands FASTER than released — momentum is preserved, not punished');
  const oldHeld = simOld({ x: 21, z: 0 }, F(60, 1, 0, false, 14), 1 / 120);
  assert(oldHeld.x < released.x, 'the defect this removes: the OLD lerp braked a held-forward slide-jump BELOW the released arc (' +
    oldHeld.x.toFixed(1) + ' held vs ' + released.x.toFixed(1) + ' released)');
  const blast = sim({ x: 30, z: 0 }, F(60, 1, 0, false, 14), 1 / 120);
  near(blast.x, 30, 1e-9, 'a 30 m/s blast-jump holding forward keeps all 30');
}

{ // course correction still turns the arc, and never reduces the speed along the wish
  const d = Math.SQRT1_2;
  const player = { onGround: false, vel: { x: 21, y: 0, z: 0 } };
  let minAlong = Infinity;
  for (let i = 0; i < 60; i++) {
    step(player, { x: d, z: d }, 14, 1 / 120, K.accel, K.brake, K.air, K.airBrake);
    minAlong = Math.min(minAlong, player.vel.x * d + player.vel.z * d);
  }
  assert(player.vel.z > 3, 'steering diagonally mid-flight turns the arc (' + player.vel.z.toFixed(1) + ' u/s of new axis after 0.5s)');
  near(minAlong, 21 * d, 1e-6, 'the speed ALONG the wish is invariant while above target — steering trades only perpendicular speed');
  // pure-perpendicular steering is below target along the wish, so it is the old air model verbatim
  const perp = sim({ x: 21, z: 0 }, F(60, 0, 1, false, 14), 1 / 120);
  const perpOld = simOld({ x: 21, z: 0 }, F(60, 0, 1, false, 14), 1 / 120);
  assert(perp.x === perpOld.x && perp.z === perpOld.z, 'a fully-perpendicular wish takes the old lerp path bit-for-bit');
  assert(perp.z > 1, '...and it steers (' + perp.z.toFixed(1) + ' u/s of new axis)');
}

{ // below the target the whole thing IS the old lerp — a walk-speed jump is byte-identical
  const dtv = 1 / 60;
  const pn = { onGround: false, vel: { x: 3, y: 0, z: 0 } };
  const vo = { x: 3, z: 0 };
  for (let i = 0; i < 120; i++) {
    step(pn, { x: 1, z: 0 }, 6, dtv, K.accel, K.brake, K.air, K.airBrake);
    const f = Math.min(1, K.air * dtv);
    vo.x += (6 - vo.x) * f; vo.z += (0 - vo.z) * f;
    assert(pn.vel.x === vo.x && pn.vel.z === vo.z, 'below-target airborne frame ' + i + ' is bit-identical to the old model');
  }
  // and the GROUNDED model is the same else branch — byte-identical accelerate AND brake
  const g1 = sim({ x: 0, z: 0 }, [...F(120, 1, 0, true), ...F(60, 0, 0, true)], dtv);
  const g2 = simOld({ x: 0, z: 0 }, [...F(120, 1, 0, true), ...F(60, 0, 0, true)], dtv);
  assert(g1.x === g2.x && g1.z === g2.z, 'the grounded model is untouched bit-for-bit');
}

{ // dt-stability: 20 Hz and 144 Hz agree, and a dt spike degrades instead of overshooting
  const d = Math.SQRT1_2;
  const run = (hz) => {
    const player = { onGround: false, vel: { x: 21, y: 0, z: 0 } };
    for (let i = 0; i < hz; i++) step(player, { x: d, z: d }, 14, 1 / hz, K.accel, K.brake, K.air, K.airBrake);
    return player.vel;
  };
  const a = run(20), b = run(144);
  const sa = Math.hypot(a.x, a.z), sb = Math.hypot(b.x, b.z);
  assert(Math.abs(sa - sb) / sb < 0.02, 'one second of diagonal steering lands within 2% at 20 vs 144 Hz (' +
    sa.toFixed(2) + ' vs ' + sb.toFixed(2) + ')');
  assert(Math.abs(Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)) < 0.04, '...and the headings agree');
  const spike = { onGround: false, vel: { x: 21, y: 0, z: 0 } };
  step(spike, { x: d, z: d }, 14, 0.5, K.accel, K.brake, K.air, K.airBrake);   // one monster frame: f clamps to 1
  assert(Math.hypot(spike.vel.x, spike.vel.z) <= 21 + 1e-9, 'a dt spike clamps — the perpendicular vanishes, nothing overshoots');
  near(spike.vel.x * d + spike.vel.z * d, 21 * d, 1e-9, '...and the along-wish speed survives it exactly');
}

// ---------------------------------------------------------------- the mantle
{ // the grab CAPTURES the arrival velocity, before the zeroing
  const iGrab = src.indexOf("_ledge = { ph:'hang'");
  assert(iGrab > 0, 'the grab record exists');
  const grabLine = src.slice(iGrab, src.indexOf('\n', iGrab));
  assert(/vx0:player\.vel\.x, vz0:player\.vel\.z/.test(grabLine), 'the grab captures the arrival velocity on the record');
  const iZero = src.indexOf('player.vel.x=0; player.vel.y=0; player.vel.z=0; sliding=false;', iGrab);
  assert(iZero > iGrab, '...BEFORE the grab zeroes the velocity, or it would capture zero');
}
{ // the hang is still stationary — the per-frame zeroing STAYS
  assert(/player\.vel\.x=0; player\.vel\.y=0; player\.vel\.z=0; player\.onGround=false;/.test(src),
    'the per-frame zeroing during hang+pull is untouched: a hang is stationary');
}
{ // the held-forward pull delay is 0.08, and the quarter-second wait is gone
  assert(/const _wantUp = _jPressed \|\| \(keys\[BINDS\.fwd\] && _ledge\.t>0\.08\) \|\| _ledge\.t>LEDGE_HANG_AUTO;/.test(src),
    'a held-forward pull starts at 0.08 s');
  assert(!/_ledge\.t>0\.25/.test(src), 'the 0.25 s dead-input wait is gone');
}
{ // the pull COMPLETION restores the captured speed — executed against the real statement
  const i2 = src.indexOf('if(_mt>=1){');
  assert(i2 > 0, 'the pull-completion statement exists');
  const j2 = src.indexOf('}', i2) + 1;
  const exit = new Function('_mt', '_ledge', 'player', 'LEDGE_EXIT_KEEP',
    'let _climbAnim = 1; ' + src.slice(i2, j2) + ' return { climb: _climbAnim, led: _ledge };');
  const mk = () => ({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, onGround: false });
  { // a sprint mantle exits at a run along the pull direction
    const led = { tx: 5, ty: 3, tz: 7, gx: 0.6, gz: 0.8, vx0: 12, vz0: 9 };   // arrival speed 15
    const player = mk();
    const r = exit(1, led, player, KEEP);
    near(player.vel.x, 0.6 * 15 * KEEP, 1e-9, 'exit velocity: x = gx * |v0| * keep');
    near(player.vel.z, 0.8 * 15 * KEEP, 1e-9, '...and z, along the PULL direction, not the arrival one');
    eq(player.pos.x, 5, 'the landing spot still lands'); eq(player.pos.y, 3, ''); eq(player.pos.z, 7, '');
    assert(player.onGround === true && r.led === null && r.climb === 0, 'the mantle still completes cleanly');
  }
  { // a pre-1361 record (no vx0/vz0) degrades to the old 0 m/s exit — never NaN
    const player = mk();
    exit(1, { tx: 1, ty: 1, tz: 1, gx: 1, gz: 0 }, player, KEEP);
    eq(player.vel.x, 0, 'an old record exits at exactly 0');
    eq(player.vel.z, 0, '...on both axes — the fallback is the old behaviour, not NaN');
  }
  { // below the threshold nothing fires
    const player = mk(); player.vel.x = 99;
    const r = exit(0.5, { tx: 1, ty: 1, tz: 1, gx: 1, gz: 0, vx0: 5, vz0: 0 }, player, KEEP);
    eq(player.vel.x, 99, 'mid-pull the completion does not run');
    assert(r.led !== null, '...and the ledge record survives');
  }
}

done('build 1361: airborne input can only ADD speed — a 21 m/s slide-jump held forward keeps all 21 and lands faster than released (the old lerp braked it below the released arc), steering turns the arc without touching along-wish speed, below-target and grounded frames are bit-identical to build 1171, and the mantle captures the arrival speed and returns 70% of it along the pull direction with the held-forward delay at 0.08 s.');
