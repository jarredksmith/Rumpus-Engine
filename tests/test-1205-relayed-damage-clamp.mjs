// build 1205: the host bounds the RELAYED claim — client-vs-client damage cannot bypass the clamp.
//
// Builds 1130/1164 clamp damage aimed at the host, but a packet addressed to a THIRD client
// (handleClientMsg's build-1122 forward path) was relayed verbatim — so in any 3+ player FFA a cheat sent
// {t:'pvpHit', to:victim, d:1e9} and one-shot anyone, through walls, unrated. The host now runs a
// relayed pvpHit through the SAME magnitude cap (_netDmg) and per-SOURCE rate bucket (_netDmgBudget, keyed
// to the verified sender) it gives a host-addressed hit, and drops an over-budget or non-positive claim
// instead of forwarding it. Non-damage types still forward verbatim — the rule is "only KNOWN damage
// types are mediated", so a new cosmetic relay type is not silently blocked.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the forward path, executed
const CAP = 200;   // _netDmgCap derives from the WEAPONS table at runtime; the harness stubs it to this fixed value
const PVP = +src.match(/_DMG_RATE_PVP = (\d+)/)[1];

// build a tiny host with the real clamp helpers + the real forward branch of handleClientMsg
function mkHost() {
  const sent = {};   // destId -> [packets]
  const conns = { 1: { send: (m) => (sent[1] = sent[1] || []).push(m) },
                  2: { send: (m) => (sent[2] = sent[2] || []).push(m) } };
  const body =
    'let performanceNow=0; const performance={ now:()=>performanceNow };\n' +
    'const NET={ myId:0, conns, _seen:{} };\n' +
    'function _netDmgCap(){ return ' + CAP + '; }\n' +
    extractFunction('_netDmg') + '\n' +
    'const _dmgAcc={}; const _DMG_RATE_PVP=' + PVP + ', _DMG_RATE_PVE=1500;\n' +
    extractFunction('_netDmgBudget') + '\n' +
    // build 1279: the relay allow-list lives at module scope (one Set, not one per packet), so the rig
    // supplies it the same way it supplies the damage-budget state. Lifted from the real source rather
    // than restated, or this test would keep passing after someone widened it.
    src.match(/const _RELAY_OK = new Set\(\[[^\]]*\]\);/)[0] + '\n' +
    // a stripped handleClientMsg: the real forward branch, then a sentinel for "fell through to local handling"
    'function handleClientMsg(conn, msg){ const id=conn._pid;\n' +
    src.match(/if\(msg && msg\.to != null && \+msg\.to !== NET\.myId[\s\S]*?\n  \}/)[0] + '\n' +
    '  return "LOCAL"; }\n' +
    'return { handleClientMsg, conns, sent, tick:(ms)=>{ performanceNow+=ms; } };';
  return new Function('conns', 'sent', body)(conns, sent);
}

{ // the exploit packet is clamped, not relayed raw
  const h = mkHost();
  const relayed = h.handleClientMsg({ _pid: 1 }, { t: 'pvpHit', to: 2, d: 1e9 });
  assert(relayed !== 'LOCAL', 'a third-party-addressed packet is relayed, not handled locally');
  const pk = h.sent[2] && h.sent[2][0];
  assert(pk, 'the victim (client 2) receives a packet');
  assert(pk.d < 1e9, 'the 1e9 one-shot claim is CLAMPED, not forwarded raw');
  if (CAP) near(pk.d, Math.min(CAP, PVP), 1e-6, '...to the magnitude cap (first packet, bucket full)');
  eq(pk.from, 1, '...credited to the VERIFIED sender, never the claim');
  eq(pk.to, undefined, '...with the routing field stripped');
  assert(h.sent[1] === undefined, '...and nothing leaks back to the sender');
}
{ // the rate bucket drains: a burst cannot instakill
  const h = mkHost();
  let total = 0;
  for (let i = 0; i < 50; i++) { h.handleClientMsg({ _pid: 1 }, { t: 'pvpHit', to: 2, d: 1e9 }); }
  for (const pk of (h.sent[2] || [])) total += pk.d;
  near(total, PVP, 1e-6, '50 one-shot packets in one window relay at most the 1s PvP budget total — no instakill through the relay');
  assert((h.sent[2] || []).length < 50, '...and the over-budget packets are DROPPED, not forwarded at zero');
}
{ // build 1279: a legitimate PEER relay is untouched. This block used to use `fire`, which the
  // deny-list forwarded — but the host BROADCASTS fire from its own handler, so a targeted `fire` was
  // never real traffic, only something this test constructed. `grab` is peer traffic and is on the list.
  const h = mkHost();
  const relayed = h.handleClientMsg({ _pid: 1 }, { t: 'grab', to: 2, nid: 7 });
  assert(relayed !== 'LOCAL', 'a peer packet is relayed');
  const pk = h.sent[2][0];
  eq(pk.t, 'grab', '...verbatim (only damage types are mediated)');
  eq(pk.from, 1, '...with from rewritten to the verified sender');
  eq(pk.nid, 7, '...and its payload intact');
}
{ // ...and a type that is NOT peer traffic is dropped rather than forwarded — the 1279 inversion
  const h = mkHost();
  const relayed = h.handleClientMsg({ _pid: 1 }, { t: 'hurt', to: 2, d: 1e9 });
  assert(relayed !== 'LOCAL', 'it is still taken by the relay branch');
  eq((h.sent[2] || []).length, 0,
    'THE EXPLOIT 1205 LEFT OPEN: a host-authoritative verb addressed to a peer is now dropped, not forwarded');
  const h2 = mkHost();
  h2.handleClientMsg({ _pid: 1 }, { t: 'fire', to: 2, o: [0, 0, 0], d: [1, 0, 0], w: 'rifle' });
  eq((h2.sent[2] || []).length, 0, 'and so is a cosmetic the host broadcasts itself — it fails closed');
}
{ // a packet TO the host still falls through to local handling (unchanged)
  const h = mkHost();
  eq(h.handleClientMsg({ _pid: 1 }, { t: 'pvpHit', to: 0, d: 50 }), 'LOCAL', 'a host-addressed hit is handled locally, not relayed (the 1130 path)');
  eq(h.handleClientMsg({ _pid: 1 }, { t: 'st', p: [0, 0, 0] }), 'LOCAL', 'a normal state packet with no `to` is handled locally');
}

// ---------------------------------------------------------------- the wiring
{
  const fn = extractFunction('handleClientMsg');
  assert(/if\(msg\.t==='pvpHit'\)\{\s*\/\/ client-vs-client damage: clamp before relaying/.test(fn),
    'the relay branch special-cases pvpHit');
  assert(/const d = _netDmgBudget\(id, 'pvp', _netDmg\(msg\.d\)\);/.test(fn),
    '...through the same magnitude cap and per-source rate bucket as a host-addressed hit');
  assert(/if\(!\(d > 0\)\) return;/.test(fn), '...dropping an over-budget or non-positive claim instead of forwarding it');
  assert(/const fwd = Object\.assign\(\{\}, msg, \{ from: id, d \}\); delete fwd\.to;/.test(fn),
    '...and relaying the CLAMPED value, credited to the verified sender');
}

done('build 1205: the host bounds the relayed claim — a client-to-client pvpHit runs through the real magnitude cap and per-source rate bucket before relay (executed: a 1e9 one-shot is clamped, a 50-packet burst relays at most one window\'s budget and drops the rest, cosmetic relays pass verbatim, host-addressed hits still handle locally). The 3+ player FFA one-shot exploit is closed.');
