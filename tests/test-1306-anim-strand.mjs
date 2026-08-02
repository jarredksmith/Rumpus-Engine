import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1306 — REPORTED AGAIN, after build 1304 claimed it:
//
//   "It is also freezing the animation on the idle after I use the weapon a few times. The character just
//    gets stuck in the idle position, no animation, but I can still move them around the screen. If I run a
//    distance away from the props I was hitting at, it picks back up and switches to the run animation."
//
// 1304's fix was real and stands (a one-shot request must not stamp LoopOnce onto the looping slot it falls
// back to). It was not enough, so this build does NOT name a third cause. It removes the thing that makes
// ANY stranded action permanent:
//
//   if(v.userData.animState === key) return;   // "already there"
//
// Everything else in this system is recomputed every frame and is therefore self-correcting. That one line
// is a LATCH. Once the current action stops running — three disables an action whose fade-out completes,
// a LoopOnce action stops advancing on its final frame, a zero-weight action writes no bones (which does
// not reset the skeleton, it FREEZES it) — the machine asks for the same state, recognises the name it
// already holds, and returns. Forever. Asking for a DIFFERENT state is the only escape, which is exactly
// why the reporter found that running away recovered it.
//
// Verified live on a real AnimationMixer with real actions (tools/probe/anim-strand.mjs): stranded four
// ways — disabled, clamped on its last frame, zero weight, paused — the real setEnemyAnimState repaired
// every one WITHOUT a state change; a healthy action was left byte-identical (time 0.42 preserved); a
// clamped death pose stayed down; and a state entered that instant, at weight 0 mid-crossfade, re-armed
// ZERO times in ten calls.

const ONESHOT = new Function('return ' + extractConst('_ANIM_ONESHOT', src) + ';')();
const FALL = new Function('return ' + extractConst('_ANIM_FALLBACK', src) + ';')();
const keyOf = new Function('_ANIM_FALLBACK', extractFunction('_stateActionKey') + '; return _stateActionKey;')(FALL);
const GRACE = +src.match(/const ANIM_LIVE_GRACE = (\d+);/)[1];

// ---------------------------------------------------------------- a mixer-shaped stub with real semantics
const THREE = { LoopOnce: 'once', LoopRepeat: 'repeat' };
const mkAct = (name, dur = 1) => ({
  name, loop: THREE.LoopRepeat, clampWhenFinished: false, time: 0, enabled: false, paused: false,
  _w: 0, plays: 0, fades: 0,
  reset() { this.time = 0; this.enabled = true; this.paused = false; return this; },
  setEffectiveTimeScale(s) { this.spd = s; return this; },
  setEffectiveWeight(w) { this._w = w; return this; },
  getEffectiveWeight() { return this.enabled ? this._w : 0; },
  getClip() { return { duration: dur }; },
  play() { this.plays++; return this; },
  crossFadeTo() { this.fades++; return this; },
});
const rig = (slots = ['idle', 'walk', 'run', 'attack', 'die'], nowRef = { t: 100000 }) => {
  const acts = {}; for (const s of slots) acts[s] = mkAct(s);
  const v = { userData: { stateActions: acts, animCfg: { clipSpeed: {}, clipHold: {} }, animState: 'idle', animAt: 0 } };
  const body = { userData: { visual: v } };
  const fn = new Function('THREE', '_ANIM_ONESHOT', '_ANIM_FALLBACK', '_ensureClipAction', '_stateActionKey', 'performance',
    extractFunction('_animLive') + '\nconst ANIM_LIVE_GRACE = ' + GRACE + ';\n' +
    extractFunction('setEnemyAnimState') + '; return { set:setEnemyAnimState, live:_animLive };')(
    THREE, ONESHOT, FALL, () => {}, keyOf, { now: () => nowRef.t });
  // start it the way a live avatar is: idle running, entered long ago
  acts.idle.enabled = true; acts.idle._w = 1; acts.idle.plays = 1;
  return { fn, acts, v, body, now: nowRef };
};
const STALE = (r) => { r.v.userData.animAt = r.now.t - GRACE - 1; };

