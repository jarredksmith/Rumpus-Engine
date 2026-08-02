import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1304 — REPORTED FROM PLAY: "it freezes the animation on idle after I use the weapon a few times.
// The character just gets stuck in the idle position, no animation, but I can still move them around. If I
// run a distance away it picks back up and switches to the run animation and then it works again."
//
// setEnemyAnimState read `_holdDefault`, `_hold` and `_spd` from `state` — the name the CALLER asked for —
// and applied them to `next`, the action `_stateActionKey` actually RESOLVED. Those are the same thing only
// when the model ships a clip for the requested slot. When it does not, the request FALLS BACK, and a
// one-shot request landing on a looping slot stamps LoopOnce + clampWhenFinished onto that slot's action.
//
// `moveStop` is a one-shot, it is emitted the instant you stop moving, and on any model without a stop clip
// it falls back to `idle`. So idle played once, froze on its last frame, and stayed frozen — every later
// idle request hits the `animState === key` early return and never resets it. Running asks for a different
// key, which is why moving away recovers it.
//
// NOT REPRODUCED HEADLESS: the stock level's third-person body is the stylised capsule, which carries no
// stateActions at all, so there is nothing to freeze. This is reasoned from the code and driven here
// against the real fallback table.

const FALL = new Function('return ' + extractConst('_ANIM_FALLBACK', src) + ';')();
const ONESHOT = new Function('return ' + extractConst('_ANIM_ONESHOT', src) + ';')();
const keyOf = new Function('_ANIM_FALLBACK', extractFunction('_stateActionKey') + '; return _stateActionKey;')(FALL);

// ---------------------------------------------------------------- the premise, on the real tables
{
  assert(ONESHOT.has('moveStop'), 'moveStop is a one-shot');
  assert(!ONESHOT.has('idle'), '...and idle is not');
  eq(FALL.moveStop, 'idle', 'and moveStop falls back to idle — the two facts that collide');
  // a model that ships only the basics: the request resolves to idle
  const acts = { idle: 1, walk: 1, run: 1 };
  eq(keyOf(acts, 'moveStop'), 'idle', 'so on a model with no stop clip, moveStop RESOLVES to idle');
  // ...and there are more of these, not one
  const bad = [];
  for (const s of ONESHOT) { const k = keyOf(acts, s); if (!ONESHOT.has(k)) bad.push(s + '->' + k); }
  assert(bad.length >= 5,
    'many one-shot slots fall back to looping ones on a basic model (' + bad.length + '): ' + bad.slice(0, 6).join(', '));
  assert(bad.some(x => x.endsWith('->idle')), '...several of them onto IDLE itself, which is the reported symptom');
}

