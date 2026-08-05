// build 1397: a target that can report a HIT.
//
// Verified before building: a prop could signal `destroyed`, `interacted` and `contact`, and nothing else.
// So a shooting-range plate could only ever score by being DESTROYED — the exact opposite of what build 1390
// (a target that stays bolted down) and build 1391 (a target that comes back) exist for. "Hit the plate, +1"
// was unbuildable, and it is the first thing a range booth needs.
//
// The bridge to the graph was already there: the `emit` signal verb (build 1027) fires a named logic event.
// What was missing was a trigger, and a PAYLOAD — build 1221 gave the enemy events `#x/#z/#hp/#hpf` and the
// prop events never got them, so a graph could be told "a plate was hit" and could not ask where or how hard.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------- the payload, executed ----
{
  const fn = extractFunction('_propCtx');
  const ctx = new Function(fn + '\nreturn _propCtx;')();
  const prop = (x, z, hp, maxHp) => ({ position: { x, z }, userData: { hp, maxHp } });

  const c = ctx(prop(17.004, -25.006, 24, 60));
  eq(c.x, 17, 'the position is rounded to 2 dp, because a graph COMPARES these and an unrounded float ' +
    'never equals anything with == (build 1352\'s rule for the position stats)');
  eq(c.z, -25.01);
  eq(c.hp, 24, 'the prop\'s HP after the hit');
  eq(c.hpf, 0.4, '...and its fraction, which is what "the plate is below half" is written against');

  eq(ctx(prop(0, 0, 30, 0)).hpf, 0, 'a prop with no maxHp reports 0 rather than dividing by zero');
  eq(ctx(prop(0, 0, -5, 60)).hpf, 0, 'an over-killed prop clamps at 0, never negative');
  eq(ctx(prop(0, 0, 999, 60)).hpf, 1, '...and an over-healed one at 1');
  eq(ctx({ position: { x: 1, z: 2 }, userData: {} }).hp, 0, 'a prop with no HP at all reports 0, not NaN — ' +
    'one NaN silently poisons every later compare in the level (build 1169)');
}

// ------------------------------------------------- the context unwinds, even on a throw ----
{
  const fn = extractFunction('_lgPropEvent');
  { const s = new Function('const log = [];\nlet _lgCtx = { old: 1 };\n' +
      'function fireSignals(o, when){ log.push({ when, ctx: JSON.parse(JSON.stringify(_lgCtx)) }); }\n' +
      fn + '\nreturn { go: _lgPropEvent, log, peek: ()=>_lgCtx };')();
    s.go({}, 'damaged', { x: 3, hpf: 0.5 });
    eq(s.log[0].when, 'damaged', 'it fires the signal it was asked for');
    eq(s.log[0].ctx.x, 3, '...with the payload live during the cascade');
    eq(s.log[0].ctx.old, undefined, '...and the previous context REPLACED, not merged');
    eq(s.peek().old, 1, 'and unwound afterwards, so a later read cannot see a stale prop position');
  }
  { const s = new Function('let _lgCtx = { old: 1 };\n' +
      'function fireSignals(){ throw new Error("a signal action blew up"); }\n' +
      fn + '\nreturn { go: _lgPropEvent, peek: ()=>_lgCtx };')();
    let threw = false;
    try { s.go({}, 'damaged', { x: 3 }); } catch (e) { threw = true; }
    assert(threw, 'a throwing signal action still propagates (the caller wraps it)...');
    eq(s.peek().old, 1, '...and the context is STILL unwound — that is what the finally is for, and a leaked ' +
      'payload would silently misplace every later #here in the level');
  }
}