// ---------------------------------------------------------------- the predicate itself
{
  const { fn } = rig();
  const a = mkAct('x'); a.enabled = true; a._w = 1;
  eq(fn.live(a), true, 'an enabled, weighted, looping action is live');
  a.enabled = false; eq(fn.live(a), false, 'three DISABLES an action whose fade-out completes — that is not live');
  a.enabled = true; a.paused = true; eq(fn.live(a), false, 'a paused action is not live');
  a.paused = false; a._w = 0; eq(fn.live(a), false, 'and neither is a zero-weight one — it writes no bones, which FREEZES the pose rather than resetting it');
  a._w = 1; a.loop = THREE.LoopOnce; a.time = 1;
  eq(fn.live(a), false, 'a LoopOnce action sitting on its final frame has stopped advancing');
  a.time = 0.5; eq(fn.live(a), true, '...but one still mid-clip has not');
  eq(fn.live(null), false, 'and nothing is not live');
}

// ---------------------------------------------------------------- THE REPORT, four ways to strand it
for (const how of ['disabled', 'clamped', 'zeroweight', 'paused']) {
  const r = rig(); STALE(r);
  const a = r.acts.idle;
  if (how === 'disabled') a.enabled = false;
  if (how === 'clamped') { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; a.time = 1; }
  if (how === 'zeroweight') a._w = 0;
  if (how === 'paused') a.paused = true;
  const plays0 = a.plays;
  r.fn.set(r.body, 'idle');            // the SAME state the machine already holds — the reported situation
  assert(a.plays > plays0, how + ': the stranded action is re-armed WITHOUT a state change');
  eq(a.enabled, true, how + ': enabled');
  eq(a.paused, false, how + ': running');
  eq(a.getEffectiveWeight(), 1, how + ': writing bones again');
  eq(a.loop, THREE.LoopRepeat, how + ': and looping');
  eq(a.fades, 0, how + ': with no crossfade — a re-arm has nothing to fade FROM but itself');
  eq(r.v.userData.animState, 'idle', how + ': the state it holds is unchanged');
}

// ---------------------------------------------------------------- and a HEALTHY state is left alone
{
  const r = rig(); STALE(r);
  const a = r.acts.idle; a.time = 0.42; const plays0 = a.plays;
  r.fn.set(r.body, 'idle');
  eq(a.time, 0.42, 'a running action keeps its exact phase — a per-frame restart would freeze it a different way');
  eq(a.plays, plays0, '...and is not replayed');
  // ...on every frame of a long idle, not just once
  for (let i = 0; i < 600; i++) { r.now.t += 16; r.fn.set(r.body, 'idle'); }
  eq(a.plays, plays0, 'ten seconds of standing still costs zero restarts');
  eq(a.time, 0.42);
}

// ---------------------------------------------------------------- a HELD state must stay held
{
  const r = rig(); STALE(r);
  r.fn.set(r.body, 'die');
  eq(r.v.userData.animState, 'die');
  const d = r.acts.die;
  eq(d.loop, THREE.LoopOnce, 'die plays once');
  eq(d.clampWhenFinished, true, '...and clamps');
  d.time = 1; STALE(r); const plays0 = d.plays;
  r.fn.set(r.body, 'die');
  eq(d.plays, plays0, 'A CORPSE STAYS DOWN — a held state finishing on its final frame is the point of holding, not a stall');
  eq(d.time, 1);
  // the same for a creator's explicit hold on an ordinary slot
  const r2 = rig(); r2.v.userData.animCfg.clipHold.idle = true; STALE(r2);
  r2.fn.set(r2.body, 'idle');
  r2.acts.idle.time = 1; STALE(r2); const p2 = r2.acts.idle.plays;
  r2.fn.set(r2.body, 'idle');
  eq(r2.acts.idle.plays, p2, 'an authored hold is honoured the same way — the engine must not fight the creator');
}

// ---------------------------------------------------------------- a fade-in must not be read as a stall
{
  // A state entered THIS INSTANT is mid-crossfade with its weight ramping from zero. Without the grace it
  // looks exactly like a stranded action, and the repair would restart it every frame — a worse freeze than
  // the one being fixed, and one that would only appear on fast machines.
  const r = rig();
  r.fn.set(r.body, 'run');
  const a = r.acts.run; a._w = 0;                       // the worst instant of the fade
  const plays0 = a.plays;
  for (let i = 0; i < 10; i++) { r.now.t += 16; r.fn.set(r.body, 'run'); }
  eq(a.plays, plays0, 'ten frames inside the crossfade window re-arm ZERO times');
  assert(GRACE > 180, 'and the grace is longer than the 180 ms crossfade it exists to cover (' + GRACE + 'ms)');
  // past the window, a genuinely dead action is still caught
  r.now.t += GRACE + 1;
  r.fn.set(r.body, 'run');
  assert(a.plays > plays0, '...and once the window passes, a zero-weight action is repaired');
}

