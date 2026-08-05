// build 1231: per-player logic — the multiplayer-modes critic's root ceiling, first slice. Trigger
// volumes tracked ONE anonymous union boolean over every player, so "who stepped on the pad" was
// unaskable: the second player's entry was invisible and one player leaving while another stayed
// produced no exit at all. Now every zone tracks edges PER ACTOR and fires the event with the
// player's identity (#pid/#team/#x/#z via 1221's context), onkill carries the KILLER's pid (a
// client's kill credits its player via _coopKillFor), and a variable named with a trailing '@'
// scopes to the event's player — 'coins@' inside a trigger tripped by player 3 is 'coins@3'.
// Solo resolves to '@0', so a per-player graph authored solo behaves identically alone.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- per-player variables, executed
const VARS = extractFunction('_lgVarKey') + '\n' + extractFunction('_lgNum');
{
  const r = new Function(
    'let _lgCtx = { pid: 3 }; const logicVars = { "coins@3": 7, "coins@5": 11, coins: 99, "#i": 4 };\n' +
    VARS + '\n' +
    'const at3 = { key: _lgVarKey("coins@"), val: _lgNum("coins@") };\n' +
    '_lgCtx = { pid: 5 };\n' +
    'const at5 = _lgNum("coins@");\n' +
    '_lgCtx = {};\n' +
    'const solo = _lgVarKey("coins@");\n' +
    'return { at3, at5, solo, plain: _lgNum("coins"), loop: (_lgCtx={pid:3}, _lgNum("#i")) };')();
  eq(r.at3.key, 'coins@3', 'a trailing @ scopes the name to the event\'s player');
  eq(r.at3.val, 7, '...and reads that player\'s value');
  eq(r.at5, 11, 'the same node reads a DIFFERENT player\'s value under a different context');
  eq(r.solo, 'coins@0', 'no player in context resolves to @0 — solo authoring behaves identically');
  eq(r.plain, 99, 'a plain name is untouched — every existing graph is byte-identical');
  eq(r.loop, 4, '...and the repeat loop\'s #i still falls through (the 1221 trap, still avoided)');
}

// ---------------------------------------------------------------- the per-actor trigger edges, executed
const TRIG = extractFunction('_trigStepActor') + '\n' + extractFunction('_trigStep');
const mk = () => new Function(TRIG + '\nreturn { _trigStepActor, _trigStep };')();
{
  const { _trigStepActor } = mk();
  const z = { on: 'enter', once: false }, st = { fired: 0 };
  const a = { inside: false, next: 0 }, b = { inside: false, next: 0 };
  eq(_trigStepActor(z, st, a, true, 1000), 1, 'player A entering fires');
  eq(_trigStepActor(z, st, b, true, 1000), 1, 'player B entering ALSO fires — the second entry is no longer invisible behind the union');
  eq(_trigStepActor(z, st, a, true, 1100), 0, '...and staying inside does not re-fire an enter');
}
{
  const { _trigStepActor } = mk();
  const z = { on: 'exit', once: false }, st = { fired: 0 };
  const a = { inside: true, next: 0 }, b = { inside: true, next: 0 };
  eq(_trigStepActor(z, st, a, false, 1000), 1, 'player A leaving fires an exit WHILE player B is still inside — the union could never see this');
  eq(_trigStepActor(z, st, b, true, 1000), 0, '...and B, still inside, fires nothing');
}
{
  const { _trigStepActor } = mk();
  const z = { on: 'enter', once: true }, st = { fired: 0 };
  const a = { inside: false, next: 0 }, b = { inside: false, next: 0 };
  eq(_trigStepActor(z, st, a, true, 1000), 1, 'once: the first player fires it');
  eq(_trigStepActor(z, st, b, true, 1000), 0, '...and the flag is ZONE-global — once means once, not once per player');
}
{
  const { _trigStepActor } = mk();
  const z = { on: 'inside', every: 1, once: false }, st = { fired: 0 };
  const a = { inside: false, next: 0 }, b = { inside: false, next: 0 };
  eq(_trigStepActor(z, st, a, true, 1000), 1, 'stay cadence: A ticks');
  eq(_trigStepActor(z, st, b, true, 1400), 1, '...B ticks on its own clock');
  eq(_trigStepActor(z, st, a, true, 1900), 0, '...A holds until ITS second is up');
  eq(_trigStepActor(z, st, a, true, 2001), 1, '...then ticks again');
}

