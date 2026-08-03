import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1317 — gameplay audit F7, MED:
//
//   "The viewmodel block applies a vertical bob, ADS translation, recoil Z, reload dip, draw dip, melee
//    thrust. There is NO LOOK-SWAY — no lag/counter-rotation from mouse delta — and the camera itself has
//    no walk bob at all. The gun therefore tracks a flick with ZERO INERTIA, which is the single
//    most-noticed 'cheap' tell in a first-person game."
//
// Measured live through a real flick in the real frame loop (tools/probe/vm-sway.mjs): three frames of hard
// turn peaked the sway at 0.226 on frame 5, the gun swung 0.024 world units and counter-rotated 0.095 rad,
// and it was back at rest by frame ~26. A 180-degree flick clamped at 0.32 instead of throwing the gun off
// screen. ADS folded it from 0.084 to 0.013, and the comfort slider from 0.084 to 0.

const IN = +src.match(/const VM_SWAY_IN = ([0-9.]+);/)[1];
const K = +src.match(/const VM_SWAY_K = ([0-9.]+);/)[1];
const POS = +src.match(/const VM_SWAY_POS = ([0-9.]+);/)[1];
const ROT = +src.match(/const VM_SWAY_ROT = ([0-9.]+);/)[1];
const MAX = +src.match(/const VM_SWAY_MAX = ([0-9.]+);/)[1];

const rig = () => {
  const ST = { yaw: 0, pitch: 0 };
  const fn = new Function('ST', 'VM_SWAY_IN', 'VM_SWAY_K', 'VM_SWAY_MAX',
    'let _vmSwayX = 0, _vmSwayY = 0, _vmPrevYaw = null, _vmPrevPitch = 0;\n' +
    'const player = { get yaw(){ return ST.yaw; }, get pitch(){ return ST.pitch; } };\n' +
    extractFunction('_vmSwayStep') +
    '; return { step:_vmSwayStep, x:()=>_vmSwayX, y:()=>_vmSwayY, reset:()=>{ _vmSwayX=0; _vmSwayY=0; _vmPrevYaw=null; } };')(
    ST, IN, K, MAX);
  return { fn, ST };
};

// ---------------------------------------------------------------- the shape of a flick
{
  const { fn, ST } = rig();
  fn.step(1 / 60);
  eq(fn.x(), 0, 'the first frame only captures a reference — a fresh spawn does not swing the gun');
  // three frames of hard turn
  for (let i = 0; i < 3; i++) { ST.yaw -= 0.25; fn.step(1 / 60); }
  const peak = fn.x();
  /* yaw DECREASES turning left, so dy and the sway are negative — and `gun.rotation.y = sway * ROT` is then
     negative too, i.e. the gun turns RIGHT while the view turns left. That is the lag, and the sign is the
     whole point: this assertion had it backwards on the first run and the code was right. */
  assert(peak < 0, 'turning LEFT (yaw decreasing) throws the sway the other way — the gun lags behind the view');
  // ...and then it settles
  let n = 0;
  while (Math.abs(fn.x()) > Math.abs(peak) * 0.02 && n < 600) { fn.step(1 / 60); n++; }
  assert(n > 5 && n < 90, 'and returns to rest in ' + (n / 60).toFixed(2) + ' s — a lag, not a wobble');
  assert(Math.abs(fn.x()) <= Math.abs(peak) * 0.02, 'to under 2% of the peak…');
  for (let i = 0; i < 60; i++) fn.step(1 / 60);
  assert(Math.abs(fn.x()) < 1e-4, '…and a second later, to essentially zero');
}
{ // the direction is a COUNTER-rotation, on both axes
  const a = rig(); a.fn.step(1 / 60); a.ST.yaw -= 0.3; a.fn.step(1 / 60);
  const b = rig(); b.fn.step(1 / 60); b.ST.yaw += 0.3; b.fn.step(1 / 60);
  assert(a.fn.x() < 0 && b.fn.x() > 0, 'left and right throw it opposite ways');
  near(a.fn.x(), -b.fn.x(), 1e-12, '...symmetrically');
  const c = rig(); c.fn.step(1 / 60); c.ST.pitch += 0.3; c.fn.step(1 / 60);
  assert(Math.abs(c.fn.y()) > 0, 'and looking up swings it too');
  eq(c.fn.x(), 0, '...on its own axis only');
}

// ---------------------------------------------------------------- FRAME RATE, which the first cut got wrong
{
  // The same turn, over the same wall-clock, delivered in different numbers of frames. The FIRST version of
  // this build accumulated a per-frame impulse and decayed it, with a comment claiming frame-rate
  // independence "by construction" because the deltas sum to the same total. True of the deltas, false of
  // the result — measured at 0.110 in 3 frames against 0.156 in 24, a 42% spread. The analytic solution of
  // x' = -k*x + u is exact for a constant turn rate and gives one answer at any rate.
  const turn = (frames) => {
    const { fn, ST } = rig();
    fn.step(0.001);
    const per = 0.75 / frames, dt = 0.25 / frames;
    for (let i = 0; i < frames; i++) { ST.yaw -= per; fn.step(dt); }
    return fn.x();
  };
  const ref = turn(15);
  for (const f of [3, 6, 12, 24, 60]) near(turn(f), ref, 1e-9,
    'the same 0.75 rad turn over 0.25 s leaves the same sway in ' + f + ' frames');
  assert(/x  <-  x\*e\^\(-k dt\) \+ \(u\/k\)\*\(1 - e\^\(-k dt\)\)/.test(src), 'the analytic step is written out');
  assert(/const e = Math\.exp\(-VM_SWAY_K \* _dt\), g = \(1 - e\) \* VM_SWAY_IN \/ VM_SWAY_K;/.test(src),
    '...and implemented');
  assert(/dy \/ _dt\) \* g;      \/\* dy\/_dt is the turn RATE — the driving term \*\//.test(src),
    'driven by the turn RATE, which is what makes it a rate equation rather than a pile of impulses');
  assert(/That is\n\/\/ true of the deltas and false of the RESULT/.test(src),
    'and the wrong claim it replaced is recorded, with the measurement that killed it');
}
{ // a steady turn reaches a steady offset — the gun trails at a fixed distance, it does not run away
  const { fn, ST } = rig();
  fn.step(1 / 60);
  for (let i = 0; i < 300; i++) { ST.yaw -= 3 / 60; fn.step(1 / 60); }   // 3 rad/s, five seconds
  near(fn.x(), -3 * IN / K, 1e-6, 'a constant 3 rad/s turn settles at rate*gain/k — the trail is bounded by design');
}