// ---------------------------------------------------------------- an ordinary transition is unchanged
{
  const r = rig(); STALE(r);
  r.fn.set(r.body, 'run');
  eq(r.v.userData.animState, 'run', 'a real state change still changes state');
  eq(r.acts.run.plays, 1, '...plays the new action');
  eq(r.acts.idle.fades, 1, '...and crossfades out of the old one');
  eq(r.acts.run.time, 0, '...from the top');
  assert(r.v.userData.animAt > 0, 'and stamps when it was entered');
}
{ // build 1304 still holds: a one-shot request must not make the slot it falls back to a one-shot
  const r = rig(['idle', 'walk', 'run']); STALE(r);
  r.fn.set(r.body, 'moveStop');
  eq(r.v.userData.animState, 'idle', 'moveStop falls back to idle on a model with no stop clip');
  eq(r.acts.idle.loop, THREE.LoopRepeat, '...and idle keeps looping (build 1304)');
  eq(r.acts.idle.clampWhenFinished, false);
}

// ---------------------------------------------------------------- the shape
{
  const fn = extractFunction('setEnemyAnimState');
  assert(!/if\(v\.userData\.animState === key\) return;/.test(fn), 'the bare early return is gone');
  assert(/const _same = \(v\.userData\.animState === key\);/.test(fn), '...replaced by a liveness check');
  assert(/if\(_same\)\{\n    if\(_hold\) return;/.test(fn), 'a held state returns before the liveness test');
  assert(/if\(_held < ANIM_LIVE_GRACE \|\| _animLive\(next\)\) return;/.test(fn),
    '...and a recently-entered or genuinely-live one returns too');
  assert(/if\(!_same && cur && cur !== next\) cur\.crossFadeTo\(next, 0\.18, false\);/.test(fn),
    'a re-arm does not crossfade');
  assert(/v\.userData\.animState = key; v\.userData\.animAt = performance\.now\(\);/.test(fn),
    'and the entry time is stamped, which is what the grace measures');
  // the ordering that makes it possible: _hold is needed BEFORE the decision to return
  assert(fn.indexOf('const _hold =') < fn.indexOf('const _same ='),
    'the hold is resolved before the early return, or a corpse could be re-armed');
  assert(/Every other part of this system is\n  \/\/ re-evaluated every frame and therefore self-correcting; that one line is a LATCH\./.test(src),
    'why the latch is the bug rather than a third named cause is recorded');
  assert(/whatever stranded the action/.test(src), '...and the fix is honest about not having named one');
}
{ // the editor stopped lying about which slots hold their last frame
  eq((src.match(/: _ANIM_ONESHOT\.has\(stKey\);/g) || []).length, 2,
    'both animation tabs (player and enemy) default the hold box to the RUNTIME rule');
  assert(!/clipHold\[stKey\]!=null\) \? !!\w[\w.]*\.clipHold\[stKey\] : \(stKey==='die'\)/.test(src),
    'the old "only die holds" default is gone — it showed Reload, Jump land, Equip and Move stop as looping while the engine played them once');
}

done('build 1306: the animation state machine repairs itself — reported again after 1304, "stuck in the idle position, no animation, but I can still move; running away picks it back up". 1304 removed one route to a stranded action and the freeze survived it, so this build removes what makes ANY stranded action permanent: `if(animState === key) return` was a latch on a system that is otherwise recomputed every frame, so once the current action stopped running (three disables one whose fade-out completes, a LoopOnce clamps on its last frame, a zero-weight one writes no bones and freezes the pose) only asking for a DIFFERENT state could escape — which is exactly why running away recovered it. The early return now verifies the state it short-circuits is alive. A held state returns first, so a corpse stays down; a 260 ms grace covers the 180 ms crossfade, so a fade-in is never mistaken for a stall; and a healthy idle costs zero restarts over ten seconds. Verified live on a real mixer: stranded four ways, repaired every one with no state change, healthy action byte-identical');
