import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1329 — multiplayer audit 2.2, the one bullet builds 1130 / 1164 / 1279 left standing:
//
//   "{t:'buyChest', id} (25567) removes any crate for everyone."
//
// Re-verified against the current tree before touching anything, because the other two bullets of 2.2
// and the whole of 2.1 were already closed:
//   2.1 relay      CLOSED by 1279 — `_RELAY_OK` is an explicit allow-list of four COSMETIC types, so
//                  hurt / wact / teams / duelOver / chat impersonation are all dropped, not mediated
//   2.2 died       CLOSED by 1279 — `_diedOk(id)` rate-limits the claim
//   2.2 raceFin    CLOSED by 1279 — checked against the lap the host was already tracking
//   2.2 buyChest   OPEN. No proximity, no rate, no check of any kind: a loop over the id range wiped
//                  every crate in the level for every player.
//
// The fix is builds 1130/1164's own rule — BOUND THE CLAIM — applied to the one message that never got it.

// ---------------------------------------------------------------- the claim is bounded by what makes it possible
{
  const h = src.slice(src.indexOf("else if(msg.t==='buyChest')"), src.indexOf("else if(msg.t==='buyChest')") + 1600);
  assert(/const _ci = chests\.findIndex\(c=>c\.id===msg\.id\);/.test(h), 'the crate must exist…');
  assert(/if\(_ci>=0 && _buyChestOk\(id\)\)\{/.test(h), '…the sender must be inside their rate budget…');
  assert(/const _d = _pe \? Math\.hypot\(_pe\.x-_c\.pos\.x, _pe\.z-_c\.pos\.z\) : Infinity;/.test(h),
    '…and they must actually be NEAR the crate');
  assert(/if\(_d <= CHEST_REACH\)\{ scene\.remove\(_c\.mesh\); chests\.splice\(_ci,1\); \}/.test(h),
    'only then is it consumed for everyone');
  // a client the host has no position for must not pass
  assert(/: Infinity;/.test(h), 'an unknown position is Infinity, so it fails the test rather than skipping it');
  assert(/BOUND THE CLAIM, the same rule builds 1130\/1164 established for damage and movement/.test(src),
    'with the rule it applies named');
}

// ---------------------------------------------------------------- the numbers are derived, not picked
{
  assert(/const CHEST_REACH = 8;/.test(src), 'the reach is named…');
  assert(/the range the shop opens at/.test(src), '…and derived from the 3.5 m the shop actually opens at');
  assert(/the packet arrives a round trip after the player was standing\n   there/.test(src),
    'with the reason it is larger than 3.5 rather than equal to it');
  assert(/a client's reported position is itself already bounded by build 1164's _plausibleMove/.test(src),
    'and the reason a position-based check is trustworthy at all');
  assert(/if\(d < 3\.5\)\{ nearTarget = \{ type:'chest', chest:ch \}; break; \}/.test(src),
    'the 3.5 m it is derived from is still what the game uses');
}

// ---------------------------------------------------------------- the bucket, executed
{
  const rig = new Function('performance', extractFunction('_buyChestOk') +
    '; const _buyChestAt = {}; const CHEST_BUY_MS = 400; return { ok:_buyChestOk, at:_buyChestAt };');
  let t = 0;
  const r = rig({ now: () => t });
  /* the clock starts at ZERO on purpose: the first draft stored the timestamp and read it back with
     `|| -1e9`, so a stored 0 was falsy and the bucket never engaged. performance.now() is never 0 in a
     live page, so only a test that starts its clock there can find it. */
  assert(r.ok(1), 'the first claim passes');
  assert(!r.ok(1), 'an immediate second from the same client does not');
  assert(r.ok(2), 'but another client is unaffected — one griefer cannot tax an innocent player');
  t = 401;
  assert(r.ok(1), 'and after the window it passes again');
  // the flood the audit described
  t = 0; const r2 = rig({ now: () => t });
  let passed = 0;
  for (let i = 0; i < 200; i++) if (r2.ok(1)) passed++;
  eq(passed, 1, '200 packets in one tick consume exactly ONE crate, not two hundred');
  assert(/const CHEST_BUY_MS = 400;/.test(src), 'the window is named');
  assert(/far past any real rate/.test(src), '...and argued as generous rather than tight');
}

// ---------------------------------------------------------------- and the rest of 2.1 / 2.2 is still closed
{
  const relay = (new Function('return ' + (src.match(/const _RELAY_OK = new Set\((\[[^\]]*\])\)/) || [])[1]))();
  eq(relay.length, 4, 'the relay allow-list is still four types…');
  for (const t of ['hurt', 'wact', 'chat', 'teams', 'duelOver', 'raceOver', 'credit', 'full', 'begin'])
    assert(relay.indexOf(t) < 0, '…and still refuses ' + t);
  assert(/if\(!_RELAY_OK\.has\(msg\.t\)\) return;/.test(src), 'checked before anything is forwarded');
  const died = src.slice(src.indexOf("else if(msg.t==='died')"), src.indexOf("else if(msg.t==='died')") + 500);
  assert(/_diedOk\(id\)/.test(died), 'a death claim is still rate-limited');
  const rf = src.slice(src.indexOf("else if(msg.t==='raceFin')"), src.indexOf("else if(msg.t==='raceFin')") + 700);
  assert(/if\(_rp && \(_rp\.lap\|0\) >= _need\) _raceDeclareWinner\(id\);/.test(rf),
    'and a race win is still checked against the laps the host counted');
}

done('build 1329 (multiplayer audit 2.2): the last unbounded client claim. 2.1 (the relay mediating one of 36 host-authoritative message types) and two of 2.2\'s three bullets were closed by build 1279 and are re-verified here rather than re-fixed — the relay allow-list still refuses hurt, wact, chat impersonation, teams, duelOver and the rest; a death claim is still rate-limited; a race win is still checked against the laps the host counted. The bullet left standing was buyChest, which removed ANY crate for EVERYONE with no proximity check, no rate limit and no validation of any kind, so a loop over the id range wiped every crate in the level for every player. It is bounded now by exactly what makes the claim possible: the crate must exist, the sender must be within CHEST_REACH (8 m, derived from the 3.5 m at which the shop actually opens, widened for the round trip the packet took), and a leaky bucket allows one crate per client per 400 ms. Executed: 200 packets in a single tick consume exactly one crate rather than two hundred, a second client is unaffected by the first client\'s budget, and a sender the host has no position for fails the distance test rather than skipping it');
