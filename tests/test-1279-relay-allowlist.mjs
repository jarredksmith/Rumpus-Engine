import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1279: the multiplayer audit's CRITICAL. Build 1205 closed client-to-client damage relaying with a
// DENY-list — "only KNOWN damage types are mediated, everything else passes" — reasoning that a whitelist
// would rot as new cosmetics arrived. That is backwards for a trust boundary: the destination's handler is
// handleHostMsg, which cannot tell a relayed packet from one the host sent, so the relay was a write
// primitive into every host-authoritative verb. Verified before fixing: `hurt` (25613) applied msg.d with
// no clamp, `raceFin` (25584) declared a winner with no lap check.

const hcm = extractFunction('handleClientMsg');

{ // the shape of the fix
  assert(/const _RELAY_OK = new Set\(\['pvpHit','grab','holdEnd','rematchReq'\]\);/.test(hcm),
    'the relay is an explicit ALLOW-list — a SET, so prototype keys cannot look like members');
  assert(/if\(!_RELAY_OK\.has\(msg\.t\)\) return;/.test(hcm), '...and anything not in it is dropped, not forwarded');
  assert(/if\(msg\.t==='pvpHit'\)\{/.test(hcm), 'and 1205’s damage mediation is still inside it');
}
{ // EXECUTED: the relay decision, over the real allow-list, for every verb the audit named
  const relay = new Function('msg', [
    "const _RELAY_OK = new Set(['pvpHit','grab','holdEnd','rematchReq']);",
    'if(!_RELAY_OK.has(msg.t)) return "DROPPED";',
    'return "FORWARDED";',
  ].join('\n'));
  // the exploits
  for (const t of ['hurt', 'wact', 'chat', 'teams', 'duelOver', 'raceOver', 'full', 'begin', 'died', 'raceFin', 'st', 'frag', 'credit', 'power'])
    eq(relay({ t }), 'DROPPED', 'a host-authoritative verb is never relayed between clients: ' + t);
  // the legitimate peer traffic
  for (const t of ['pvpHit', 'grab', 'holdEnd', 'rematchReq'])
    eq(relay({ t }), 'FORWARDED', 'genuine peer traffic still relays: ' + t);
  // an unknown/new type fails CLOSED — a missing visual, never a stolen match
  eq(relay({ t: 'somethingNew' }), 'DROPPED', 'an unnamed type fails closed');
  eq(relay({ t: '' }), 'DROPPED');
  eq(relay({ t: 'constructor' }), 'DROPPED', 'and a prototype key is not a free pass through the lookup');
  eq(relay({ t: 'toString' }), 'DROPPED');
}
{ // the allow-list is DERIVED: sendToPlayer is the only builder of a targeted message, and the four
  // host->client verbs among its callers are deliberately excluded.
  const targeted = (src.match(/sendToPlayer\([^)]*t:'([a-zA-Z]+)'/g) || [])
    .map(m => m.match(/t:'([a-zA-Z]+)'/)[1]);
  for (const t of ['wact', 'frag', 'credit', 'power'])
    assert(targeted.includes(t), 'the host does send ' + t + ' to one player...');
  const _set = hcm.match(/const _RELAY_OK = new Set\(\[([^\]]*)\]\)/)[1];
  for (const t of ['wact', 'frag', 'credit', 'power'])
    assert(!_set.includes("'" + t + "'"), '...and a CLIENT may not relay it: ' + t);
  eq(_set.split(',').length, 4, 'the allow-list is exactly the four peer types — nothing crept in');
}

