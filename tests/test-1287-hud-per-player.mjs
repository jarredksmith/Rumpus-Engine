import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1287: the feature audit's third finding — HUD widgets could not show a per-player value, which
// kills every co-op shop and scoreboard. Build 1231 gave the graph per-player variables and taught the
// toast node to interpolate them; `_hwText`'s regex was `[\w#]+` with no `@`, so a widget bound to
// `coins@` matched nothing and rendered the literal text. And even had it parsed, the host→client mirror
// broadcast ONE scalar per name to every connection, so every player would have seen the HOST's value.
// Both halves were needed; either alone is still broken.

const key = new Function('NET', extractFunction('_hwVarKey') + '; return _hwVarKey;');

{ // a per-player name resolves against MY id, on host and client alike
  eq(key({ myId: 0 })('coins@'), 'coins@0', 'the host reads its own');
  eq(key({ myId: 3 })('coins@'), 'coins@3', 'a client reads its own');
  eq(key({ myId: 3 })('coins'), 'coins', 'a shared name is untouched');
  eq(key({ myId: 3 })('#i'), '#i', '...including the loop-index convention');
  eq(key({})('coins@'), 'coins@0', 'a missing id falls back to 0 rather than producing "coins@undefined"');
  eq(key({ myId: null })('coins@'), 'coins@0');
  eq(key({ myId: 2 })(''), '', 'an empty name never throws');
  eq(key({ myId: 2 })(null), null);
}
{ // DELIBERATELY NOT _lgVarKey. That keys on _lgCtx.pid — "the player this event is about" — which is
  // right inside a pulse and wrong for a HUD that draws every frame outside any event, where the pid is
  // whatever the last pulse left behind.
  // build 1411: the interpolation moved into `_hwInterp` so a world SIGN could share it — same
  // property, one address along, and now shared rather than copied.
  const t = extractFunction('_hwInterp');
  assert(/_hwVarKey\(k\)/.test(t), 'the widget resolver is used');
  assert(!/_lgVarKey/.test(t), '...and the graph one is not');
  assert(!/_lgVarKey/.test(extractFunction('_hwText')), '...at either address');
  assert(/NET\.myId/.test(extractFunction('_hwVarKey')), 'because it asks MY id, not the event context');
  assert(/deliberately NOT through _lgVarKey/.test(src), 'and the distinction is recorded, not left to be rediscovered');
}
{ // the regex admits `@`, matching the toast node it should always have matched
  const t = extractFunction('_hwInterp');   // build 1411: lifted out of _hwText, shared with the sign
  assert(/\\\{\(\[\\w#@\]\+\)\\\}/.test(t) || /\[\\w#@\]\+/.test(t), 'the HUD interpolation accepts a trailing @');
  // build 1402: the toast's own interpolation moved into `_lgName`, which every field that names something
  // shares. The class this asserts is the same one, at its new address.
  assert(/\[\\w#@\]\+/.test(extractFunction('_lgName')),
    '...the same class the toast node has used since build 1231');
}
{ // EXECUTED: interpolation end to end
  const run = (label, vars, myId) => new Function('logicVars', 'NET', 'w', '_hwFmtTimer', '_lgNum',
    extractFunction('_hwVarKey') + '\n' + extractFunction('_hwInterp') + '\n' + extractFunction('_hwText') + '; return _hwText(w);')(
    vars, { myId }, { kind: 'text', label }, () => '', () => 0);
  eq(run('Coins: {coins@}', { 'coins@0': 12, 'coins@3': 99 }, 0), 'Coins: 12', 'the host sees its own');
  eq(run('Coins: {coins@}', { 'coins@0': 12, 'coins@3': 99 }, 3), 'Coins: 99',
    'THE FIX: a different player sees a DIFFERENT number from the same widget');
  eq(run('Score: {score}', { score: 7 }, 3), 'Score: 7', 'shared names are unaffected');
  eq(run('{coins@}', {}, 2), '0', 'an unset per-player value reads 0, not NaN or the literal text');
  eq(run('Coins: {coins@} of {goal}', { 'coins@1': 5, goal: 10 }, 1), 'Coins: 5 of 10', 'both kinds in one label');
  eq(run('{coins@}', { 'coins@1': 3.14159 }, 1), '3.14', 'rounded to 2dp like every other widget value');
}
{ // the mirror sends each connection ITS OWN value
  const m = src.slice(src.indexOf("if(typeof NET!=='undefined' && NET.mode==='host' && _hwVars.length){"));
  const body = m.slice(0, m.indexOf('\n  }\n}'));
  assert(/k\.charAt\(k\.length-1\)==='@'/.test(body), 'per-player names are separated from shared ones');
  assert(/v\[k\]=\+logicVars\[k\+\(\+cid\|0\)\]\|\|0/.test(body),
    'THE OTHER HALF: each connection gets its own pid resolved into the value');
  assert(/let v=shared;/.test(body) && /if\(perP\.length\)\{ v=Object\.assign\(\{\}, shared\)/.test(body),
    'a level with no per-player widgets still sends ONE shared object, not a copy per connection');
  assert(/perP\.map\(k=>k\+':'\+\(\+logicVars\[k\+'0'\]\|\|0\)\)/.test(body),
    'and the change-detection signature includes them, or a per-player change would never be sent');
}
{ // the client stores under the key its OWN resolver will read
  const h = src.slice(src.indexOf("msg.t==='hudv'"), src.indexOf("msg.t==='hudv'") + 700);
  assert(/_hwVarKey==='function'\) \? _hwVarKey\(k\) : k/.test(h),
    'the client re-keys the bare name to its own id');
  assert(/host-resolved key instead would be wrong the moment ids differ/.test(h),
    '...and why sending the resolved key would have been wrong is written down');
  // executed: a client with id 3 receiving `coins@` must be able to read it back
  const store = new Function('logicVars', 'NET', 'msg',
    extractFunction('_hwVarKey') + '\n' +
    "for(const k in msg.v){ logicVars[(typeof _hwVarKey==='function') ? _hwVarKey(k) : k] = +msg.v[k]||0; } return logicVars;");
  const lv = store({}, { myId: 3 }, { v: { 'coins@': 99, score: 4 } });
  eq(lv['coins@3'], 99, 'the client can read the value its own widget asks for');
  eq(lv.score, 4, '...and a shared name lands unchanged');
  assert(!('coins@' in lv), '...with no stray bare key left behind');
}

done('build 1287: HUD widgets show per-player values — the interpolation accepts `@` like the toast node always did, resolves against MY id rather than the event context a HUD has no business reading, and the host→client mirror now sends each connection its own number instead of broadcasting the host\'s to everyone; both halves executed end to end, including a client re-keying the bare name it receives');
