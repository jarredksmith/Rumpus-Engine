// build 1130: the host stops taking a client's word for damage, or for who dealt it.
//
// Every damage packet from a client was applied verbatim:
//   applyPvpDamage(msg.d, msg.from)          — a client shooting the host
//   botHurt(b, msg.d)  with sameTeam(msg.from, ...)  — a client shooting a bot
//   damageProp(o, msg.d || 0, ...)           — a client shooting a prop
//   enemyHurt(en, msg.d, ...)                — a client shooting a co-op enemy
//   registerDuelKill(msg.by, id)             — a client reporting who killed it
//
// A client is a web page the player controls. `d` was whatever they typed into the console, so one
// packet with d:1e9 killed anything in the match; a NEGATIVE d healed the target, which is the same
// exploit wearing a hat. And `from` was whoever they claimed to be, which also slipped past every
// sameTeam() check and let them bank the kill credit under another name.
//
// A peer-to-peer host cannot re-simulate a client's shot, so full authority is off the table. What it
// can do is bound the claim, and that is what this does — without capping what an authored level may
// legitimately do, because the cap is DERIVED from the level's own numbers.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the cap is derived, not hardcoded
{
  const cap = extractFunction('_netDmgCap');
  assert(/for\(const k in WEAPONS\)/.test(cap), 'it walks the LEVEL\'s weapons');
  assert(/GRENADE\.damage/.test(cap), '...and its grenade, which a level also authors');
  assert(/HEADSHOT_MUL/.test(cap), 'headshots are legitimate');
  assert(/\* head \* 2 \* 4;/.test(cap), '...as is the 2x pickup, plus headroom for stacked upgrades the host cannot see');
  const fn = (WEAPONS, GRENADE, HEADSHOT_MUL) => new Function('WEAPONS', 'GRENADE', 'HEADSHOT_MUL', 'Math',
    cap + '; return _netDmgCap;')(WEAPONS, GRENADE, HEADSHOT_MUL, Math);
  eq(fn({ a:{dmg:10}, b:{dmg:95} }, { damage:80 }, 2)(), 95*2*2*4, 'the strongest weapon sets the cap');
  eq(fn({ a:{dmg:10} }, { damage:400 }, 2)(), 400*2*2*4, '...or the grenade, if a level authored a big one');
  // a level that authors NO weapons must still produce a usable cap rather than 0 or NaN
  const bare = fn({}, undefined, undefined)();
  assert(isFinite(bare) && bare > 0, 'an empty weapon table still yields a finite positive cap (' + bare + ')');
  // and it must never be so tight that an ordinary authored level is nerfed
  assert(fn({ s:{dmg:95} }, { damage:80 }, 2)() > 95*2*2, 'the cap sits above headshot-plus-pickup, so real play is untouched');
}

// ---------------------------------------------------------------- the clamp
{
  const fn = new Function('_netDmgCap', 'isFinite', 'Math', extractFunction('_netDmg') + '; return _netDmg;')(() => 1000, isFinite, Math);
  eq(fn(40), 40, 'an ordinary hit passes through unchanged');
  eq(fn(1000), 1000, 'exactly at the cap is allowed');
  eq(fn(1e9), 1000, 'the one-shot-kill packet is clamped to the cap');
  eq(fn(-500), 0, 'negative damage is dropped — it would HEAL the target');
  eq(fn(0), 0, 'zero is zero');
  eq(fn(NaN), 0, 'NaN is dropped, not propagated into a health value');
  eq(fn(Infinity), 0, 'Infinity is dropped');
  eq(fn('40'), 40, 'a numeric string still works (JSON round-trips are not always typed)');
  eq(fn(undefined), 0, 'a missing field is zero, not NaN');
  eq(fn(null), 0, '...and so is null');
  eq(fn({}), 0, 'an object is not damage');
}

// ---------------------------------------------------------------- every damage path goes through it
{
  const h = extractFunction('handleClientMsg');
  assert(/applyPvpDamage\(_netDmg\(msg\.d\), id\)/.test(h), 'pvpHit: clamped, and attributed to the CONNECTION');
  assert(!/applyPvpDamage\(msg\.d, msg\.from\)/.test(h), '...never to the claimed sender');
  assert(/enemyHurt\(en, _netDmg\(msg\.d\)/.test(h), 'co-op enemy damage is clamped');
  assert(/botHurt\(b, _netDmg\(msg\.d\)/.test(h), 'bot damage is clamped');
  assert(/damageProp\(o, _netDmg\(msg\.d\)/.test(h), 'prop damage is clamped');
  assert(!/damageProp\(o, msg\.d\|\|0/.test(h), '...replacing the `|| 0` that let a string or NaN through');
  // botHit's team check and kill credit both used the CLAIMED sender
  assert(/!sameTeam\(id, msg\.id\)/.test(h),
    'the bot team check uses the connection, so a claimed `from` cannot dodge friendly fire rules');
  assert(/registerDuelKill\(id, msg\.id\)/.test(h), '...and the kill credit goes to the connection');
  assert(!/sameTeam\(msg\.from, msg\.id\)/.test(h), 'msg.from is no longer trusted for the team check');
  assert(!/NET\.players\[msg\.from\]/.test(h), '...nor for looking the shooter up');
  // `died` is reported BY the victim, naming its killer — that name still has to be someone in the match
  assert(/const _by=\+msg\.by; if\(_by===0 \|\| NET\.conns\[_by\]\) registerDuelKill\(_by, id\);/.test(h),
    'a victim can only credit the host or a connected player, not an arbitrary id');
}
// build 1122's forwarding rule is the same principle, and must still hold
{
  const h = extractFunction('handleClientMsg');
  assert(/Object\.assign\(\{\}, msg, \{ from: id \}\)/.test(h),
    'a forwarded packet is still re-stamped with the verified sender (build 1122)');
}

// ---------------------------------------------------------------- declared before use
assert(src.indexOf('function _netDmg(') < src.indexOf('function handleClientMsg('),
  'the validator is declared above the handler that calls it');
assert(src.indexOf('function _netDmgCap(') < src.indexOf('function _netDmg('), '...and its cap above it');

done('build 1130: a client can no longer name its own damage, or somebody else as the one who dealt it');