// ---------------------------------------------------- where it fires, and where it must not ----
{
  const fn = extractFunction('damageProp');
  assert(/_lgPropEvent\(obj, 'damaged', _propCtx\(obj\)\)/.test(fn), 'the hit event fires from damageProp');
  assert(fn.indexOf("_lgPropEvent(obj, 'damaged'") > fn.indexOf('obj.userData.hp -= dmg;'),
    'AFTER the damage lands, so #hp and #hpf describe the prop as the player just left it — firing first ' +
    'would report the health it had before the shot');
  assert(fn.indexOf("_lgPropEvent(obj, 'damaged'") < fn.indexOf('shatterProp(obj, point, dir, power, byId)'),
    '...and before the shatter branch, so the LETHAL hit reports as a hit too. The killing shot is a hit, ' +
    'and `destroyed` is a different question that fires beside it — a range scoring one point per hit must ' +
    'not silently drop the last one');
  assert(/if\(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\{\s*\n\s*try\{ _lgPropEvent\(obj, 'damaged'/.test(fn),
    'host/solo only, exactly like `destroyed` — a client\'s shot reaches the host as propHit and converges ' +
    'from there, and firing on both sides would double every score in co-op');

  // the destroyed fire gained the same payload, and that is deliberate rather than incidental
  const sh = extractFunction('shatterProp');
  assert(/_lgPropEvent\(obj, 'destroyed', _propCtx\(obj\)\)/.test(sh),
    'and `destroyed` carries the payload too — carrying it on one prop event and not the other is exactly ' +
    'the inconsistency this file keeps recording, and it changes nothing that works today because `#here` ' +
    'in a destroyed-chain resolved to NULL, which makes a verb do nothing and report it (build 1214)');
  assert(!/fireSignals\(obj, 'destroyed'\)/.test(src), 'the bare call it replaced is gone');
}

// ------------------------------------------------------------- it survives a save ----
// `when` is stored as `s.w` and round-tripped verbatim — there is no whitelist to add the value to, which
// is worth asserting rather than assuming: a sanitizer that silently dropped an unknown `when` would make
// this a feature that works until you save.
{
  assert(/\{ w:s\.when, d:s\.do, t:s\.target \}/.test(src), 'the trigger serializes verbatim...');
  eq((src.match(/\{ when:s\.w, do:s\.d, target:s\.t \}|\{ when:sg\.w, do:sg\.d, target:sg\.t \}/g) || []).length, 2,
    '...and both loaders read it back the same way, with no allow-list of trigger names anywhere between');
  assert(!/when *=== *'destroyed' *\|\| *[^)]*'interacted'/.test(src),
    'nothing filters the trigger by name, so a new one needs no loader change (which is why this build ' +
    'touches neither loader)');
}

// ------------------------------------------------------------------------ the door ----
{
  assert(/\['destroyed','On destroyed'\],\['damaged','On hit'\],\['interacted','On E'\],\['contact','On object placed'\]/.test(src),
    'the editor offers it, next to the event it is most easily confused with');
  assert(/\['emit','\\u2192 Logic event'\]/.test(src),
    'and the bridge to the graph it composes with is the one that was already there (build 1027)');
  for (const t of ['#x', '#z', '#hp', '#hpf'])
    assert(new RegExp("'" + t + "'").test(src), 'the payload token ' + t + ' is offered in the variable autocomplete');
}

// Probed live (tools/probe/target-onhit.mjs), driving the WHOLE chain rather than its ends — a real shot ->
// damageProp -> the `damaged` signal -> `emit` -> logicEvent -> an `On event` node -> Math nodes reading the
// payload. Build 1277 found six verbs that had shipped and never worked because only the ends were pinned:
//
//   fresh              score 0                    hp 60/60
//   1 rifle shot       score 1  #hpf 0.75         hp 45
//   3 shots            score 3  #hpf 0.25         hp 15
//   4th (LETHAL)       score 4  AND downs 1       hp 0     <- both events fire on the killing blow
//   reset, shoot again score 5                    hp 45    <- the plate comes back and reports again
//   dynamic crate      score 6                             <- not target-only; any damageable prop
//   payload            #x 17 and #hpf 0.40 exactly, and _lgCtx UNWOUND afterwards (no leak)
//   no signals         nothing fires at all
done('build 1397: a range target can report the shot instead of only its own destruction');