// ---------------------------------------------------------------- the fix, executed
const mk = () => {
  const clip = { duration: 1 };
  const act = (name) => ({ name, loop: 'repeat', clampWhenFinished: false, time: 0, enabled: false, weight: 0,
    reset() { this.time = 0; return this; }, setEffectiveTimeScale(s) { this.spd = s; return this; },
    setEffectiveWeight(w) { this.weight = w; return this; }, play() { this.played = (this.played || 0) + 1; return this; },
    crossFadeTo() { return this; }, getClip: () => clip });
  const acts = { idle: act('idle'), walk: act('walk'), run: act('run'), attack: act('attack'), die: act('die') };
  const body = { userData: { visual: { userData: { stateActions: acts, animCfg: { clipSpeed: {}, clipHold: {} } } } } };
  const fn = new Function('THREE', '_ANIM_ONESHOT', '_ANIM_FALLBACK', '_ensureClipAction', '_stateActionKey',
    extractFunction('setEnemyAnimState') + '; return setEnemyAnimState;')(
    { LoopOnce: 'once', LoopRepeat: 'repeat' }, ONESHOT, FALL, () => {}, keyOf);
  return { fn, acts, body, cfg: body.userData.visual.userData.animCfg, v: body.userData.visual };
};
{
  const t = mk();
  t.fn(t.body, 'moveStop');
  eq(t.v.userData.animState, 'idle', 'the request resolves to idle');
  eq(t.acts.idle.loop, 'repeat',
    'THE FIX: idle KEEPS LOOPING — a one-shot request must never make the slot it falls back to a one-shot');
  eq(t.acts.idle.clampWhenFinished, false, '...and never clamps on its last frame');
}
{ // a one-shot that really does resolve to itself still behaves like one
  const t = mk();
  t.fn(t.body, 'die');
  eq(t.v.userData.animState, 'die', 'die resolves to its own clip');
  eq(t.acts.die.loop, 'once', '...and plays once');
  eq(t.acts.die.clampWhenFinished, true, '...holding its final frame, which is what death should do');
}
{ // an ordinary looping state is untouched
  const t = mk();
  t.fn(t.body, 'run');
  eq(t.acts.run.loop, 'repeat');
  eq(t.acts.run.clampWhenFinished, false);
}
{ // A CREATOR'S EXPLICIT OVERRIDE STILL WINS, under either name
  const t = mk();
  t.cfg.clipHold.moveStop = true;                       // authored against the REQUESTED name
  t.fn(t.body, 'moveStop');
  eq(t.acts.idle.loop, 'once', 'an override on the requested name is honoured');
  const u = mk();
  u.cfg.clipHold.idle = true;                           // authored against the RESOLVED slot
  u.fn(u.body, 'moveStop');
  eq(u.acts.idle.loop, 'once', '...and so is one on the slot it resolves to');
  const w = mk();
  w.cfg.clipHold.moveStop = false; w.cfg.clipHold.idle = true;
  w.fn(w.body, 'moveStop');
  eq(w.acts.idle.loop, 'repeat', 'the requested name is checked FIRST, so the more specific one wins');
}
{ // AND IT REPAIRS BUILD 1294's PER-WEAPON SPEED, which had been missing every lookup here
  const t = mk();
  t.cfg.clipSpeed['attack@crowbar'] = 0.5;
  t.fn(t.body, 'attack@crowbar');
  eq(t.v.userData.animState, 'attack', 'a per-weapon variant resolves to its base slot');
  eq(t.acts.attack.spd, 0.5, '...and its OWN speed is applied — before this it fell through to 1 silently');
  const u = mk();
  u.cfg.clipSpeed.attack = 2;
  u.fn(u.body, 'attack@crowbar');
  eq(u.acts.attack.spd, 2, 'with no per-weapon entry, the base slot’s speed applies');
  const w = mk();
  w.cfg.clipSpeed['attack@crowbar'] = 0.5; w.cfg.clipSpeed.attack = 2;
  w.fn(w.body, 'attack@crowbar');
  eq(w.acts.attack.spd, 0.5, '...and the per-weapon one wins when both exist');
}
{ // clamps still apply to the speed, whichever name supplied it
  const t = mk();
  t.cfg.clipSpeed['attack@crowbar'] = 99;
  t.fn(t.body, 'attack@crowbar');
  eq(t.acts.attack.spd, 4, 'an absurd authored speed is clamped');
  const u = mk();
  u.cfg.clipSpeed.idle = 0;
  u.fn(u.body, 'moveStop');
  eq(u.acts.idle.spd, 0.1, '...at both ends');
}

// ---------------------------------------------------------------- the shape
{
  const fn = extractFunction('setEnemyAnimState');
  assert(/const _holdDefault = _ANIM_ONESHOT\.has\(key\);/.test(fn),
    'the loop mode comes from the RESOLVED slot');
  assert(!/_ANIM_ONESHOT\.has\(state\)/.test(fn), '...not from the requested name');
  assert(/const _pick = \(m\) => \(m && m\[state\] != null\) \? state : key;/.test(fn),
    'and an authored override is looked up under the requested name first, the resolved slot second');
  assert(/A one-shot request must never make the slot it falls back to a one-shot\./.test(src),
    'the rule is stated in one line where it is enforced');
  assert(/which is\n  \/\/ why moving away "picks it back up"/.test(src),
    'and the reported symptom is tied to the mechanism');
}

done('build 1304: a one-shot animation request no longer turns the slot it FALLS BACK TO into a one-shot — setEnemyAnimState read the loop mode, hold and speed from the name the caller asked for and applied them to the action it actually resolved, so `moveStop` (a one-shot, emitted the instant you stop moving) landing on `idle` on any model without a stop clip stamped LoopOnce+clamp onto IDLE, which froze on its final frame and stayed frozen because every later idle request hits the already-there early return. Running asks for a different key, which is exactly why the reporter found that moving away recovered it. Also repairs build 1294’s per-weapon clip speed, whose `attack@crowbar` entries had been missing every lookup here. NOT reproduced headless: the stock body carries no stateActions, so this is reasoned from the code and driven against the real fallback tables');
