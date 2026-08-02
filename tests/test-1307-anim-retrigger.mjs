import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1307 — REPORTED, third time, and this sentence is the whole diagnosis:
//
//   "I can replicate it by rapidly hitting the left mouse button. It still deals damage, but doesn't play
//    the animation. If I click, wait a second, and click again, it doesn't freeze."
//
// A SWING IS AN EVENT. The state machine reports it as a STATE for as long as its clip lasts:
// `meleeAttack` calls `playOwnAnim('meleeHeavy', <the clip's own length>)`, and `updateOwnAvatar` returns
// that slot every frame until the window expires. The crowbar swings every 500 ms and a swing clip is
// typically ~1 s, so the SECOND swing arrives while the first is still being reported — the requested name
// never changes, `animState === key` short-circuits, and the clip is never replayed. Leave a gap and the
// event expires, the state falls back to idle, and the next click is a real transition. That is exactly
// "click, wait a second, click again" working while rapid clicking does not, and exactly why the damage
// (edge-driven) kept landing while the animation (level-driven) did not.
//
// REPRODUCED AND FIXED, measured on the real chain (tools/probe/melee-retrigger.mjs — a rigged body, real
// actions, the real meleeAttack -> playOwnAnim -> updateOwnAvatar -> setEnemyAnimState path, a 1.0 s swing
// clip against the crowbar's 500 ms fire rate):
//
//                                      swings   clip restarts   final clip time
//   before  rapid (500 ms)                9          0          ran on to 0.85, never replayed
//   before  rapid + Hold on Attack        9          1          1.00 — CLAMPED ON ITS LAST FRAME. Frozen.
//   before  spaced (1600 ms)              4          3          works
//   after   rapid                         8          6          alive
//   after   rapid + Hold on Attack        9          9          0.25, mid-swing
//   after   spaced                        4          4          works
//
// The two earlier attempts stand and were not enough: 1304 (a one-shot request must not stamp LoopOnce onto
// the looping slot it falls back to) and 1306 (the early return must not latch a stranded action). Neither
// is about RE-TRIGGERING, which is what rapid clicking does.

const ONESHOT = new Function('return ' + extractConst('_ANIM_ONESHOT', src) + ';')();
const FALL = new Function('return ' + extractConst('_ANIM_FALLBACK', src) + ';')();
const keyOf = new Function('_ANIM_FALLBACK', extractFunction('_stateActionKey') + '; return _stateActionKey;')(FALL);
const GRACE = +src.match(/const ANIM_LIVE_GRACE = (\d+);/)[1];

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
const rig = (now = { t: 100000 }) => {
  const acts = {}; for (const s of ['idle', 'walk', 'run', 'attack']) acts[s] = mkAct(s, 1);
  const v = { userData: { stateActions: acts, animCfg: { clipSpeed: {}, clipHold: {} }, animState: 'idle', animAt: 0 } };
  const body = { userData: { visual: v } };
  const set = new Function('THREE', '_ANIM_ONESHOT', '_ANIM_FALLBACK', '_ensureClipAction', '_stateActionKey', 'performance',
    extractFunction('_animLive') + '\nconst ANIM_LIVE_GRACE = ' + GRACE + ';\n' +
    extractFunction('setEnemyAnimState') + '; return setEnemyAnimState;')(
    THREE, ONESHOT, FALL, () => {}, keyOf, { now: () => now.t });
  acts.idle.enabled = true; acts.idle._w = 1; acts.idle.plays = 1;
  return { set, acts, v, body, now };
};

// ---------------------------------------------------------------- the swing really does resolve to a state
{
  // meleeAttack asks for meleeHeavy (a heavy weapon) or meleeCombo. Neither is a clip most models ship, so
  // it walks the fallback chain — and on a model with an attack clip it lands on `attack`, which is also
  // where the FIRING pose lands. That collision is what makes "already there" true for a second swing.
  const acts = { idle: 1, walk: 1, run: 1, attack: 1 };
  eq(keyOf(acts, 'meleeHeavy'), 'attack', 'a heavy swing resolves to the attack clip');
  eq(keyOf(acts, 'meleeCombo'), 'attack', '...and so does a light one');
  eq(keyOf(acts, 'attack@crowbar'), 'attack', '...and so does the per-weapon firing pose (build 1294)');
  eq(keyOf({ idle: 1 }, 'meleeHeavy'), 'idle', 'and on a model with no attack clip at all, everything lands on idle');
}

