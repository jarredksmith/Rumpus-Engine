// build 1122: client-to-client messages reach the client they are addressed to.
//
// Multiplayer is a star: every client has exactly one peer, the host. sendToPlayer took an id, used
// it correctly on the host, and on a CLIENT ignored it entirely — "client's only peer is the host".
// But the PvP damage paths call it with the VICTIM's id (breach.html: the grenade blast loop, the
// car ram, the hitscan fallback). So a client shooting a second client sent {t:'pvpHit'} to the
// host, which applied it to itself: the wrong player took the damage, the right one took none, and
// any match past two humans was unplayable.
//
// The host is the only router a star has, so a client now addresses the message and the host
// forwards it — rewriting `from` to the connection's own verified id, so a client cannot attribute
// its damage to somebody else.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the send side
{
  const fn = extractFunction('sendToPlayer');
  assert(/NET\.mode==='host'/.test(fn) && /NET\.conns\[id\]/.test(fn), 'a host still sends straight down the addressed connection');
  assert(/Object\.assign\(\{ to:\+id \}, msg\)/.test(fn), 'a client stamps the destination onto the message');
  // executable: three identities, one host connection
  const mk = (mode, myId) => {
    const sent = [];
    const NET = { mode, myId, conn: { send: (m) => sent.push(m) }, conns: { 1: { send: (m) => sent.push(['c1', m]) }, 2: { send: (m) => sent.push(['c2', m]) } } };
    return { fn: new Function('NET', extractFunction('sendToPlayer') + '; return sendToPlayer;')(NET), sent };
  };
  {
    const { fn: send, sent } = mk('client', 1);
    send(2, { t: 'pvpHit', d: 40 });
    eq(sent.length, 1, 'the client sends one packet (to the host — it has no other peer)');
    eq(sent[0].to, 2, '...addressed to player 2');
    eq(sent[0].t, 'pvpHit', '...carrying the original message');
  }
  {
    const { fn: send, sent } = mk('client', 1);
    send(0, { t: 'grab', nid: 7 });
    assert(sent[0].to === undefined, 'a message meant for the host itself is not addressed onward');
    send(1, { t: 'x' });
    assert(sent[1].to === undefined, '...and neither is one a client sends to itself');
  }
  {
    const { fn: send, sent } = mk('host', 0);
    send(2, { t: 'pvpHit', d: 40 });
    eq(sent[0][0], 'c2', 'a host delivers directly to the addressed connection');
  }
}

// ---------------------------------------------------------------- the routing side
{
  const h = extractFunction('handleClientMsg');
  assert(/msg\.to != null && \+msg\.to !== 0 && \+msg\.to !== id/.test(h), 'the host forwards anything addressed to a third player');
  assert(/Object\.assign\(\{\}, msg, \{ from: id \}\)/.test(h),
    '...rewriting `from` to the connection\'s own id, so a client cannot forge the attacker');
  assert(/delete fwd\.to;/.test(h), '...and stripping the routing field before delivery');
  // executable: client 1 hits client 2 through the host
  const deliveredTo2 = [];
  const NET = { _seen: {}, conns: { 2: { send: (m) => deliveredTo2.push(m) } } };
  const calls = [];
  const stub = (n) => () => calls.push(n);
  // build 1130: the host clamps claimed damage through _netDmg before applying it, so the harness has
  // to supply it — pass it through unchanged here, since this test is about ROUTING, not the clamp.
  // build 1164 adds the rate budget around the clamp — also passed through unchanged, same reason
  const fn = new Function('NET', 'setRemoteState', 'enemies', 'applyPvpDamage', 'player', 'performance', '_netDmg', '_netDmgBudget',
    extractFunction('handleClientMsg') + '; return handleClientMsg;'
  )(NET, stub('setRemoteState'), [], stub('applyPvpDamage'), { extVel: {}, vel: {} }, { now: () => 0 }, (d) => +d || 0, (id, kind, d) => d);
  fn({ _pid: 1 }, { t: 'pvpHit', d: 40, to: 2, from: 99 });
  eq(deliveredTo2.length, 1, 'the packet reaches client 2');
  eq(deliveredTo2[0].d, 40, '...with its damage intact');
  eq(deliveredTo2[0].from, 1, '...attributed to the VERIFIED sender, not the claimed 99');
  assert(deliveredTo2[0].to === undefined, '...with the routing field removed');
  eq(calls.length, 0, 'and the host did not also apply it to itself — which is the entire bug');
  // a hit genuinely aimed at the host still lands on the host
  fn({ _pid: 1 }, { t: 'pvpHit', d: 12, from: 1 });
  eq(calls.filter(c => c === 'applyPvpDamage').length, 1, 'a pvpHit with no destination is the host\'s own');
  // an unknown destination must not vanish silently into a router that has no such peer
  const before = deliveredTo2.length;
  fn({ _pid: 1 }, { t: 'pvpHit', d: 5, to: 77 });
  eq(deliveredTo2.length, before, 'a packet for an unknown peer is not misdelivered');
}

// ---------------------------------------------------------------- the call sites this protects
{
  // every PvP damage path addresses a specific victim; that is why the id had to start meaning something
  const victims = [...src.matchAll(/sendToPlayer\(\+?id,\s*\{t:'pvpHit'/g)].length;
  assert(victims >= 3, 'the pvpHit paths address the victim by id (' + victims + ' sites)');
}

done('build 1122: a client shooting another client damages that client, not the host');