// ---------------------------------------------------------------- it cannot leave the screen
{
  const { fn, ST } = rig();
  fn.step(1 / 60);
  for (let i = 0; i < 8; i++) { ST.yaw -= Math.PI / 4; fn.step(1 / 60); }   // a 360 in eight frames
  assert(Math.abs(fn.x()) <= MAX + 1e-9, 'a full spin clamps at ' + MAX + ' rather than throwing the gun off screen');
  // and crossing +/-PI is not mistaken for a full-circle flick
  const b = rig(); b.fn.step(1 / 60);
  b.ST.yaw = Math.PI - 0.01; b.fn.step(1 / 60);
  const before = Math.abs(b.fn.x());
  b.ST.yaw = -Math.PI + 0.01; b.fn.step(1 / 60);   // 0.02 rad of real motion, 6.26 of naive difference
  assert(Math.abs(b.fn.x()) < before + 0.05,
    'crossing the yaw wrap is a small movement, not a spin — the delta is unwrapped');
  assert(/dy = Math\.atan2\(Math\.sin\(dy\), Math\.cos\(dy\)\);/.test(src), '...which is what the unwrap does');
}

// ---------------------------------------------------------------- how the viewmodel consumes it
{
  assert(/const _swX = _vmSwayX \* sway, _swY = _vmSwayY \* sway;/.test(src),
    'the sway is scaled by the same factor the bob uses');
  assert(/gun\.position\.x = aimX \* adsBlend \+ moveX \+ _swX \* VM_SWAY_POS;/.test(src), 'it moves the gun…');
  assert(/gun\.rotation\.y = ADS_ROT\.y\*adsBlend \+ _swX \* VM_SWAY_ROT;/.test(src), '…and turns it…');
  assert(/gun\.rotation\.z = ADS_ROT\.z\*adsBlend \+ _swX \* VM_SWAY_ROT \* 0\.6;   \/\* a flick rolls the wrist as well as turning it \*\//.test(src),
    '…and rolls it, because a wrist does');
  assert(/rides ON TOP of every existing term rather than replacing any of them/.test(src),
    'and it adds to the existing terms rather than replacing them');
  // ADS folds it out — a scoped weapon lagging behind the crosshair would be a worse defect
  assert(/const sway = \(1 - adsBlend\*0\.85\) \* _a11ySway;/.test(src), 'ADS folds it to 15%…');
  assert(/a scoped\n     weapon that lagged behind the crosshair would be a different and worse defect/.test(src), '…for a stated reason');
}
{ // BUILD 1313's COMFORT SETTING REACHES IT. The viewmodel is 11% of the screen and the most persistent
  // moving thing in it; a player who turned camera sway down and still got a swaying gun would reasonably
  // conclude the setting did nothing.
  assert(/const _a11ySway = \(typeof a11y!=='undefined'\) \? a11y\.sway : 1;/.test(src),
    'the motion-comfort sway setting scales the viewmodel too');
  assert(/the viewmodel is 11% of the screen and the most persistent moving thing in it/.test(src),
    '...with the reason');
}
{ // the bob became a figure-8, and the vertical amplitude deliberately did NOT change
  assert(/const _bobA = \(wish\.length\(\)>0 \? 0\.012 : 0\.004\), _bobF = \(wish\.length\(\)>0 \? 10 : 2\);/.test(src),
    'the bob keeps its exact pre-1317 amplitude and frequency');
  assert(/const moveX = Math\.sin\(t\*_bobF\*0\.5\)\*_bobA\*0\.8 \* sway;/.test(src),
    '...and gains a horizontal component at half the frequency, which is what makes a bob a walk');
  assert(/The vertical amplitude is\n     deliberately unchanged — the audit called it near-invisible, but changing it is a taste judgement the\n     headless harness cannot settle/.test(src),
    'and the amplitude the audit complained about is left alone ON PURPOSE, with why');
}

done('build 1317 (gameplay audit F7): the weapon has inertia — the viewmodel had a bob, ADS, recoil, dips and a melee thrust but NO look-sway, so the gun tracked a flick with zero lag, which the audit calls the single most-noticed cheap tell in a first-person game. The sway is a first-order lag driven by the turn rate, solved ANALYTICALLY across the frame so it is genuinely the same at any refresh rate — the first cut accumulated per-frame impulses with a comment claiming independence "by construction", and measured 0.110 in 3 frames against 0.156 in 24, a 42% spread; that wrong claim and the measurement that killed it are recorded where the fix is. Verified live: a three-frame flick peaked at 0.226, swung the gun 0.024 units and counter-rotated 0.095 rad, and settled by frame 26; a 180 clamps rather than throwing the gun off screen; ADS folds it to 15% and build 1313’s comfort slider folds it to zero. The bob gained the horizontal half-frequency component that makes it a walk, and its vertical amplitude is deliberately untouched');