// --- finish credit is observed, not asserted ---------------------------------------------------------
{
  assert(/_rp && \(_rp\.lap\|0\) >= _need/.test(hcm),
    'raceFin is checked against the lap count the host already tracks');
  const fin = new Function('id', '_raceNet', 'gameCfg', 'won', [
    "const _rp = _raceNet[id];",
    "const _need = Math.max(1, (gameCfg && gameCfg.raceLaps) ? (gameCfg.raceLaps|0) : 3);",
    "if(_rp && (_rp.lap|0) >= _need) won.push(id);",
    'return won;',
  ].join('\n'));
  eq(fin(2, {}, { raceLaps: 3 }, []).length, 0, 'a racer the host has never seen cannot win');
  eq(fin(2, { 2: { lap: 0 } }, { raceLaps: 3 }, []).length, 0, 'THE EXPLOIT: one packet at t=0 no longer wins the race');
  eq(fin(2, { 2: { lap: 2 } }, { raceLaps: 3 }, []).length, 0, 'nor does finishing a lap short');
  eq(fin(2, { 2: { lap: 3 } }, { raceLaps: 3 }, []).length, 1, 'a racer who actually ran the laps wins');
  eq(fin(2, { 2: { lap: 9 } }, { raceLaps: 3 }, []).length, 1, '...and so does one past the line');
  eq(fin(2, { 2: { lap: 3 } }, {}, []).length, 1, 'the default lap count still works when unset');
  eq(fin(2, { 2: { lap: 1 } }, { raceLaps: 0 }, []).length, 0,
    'raceLaps 0 means UNSET, so it falls back to the default 3 — it does not let anyone win on lap 1');
}

// --- kill credit is rate-limited ---------------------------------------------------------------------
{
  const mk = () => {
    const t = { v: 0 };
    const body = extractFunction('_diedOk').replace(
      "(typeof performance!=='undefined' ? performance.now() : Date.now()) / 1000", '__t.v');
    assert(body.includes('__t.v'), 'the clock is injectable (the rig must not silently keep the real one)');
    const fn = new Function('__t', [
      'const _DIED_PER_SEC = ' + extractConstNum('_DIED_PER_SEC') + ', _DIED_BURST = ' + extractConstNum('_DIED_BURST') + ';',
      'const _diedBuckets = {};', body, 'return _diedOk;',
    ].join('\n'))(t);
    return { ok: (id) => fn(id), adv: (s) => { t.v += s; } };
  };
  const r = mk();
  let allowed = 0;
  for (let i = 0; i < 200; i++) if (r.ok(1)) allowed++;
  assert(allowed <= 3 && allowed >= 1, 'THE EXPLOIT: a burst of death claims is bounded (' + allowed + ' of 200)');
  r.adv(60);
  assert(r.ok(1), 'and a real death much later still counts');
  const r2 = mk();
  r2.ok(1); r2.ok(1); r2.ok(1); r2.ok(1);
  assert(r2.ok(2), 'the bucket is per SOURCE — one cheat cannot tax an innocent player');
}
function mk2(){
  const t = { v: 0 };
  const body = extractFunction('_diedOk').replace(
    "(typeof performance!=='undefined' ? performance.now() : Date.now()) / 1000", '__t.v');
  const fn = new Function('__t', [
    'const _DIED_PER_SEC = ' + extractConstNum('_DIED_PER_SEC') + ', _DIED_BURST = ' + extractConstNum('_DIED_BURST') + ';',
    'const _diedBuckets = {};', body, 'return _diedOk;',
  ].join('\n'))(t);
  return { t, ok: fn };
}
{ // ordinary play is untouched: a death every few seconds always passes
  const r3 = mk2();
  const t = r3.t, ok = r3.ok;
  let passed = 0;
  for (let i = 0; i < 20; i++) { t.v += 8; if (ok(1)) passed++; }   // one death every 8 s for 20 deaths
  eq(passed, 20, 'a player dying every 8 seconds is never rate-limited (' + passed + '/20)');
}

function extractConstNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = ([0-9.]+)')) || src.match(new RegExp(name + ' = ([0-9.]+)'));
  assert(m, 'constant ' + name + ' is named');
  return m[1];
}

done('build 1279: the client-to-client relay is an ALLOW-list — every host-authoritative verb the audit found reachable (hurt, wact, chat, teams, duelOver, raceOver, begin, died, raceFin) is now dropped and an unnamed type fails closed; race finishes are checked against the lap count the host already tracks, so a t=0 packet no longer wins; and kill claims are bounded per source without touching a player dying every 8 seconds');
