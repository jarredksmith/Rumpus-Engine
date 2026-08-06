// build 1232: actor-targeted verbs — 1231's recorded other half. The world verbs' "The player" is
// team-wide by design (host applies locally + wact broadcast reaches every client), which made
// "teleport the player who stepped on the pad", "give the key to the player who earned it", "heal
// only the capturer" inexpressible. The who dropdown gains "The event's player": the verb delivers
// to the 1231 context's pid alone — a remote actor gets the IDENTICAL wact payload over the existing
// channel (no new message type, no new handler), a local/solo actor runs the local branch with the
// team-wide broadcast suppressed.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the delivery helper, executed
const HELPER = extractFunction('_wactToActor');
const drive = (netMode, myId, ctxPid) => {
  const sent = [];
  const body =
    'const _lgCtx = { pid: ' + ctxPid + ' };\n' +
    'const NET = ' + (netMode === null ? 'undefined' : `{ mode: '${netMode}', myId: ${myId} }`) + ';\n' +
    'const sendToPlayer = (pid, m) => sent.push({ pid, m });\n' +
    HELPER + '\nreturn _wactToActor({ h: 25 });';
  return { handled: new Function('sent', body)(sent), sent };
};
{
  const r = drive('host', 0, 3);
  eq(r.handled, true, 'a REMOTE actor: delivered and done');
  eq(r.sent.length, 1, '...one message');
  eq(r.sent[0].pid, 3, '...to exactly that player');
  eq(r.sent[0].m.t, 'wact', '...as the wact payload the client already knows how to apply');
  eq(r.sent[0].m.h, 25, '...carrying the verb');
}
{
  const r = drive('host', 0, 0);
  eq(r.handled, false, 'the actor IS the host: caller runs its local branch');
  eq(r.sent.length, 0, '...and nothing crosses the wire');
}
{
  const r = drive(null, 0, 5);
  eq(r.handled, false, 'solo: always local');
  eq(r.sent.length, 0, '...no wire');
}

// ---------------------------------------------------------------- the verb branches, executed through the real _applyWorldAction
const CORE = extractFunction('_applyWorldAction');
const runVerb = (s, ctxPid, netMode) => {
  const out = { sent: [], healed: 0, dmg: 0, placed: null, gave: [], took: [], bcast: [] };
  const body =
    'const _lgCtx = { pid: ' + ctxPid + ' };\n' +
    'const NET = ' + (netMode === null ? 'undefined' : `{ mode: '${netMode}', myId: 0 }`) + ';\n' +
    'const sendToPlayer = (pid, m) => out.sent.push({ pid, m });\n' +
    'const _wactSend = (o) => out.bcast.push(o);\n' +
    'const player = { hp: 50, maxHp: 100, pos: { x: 0, z: 0 } };\n' +
    'const updateHUD = () => {}; const applyEnemyDamageToSelf = (d) => { out.dmg += d; };\n' +
    'const giveItem = (id, n) => out.gave.push([id, n]); const takeItem = (id, n) => out.took.push([id, n]);\n' +
    'const _lgPlaceAt = () => ({ x: 9, y: 1, z: -4 }); const _lgPlacePlayer = (at) => { out.placed = at; };\n' +
    'const _lgEnemyTargets = () => []; const _spawnFloorAt = () => 0;\n' +
    HELPER + '\n' + CORE + '\n_applyWorldAction(s);\nout.hp = player.hp;\nreturn out;';
  return new Function('s', 'out', body)(s, out);
};
{
  const r = runVerb({ do: 'heal', who: 'actor', amt: 25 }, 3, 'host');
  eq(r.sent.length, 1, 'heal->actor, remote: one targeted message');
  eq(r.sent[0].m.h, 25, '...the heal');
  eq(r.hp, 50, '...the host player untouched');
  eq(r.bcast.length, 0, '...and NO team-wide broadcast');
}
{
  const r = runVerb({ do: 'heal', who: 'actor', amt: 25 }, 0, 'host');
  eq(r.hp, 75, 'heal->actor, the actor IS the host: heals locally');
  eq(r.bcast.length, 0, '...still no broadcast — actor means one player');
  const rp = runVerb({ do: 'heal', who: 'player', amt: 25 }, 3, 'host');
  eq(rp.hp, 75, 'CONTROL: heal->player still heals the host locally');
  eq(rp.bcast.length, 1, '...and still broadcasts team-wide — the old verb is byte-identical');
}
{
  const r = runVerb({ do: 'teleport', who: 'actor', at: 'pad' }, 3, 'host');
  eq(r.sent.length, 1, 'teleport->actor, remote: targeted');
  eq(r.sent[0].m.tp.join(','), '9,1,-4', '...to the resolved place');
  eq(r.placed, null, '...without moving the host');
  const r2 = runVerb({ do: 'teleport', who: 'actor', at: 'pad' }, 0, 'host');
  near(r2.placed.x, 9, 1e-9, '...while a local actor moves locally');
}
{
  const r = runVerb({ do: 'give', who: 'actor', item: 'goldkey', n: 1 }, 3, 'host');
  eq(r.sent.length, 1, 'give->actor, remote: the key goes to the player who EARNED it');
  eq(r.sent[0].m.gi.join(','), 'goldkey,1', '...that item');
  eq(r.gave.length, 0, '...not into the host inventory');
  const r2 = runVerb({ do: 'give', item: 'goldkey', n: 1 }, 3, 'host');
  eq(r2.gave.length, 1, 'CONTROL: give without who is the old team-wide reward');
  eq(r2.bcast.length, 1, '...broadcast intact');
}
{
  const r = runVerb({ do: 'kill', who: 'actor' }, 4, 'host');
  eq(r.sent[0].m.k, 1, 'kill->actor, remote: the tombstone goes to one player');
  eq(r.dmg, 0, '...the host survives');
  const r2 = runVerb({ do: 'damage', who: 'actor', amt: 30 }, 0, null);
  eq(r2.dmg, 30, 'solo: damage->actor lands on the local player (pid 0 is the host — solo authoring just works)');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/const who=\(s\.who==='enemies'\|\|s\.who==='nearest'\|\|s\.who==='actor'\|\|s\.who==='near'\)\?s\.who:'player';/.test(src),   // build 1288: 'near' joined the audience list
    'who resolution knows actor');
  assert(/\['actor','The event\\u2019s player'\]/.test(src) || /\['actor','The event’s player'\]/.test(src),
    'the do-node who dropdown offers it');
  assert(/ifv:\['verb',\['damage','heal','kill','teleport','give','take','view'\]\]/.test(src),
    'give/take gained the who field — the earn-the-key case is the whole point');   /* build 1404: and `view`, for a per-player security camera */
  const h = extractFunction('_wactToActor');
  assert(/NET\.mode!=='host' \|\| pid===\(NET\.myId\|0\)\) return false;/.test(h),
    'the helper returns false for local/solo so the caller applies locally, true only after a remote send');
}

done('build 1232: actor-targeted verbs — the delivery helper executed (remote actor gets one targeted wact, local/solo falls through to the local branch, nothing broadcasts), the REAL _applyWorldAction driven for heal/teleport/give/kill/damage in both remote-actor and local-actor forms with team-wide controls proving the old player verbs byte-identical, give/take gain the who field, and the client applies the payload it always has — no new message type anywhere');