// ---------------------------------------------------------------- THE BUG, and the fix, executed
{
  const r = rig();
  r.set(r.body, 'meleeHeavy', true);                       // first swing
  eq(r.v.userData.animState, 'attack');
  const a = r.acts.attack;
  eq(a.plays, 1, 'the first swing plays the clip');
  a.time = 0.4;                                           // ...it is mid-swing when the next click lands
  r.now.t += 500;                                         // the crowbar's fire rate, inside the ~1 s window
  r.set(r.body, 'meleeHeavy', false);                     // WITHOUT the edge: the old behaviour
  eq(a.time, 0.4, 'a second swing reported as the same state does NOT replay — this is the reported bug');
  eq(a.plays, 1);
  r.set(r.body, 'meleeHeavy', true);                      // WITH the edge
  eq(a.time, 0, 'THE FIX: a new EVENT replays the clip even though the state name is unchanged');
  eq(a.plays, 2, '...a real replay, not a nudge');
  eq(a.fades, 0, '...and no crossfade — there is nothing to fade FROM but itself');
  eq(r.v.userData.animState, 'attack', '...and the state it holds is unchanged, which is correct');
}
{ // AND WITH HOLD ON ATTACK — the case that measured as a hard freeze
  const r = rig();
  r.v.userData.animCfg.clipHold.attack = true;
  r.set(r.body, 'meleeHeavy', true);
  const a = r.acts.attack;
  eq(a.loop, THREE.LoopOnce, 'a held swing plays once');
  a.time = 1;                                             // finished, clamped on its final frame
  r.now.t += 500;
  r.set(r.body, 'meleeHeavy', false);
  eq(a.time, 1, 'without the edge it stays clamped — the frozen pose, while every click still lands damage');
  r.set(r.body, 'meleeHeavy', true);
  eq(a.time, 0, 'with the edge it swings again');
  eq(a.plays, 2);
  eq(a.loop, THREE.LoopOnce, '...still a one-shot, so it is a swing and not a loop');
}
{ // the edge must not defeat build 1306's held-state rule when there is NO new event
  const r = rig();
  r.v.userData.animCfg.clipHold.attack = true;
  r.set(r.body, 'attack', true);
  const a = r.acts.attack; a.time = 1;
  r.v.userData.animAt = r.now.t - GRACE - 1;
  for (let i = 0; i < 50; i++) { r.now.t += 16; r.set(r.body, 'attack', false); }
  eq(a.plays, 1, 'a held pose with no new event stays exactly where it is — a corpse still stays down');
  eq(a.time, 1);
}
{ // an ordinary transition and an ordinary held state are untouched by the new argument
  const r = rig();
  r.set(r.body, 'run');                                    // no third argument at all — every other caller
  eq(r.v.userData.animState, 'run', 'callers that pass no edge behave exactly as before');
  eq(r.acts.run.plays, 1);
  eq(r.acts.idle.fades, 1, '...crossfading out of the old state');
}

// ---------------------------------------------------------------- one event fires ONCE, not every frame
{
  const seq = new Function('performance',
    'let _ownEvt = null, _ownEvtSeq = 0;\n' +
    extractFunction('playOwnAnim') + '; return { play:playOwnAnim, evt:()=>_ownEvt };')({ now: () => 1000 });
  seq.play('meleeHeavy', 900);
  const a = seq.evt();
  eq(a.slot, 'meleeHeavy');
  eq(a.until, 1900, 'the window is the clip’s own length (build 1062)');
  eq(a.n, 1, 'and the event carries a serial');
  seq.play('meleeHeavy', 900);
  eq(seq.evt().n, 2, 'a SECOND swing of the same slot is a different event — which is the whole point');
  seq.play('throw', 480);
  eq(seq.evt().n, 3, 'and so is any other one-shot: a grenade, an equip, a hit reaction');
  // the consumer only fires on a change, so a live event does not restart the clip every frame
  let fired = -1, restarts = 0;
  const evt = seq.evt();
  for (let i = 0; i < 40; i++) { if (evt.n !== fired) { fired = evt.n; restarts++; } }
  eq(restarts, 1, 'forty frames inside one event replay the clip ONCE');
}

// ---------------------------------------------------------------- the wiring
{
  const ua = extractFunction('updateOwnAvatar');
  assert(/let st, _restart = false;/.test(ua), 'the frame computes whether this is a new event');
  assert(/else if\(evtLive\)\{ st=_ownEvt\.slot;[\s\S]{0,140}if\(_ownEvt\.n !== _ownEvtFired\)\{ _ownEvtFired = _ownEvt\.n; _restart = true; \} \}/.test(ua),
    'a one-shot event (swing / throw / equip / hit-react) raises the edge exactly once');
  assert(/if\(lastShot !== _ownFireSeen\)\{ _ownFireSeen = lastShot; _restart = true; \}/.test(ua),
    'and so does every SHOT — a second round inside the 250 ms firing window must re-fire the pose');
  assert(/setEnemyAnimState\(a, st, _restart\);/.test(ua), '...which is what reaches the animator');
  // ordering: the edge is consumed where the state is chosen, before the animator is called
  assert(ua.indexOf('_ownEvtFired = _ownEvt.n') < ua.indexOf('setEnemyAnimState(a, st, _restart)'));
  assert(/let _ownEvtSeq = 0, _ownEvtFired = -1, _ownFireSeen = -1;/.test(src), 'the serials are module state');
  assert(/_ownEvt=null; _ownEvtFired=-1; _ownFireSeen=-1;/.test(src),
    'and a respawn clears them, so a fresh run cannot inherit a serial and swallow its first swing');
  const sa = extractFunction('setEnemyAnimState');
  assert(/function setEnemyAnimState\(body, state, restart\)\{/.test(sa), 'the animator takes the edge');
  assert(/const _same = \(v\.userData\.animState === key\);\n  if\(_same && !restart\)\{/.test(sa),
    '...and a new event bypasses the "already there" short-circuit');
  assert(/A STATE IS LEVEL-TRIGGERED\. AN EVENT IS EDGE-TRIGGERED\./.test(src),
    'the distinction the whole build rests on is stated once, where it is enforced');
  assert(/It still deals\n  \/\/ damage, but doesn't play the animation/.test(src),
    'and the report is recorded, including the half that pointed straight at it');
}

done('build 1307: a repeated one-shot replays — reported as "rapidly hitting the left mouse button freezes the animation; it still deals damage; click, wait a second, click again is fine". A swing is an EVENT that the state machine reports as a STATE for as long as its clip lasts, and the crowbar swings every 500 ms against a ~1 s clip — so the second swing arrived while the first was still being reported, the requested name never changed, and `animState === key` swallowed it. Damage is edge-driven and kept landing; the animation is level-driven and did not. Callers now say when a request is a NEW event, and a new event replays even when the resolved slot is unchanged. Measured on the real chain: rapid clicking went 0 clip restarts in 9 swings (and, with Hold on Attack, clamped dead on its final frame) to 9 in 9, while spaced clicking is unchanged at both cadences');