// ---------------------------------------------------------------- the wiring
{
  const ut = (() => { const i = src.indexOf('function updateTriggerZones'); return src.slice(i, src.indexOf('function addTriggerZone', i)); })();
  assert(/_trigActors\.length=0;/.test(ut) && /_trigActors\.push\(\{ pid:\(typeof NET/.test(ut),
    'the actor list rebuilds in module scratch (1168) starting with the local player');
  assert(/pid:\+id, x:rp\.posEye\.x, y:rp\.posEye\.y-EYE, z:rp\.posEye\.z, dead:\(rp\.hp!=null && rp\.hp<=0\)/.test(ut),
    '...plus every connected player, dead ones marked');
  assert(/const inz = !ac\.dead && _trigContains\(z, ac\.x, ac\.y, ac\.z\);/.test(ut),
    'a dead player reads as OUTSIDE — dying on the hill fires the same exit edge as walking off it');
  assert(/_lgPlayerEvent\(z\.ev, \{ pid:ac\.pid, team:/.test(ut),
    'a player edge fires the event WITH identity');
  assert(/if\(_trigStep\(z, st, inside, now\) && typeof logicEvent==='function'\) logicEvent\(z\.ev\);/.test(ut),
    'the enemy path keeps the identityless union edge (an enemy has no pid; 40 per-enemy edges would spam the graph)');
  const pe = extractFunction('_lgPlayerEvent');
  assert(/const _pv=_lgCtx; _lgCtx=ctx\|\|\{\};/.test(pe) && /finally \{ _lgCtx=_pv; \}/.test(pe),
    '_lgPlayerEvent sets AND unwinds the context (1221\'s snapshot rule)');
  assert(/NET\.mode==='client'\) return;/.test(pe), '...host-authoritative like every event source');
}
{ // writes route through the key mapping everywhere
  const pulse = extractFunction('_lgPulse');
  // build 1269 added List and 1271 added Expression, both of which write a variable — the ASSERTION is
  // that every writing node scopes its key, so the count follows the nodes rather than pinning a number.
  eq((pulse.match(/_lgVarKey\(String\(p\.name\|\|''\)\.trim\(\)\)/g) || []).length, 5,
    'every variable-writing node by name (setvar/addvar/math/read/expr) scopes its key');
  assert(/const dst = _lgVarKey\(String\(p\.var\|\|''\)\.trim\(\)\)/.test(pulse),
    '...and List, which writes through `var` rather than `name`, scopes it too (build 1269)');
  assert(/const k = _lgVarKey\(String\(name\|\|''\)\.trim\(\)\)/.test(extractFunction('_lgList')),
    '...as do LIST NAMES themselves, so `hand@` is this player\u2019s hand');
  // build 1402: the toast's inline interpolation became `_lgName`, the ONE interpolator, which every field
  // that names something now shares. The property asserted here is unchanged and is now proven by execution
  // rather than by the shape of a regex literal.
  {
    const interp = new Function('logicVars', '_lgCtx', 'LG_NAME_MAX',
      extractFunction('_lgVarKey') + '\n' + extractFunction('_lgName') + '\nreturn _lgName;')(
        { 'coins@7': 12, coins: 999 }, { pid: 7 }, 64);
    eq(interp('you have {coins@}'), 'you have 12', 'toast interpolation accepts {coins@} and scopes it');
    eq(interp('you have {coins}'), 'you have 999', '...while a plain name is unscoped, as it always was');
    assert(/case 'toast': \{ const msg=_lgName\(/.test(pulse), '...and the toast is what routes through it');
  }
}
{ // onkill knows the killer
  const ke = extractFunction('killEnemy');
  assert(/const _kp=\(typeof _coopKillFor!=='undefined' && _coopKillFor!=null\) \? \+_coopKillFor :/.test(ke),
    'onkill credits the client whose shot killed (via _coopKillFor), else the host');
  assert(/pid:_kp, team:\(typeof NET!=='undefined' && NET\.teams && NET\.teams\[_kp\]!=null\)\?\+NET\.teams\[_kp\]:0/.test(ke),
    '...and carries pid + team in the context');
  assert(/'#pid','#team'/.test(src), 'both tokens are offered in the variable autocomplete');
}

done('build 1231: per-player logic, first slice — _lgVarKey/_lgNum executed proving @-scoping per event player with solo collapsing to @0 and plain names byte-identical, the per-actor trigger edges executed (second entry visible, exit-while-another-stays fires, once stays zone-global, per-actor stay clocks), dead players read as outside, the enemy union deliberately keeps no identity, all four writing nodes and toast scope their keys, and onkill carries the killer\'s pid/team via the existing co-op credit');
