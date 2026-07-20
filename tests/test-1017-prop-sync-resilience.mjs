// (build 1017) MP PROP-SYNC RESILIENCE — field report: placed props not appearing in MP. The
// full pipeline verifies green in a bridged two-instance harness (place -> pAdd -> peer spawns,
// both directions), so this build hardens the silent-loss holes that a live session can hit:
//  1) the reconciler claimed a prop in NET.sentProps BEFORE sending — a failed send (closed /
//     reconnecting DataConnection, serialization error) lost the pAdd/pDel/pMov FOREVER. Sends
//     now report success and failures roll the claim back, so the 0.08s tick retries.
//  2) a radial deploy whose model failed to load died as console.warn — ghost accepted, nothing
//     spawned, no feedback. It now retries once, then toasts honestly.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: netSendProp reports delivery honestly ----
const nsp = extractFunction('netSendProp', src);
const run = (NET, msg) => new Function('NET', 'msg', nsp + '\nreturn netSendProp(msg);')(NET, msg || { t: 'pAdd' });
eq(run({ mode:'host', conns:{} }), true, 'host with nobody connected: success (nothing to tell)');
eq(run({ mode:'host', conns:{ 1:{ open:true, send(){} } } }), true, 'host, open conn, clean send: success');
eq(run({ mode:'host', conns:{ 1:{ open:false, send(){} } } }), false, 'host, conn not open yet: FAILURE (retry later)');
eq(run({ mode:'host', conns:{ 1:{ open:true, send(){ throw new Error('x'); } } } }), false, 'host, send throws: failure');
eq(run({ mode:'host', conns:{ 1:{ open:true, send(){} }, 2:{ open:true, send(){ throw new Error('x'); } } } }), false,
  'host, ONE of two conns fails: failure (the claim rolls back so both get it next tick)');
eq(run({ mode:'client', conn:{ open:true, send(){} } }), true, 'client, open channel: success');
eq(run({ mode:'client', conn:{ open:false, send(){} } }), false, 'client, channel not open: failure');
eq(run({ mode:'client', conn:null }), false, 'client, no channel: failure');
eq(run({ mode:'client', conn:{ open:true, send(){ throw new Error('x'); } } }), false, 'client, send throws: failure');
eq(run({ mode:'off' }), true, 'solo: vacuous success (reconciler exits earlier anyway)');

// ---- the reconciler claims ONLY on delivery ----
const rc = extractFunction('reconcileProps', src);
assert(/if\(netSendProp\(\{ t:'pAdd', d:propEntry\(o\) \}\)\) NET\.sentProps\.set\(nid, dyn\?'dyn':propTuple\(o\)\);/.test(rc),
  'new prop: claim only after the pAdd is delivered (a failed send retries next tick — it used to be lost forever)');
assert(/if\(netSendProp\(\{ t:'pMov', nid, x:t \}\)\) NET\.sentProps\.set\(nid,t\);/.test(rc),
  'moves: the stored tuple advances only on delivery');
assert(/if\(netSendProp\(\{ t:'pDel', nid \}\)\) NET\.sentProps\.delete\(nid\);/.test(rc),
  'deletes: the claim survives until the delete is actually delivered (no permanent ghost on the peer)');
assert(/if\(_nidPending\.has\(nid\)\) continue;/.test(rc), 'the build-905 in-flight guard is untouched');

// ---- deploy failures are visible ----
const dp = extractFunction('deployProp', src);
assert(/Could not load that prop/.test(dp), 'second load failure toasts');
eq((dp.match(/spawnProp\(slot\.src\|\|'box'/g) || []).length, 2, 'one retry before giving up');
assert(/const _ready=\(obj\)=>\{/.test(dp), 'both attempts share the same ready wiring (dynamic/unbreakable/explosive flags)');

done('build 1017: prop sync claims only on delivery (failed sends retry), deploy load failures retry then toast');
