import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1265: THE LEVEL GETS A SAY IN THE MATCH. The audit's gameplay CRITICAL was that the competitive
// loop is entirely engine-owned: the four PvP modes are a fixed enum and the score target is typed into
// the LOBBY, so a creator could build an arena but never a GAME — "this map is first-to-5 team
// deathmatch" was unsayable and every host had to be told the rules out of band.
//
// This does NOT open the enum (a new mode is a real build). It lets a level state which of the shipped
// modes it is FOR and what it is played to — a DEFAULT, never a lock, so the room still belongs to the
// people in it.

function rig(game = {}) {
  const body = [
    "const PVP_MODES = ['duel','ffa','tdm','cp'];",
    'const gameCfg = __g;',
    extractFunction('_lvlPvp'),
    extractFunction('_resolveMatch'),
    'return { _lvlPvp, _resolveMatch };',
  ].join('\n');
  return new Function('__g', body)(game);
}

{ // the level states its intent and hosting it does the right thing with no lobby input
  const r = rig({ pvp: 'tdm', pvpTarget: 5 });
  const m = r._resolveMatch('', 0);
  eq(m.mode, 'tdm', 'a level that says team deathmatch is hosted as team deathmatch');
  eq(m.target, 5, '...to the score it names — "first to 5" travels with the map');
}
{ // A DEFAULT, NOT A LOCK: a host who picks something still gets it
  const r = rig({ pvp: 'tdm', pvpTarget: 5 });
  eq(r._resolveMatch('ffa', 0).mode, 'ffa', 'the lobby mode wins over the level when the host picked one');
  eq(r._resolveMatch('tdm', 12).target, 12, 'and so does a lobby score target');
  eq(r._resolveMatch('coop', 0).mode, 'coop', 'a co-op lobby on a PvP level is the host’s call, not an error');
}
{ // the target belongs to the mode it was authored for
  const r = rig({ pvp: 'tdm', pvpTarget: 5 });
  eq(r._resolveMatch('ffa', 0).target, 0,
    'a target authored for TDM is NOT applied to a free-for-all the host chose instead — the number means something different there');
  eq(r._resolveMatch('tdm', 0).target, 5, '...but it does apply to the mode it was written for');
  const bare = rig({ pvpTarget: 7 });
  eq(bare._resolveMatch('ffa', 0).target, 7, 'a target with no stated mode applies to whatever PvP mode is played');
  eq(bare._resolveMatch('coop', 0).target, 0, '...but never to co-op, which has no score to win');
}
{ // silence stays silence — every existing level keeps the pre-1265 behaviour exactly
  const r = rig({});
  const m = r._resolveMatch('', 0);
  eq(m.mode, 'coop', 'a level that says nothing hosts as co-op, as it always did');
  eq(m.target, 0, 'and contributes no target');
  eq(rig({})._resolveMatch('ffa', 9).mode, 'ffa', 'the lobby is untouched by a silent level');
  eq(rig({})._resolveMatch('ffa', 9).target, 9);
}
{ // hostile / malformed level data can never widen the enum or the number
  const r = rig({ pvp: 'nuke', pvpTarget: 5 });
  eq(r._lvlPvp().mode, '', 'an unknown mode is discarded, not passed through to NET.gameMode');
  eq(r._resolveMatch('', 0).mode, 'coop', '...so a garbage mode falls back to co-op rather than a broken match');
  eq(rig({ pvpTarget: 1e9 })._lvlPvp().target, 999, 'an absurd target is clamped');
  eq(rig({ pvpTarget: -40 })._lvlPvp().target, 0, 'a negative one floors at 0 (= no target)');
  eq(rig({ pvpTarget: 'abc' })._lvlPvp().target, 0, 'and a non-number is 0, never NaN — a NaN target is a match that can never end');
  eq(rig({ pvp: '  tdm  ' })._lvlPvp().mode, 'tdm', 'whitespace around an authored mode is tolerated');
  eq(rig({ pvp: 3 })._lvlPvp().mode, '', 'a non-string mode is discarded');
  eq(rig({ pvpTarget: 4.7 })._lvlPvp().target, 5, 'a fractional target rounds — a score is a whole number');
}
{ // every shipped mode is sayable, and only those
  const r = rig({});
  for (const k of ['duel', 'ffa', 'tdm', 'cp'])
    eq(rig({ pvp: k })._lvlPvp().mode, k, k + ' is a mode a level may ask for');
  eq(r._lvlPvp().mode, '');
}

// --- wiring ------------------------------------------------------------------------------------------
{ // the host actually consults it, and the fallback cannot break a host that loads out of order
  const start = src.slice(src.indexOf('_resolveMatch(mode, killTarget)') - 400, src.indexOf('_resolveMatch(mode, killTarget)') + 320);
  assert(/NET\.gameMode = _m\.mode;/.test(start), 'the host starts the resolved mode, not the raw lobby one');
  assert(/if\(_m\.target>0\) killTarget = _m\.target;/.test(start),
    'and adopts the resolved target only when there is one — 0 must never wipe the lobby’s number');
  assert(/typeof _resolveMatch==='function'/.test(start), 'a missing resolver degrades to exactly the pre-1265 behaviour');
}
assert(/pvp: \(function\(\)\{ const v=String\(\(savedLevel&&savedLevel\.game&&savedLevel\.game\.pvp\)\|\|''\)\.trim\(\);/.test(src),
  'the loader sanitizes the authored mode against the same enum — a level file is untrusted input');
assert(/pvpTarget: Math\.max\(0, Math\.min\(999, Math\.round\(\+\(\(savedLevel&&savedLevel\.game&&savedLevel\.game\.pvpTarget\)\|\|0\)\)\)\)/.test(src),
  'and clamps the authored target on the way in as well as on the way out');
assert(/pvp: gameCfg\.pvp\|\|undefined, pvpTarget: gameCfg\.pvpTarget\|\|undefined/.test(src),
  'both serialize — and as undefined when unset, so a co-op level’s JSON does not grow two dead keys');
{ // the editor can say it, and the panel explains that it is a default rather than a lock
  assert(/Multiplayer intent/.test(src), 'the wave-settings panel hosts the control');
  assert(/The host can still change it in the lobby \\u2014 this is what the level asks for, not a lock\./.test(src),
    'the hint states the DEFAULT-not-a-lock rule, which is the whole design decision');
  assert(/\['tdm','Team deathmatch'\]/.test(src) && /\['','Host chooses \(default\)'\]/.test(src),
    'the dropdown offers the shipped modes plus an explicit "host chooses"');
  assert(/gameCfg\.pvpTarget=Math\.max\(0,Math\.min\(999,parseInt\(mtN\.value,10\)\|\|0\)\)/.test(src),
    'the number field clamps at the point of authorship too');
  assert(/pushUndoSnapshot/.test(src.slice(src.indexOf('mpSel.onchange'), src.indexOf('mpSel.onchange') + 200)),
    'changing the match intent is undoable like every other level edit');
}

done('build 1265: a level states its own PvP mode and score target — executed through the real resolver (level intent honoured, lobby always wins, a target scoped to the mode it was authored for, co-op silence unchanged, and every hostile value clamped)');
