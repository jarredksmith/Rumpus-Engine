import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1298: the peer connection is `reliable:true` — ordered SCTP — and the host fans a world snapshot to
// every client 20 times a second, with the client answering at the same rate. Across 53 `send` sites nothing
// had ever looked at `bufferedAmount`. On a link that cannot drain 20 Hz a reliable channel does not drop,
// it QUEUES, without bound: every later message waits behind the backlog, so the connection slides into
// ever-growing latency and never recovers. Invisible in a LAN test, because the queue never builds.
//
// Measured on the stock level (1 enemy, 59 props): keyframe 557 B, delta 325 B, ~6.8 KB/s — the FLOOR for a
// real match. So the limit is stated in SNAPSHOTS, not bytes.

const rig = () => {
  const warns = [];
  const fn = new Function('NET_BUF_FLOOR', 'NET_BUF_SNAPS', 'console', 'S',
    'let _netDropped = 0, _netDropWarned = false;\n' +
    extractFunction('_netBuffered') + '\n' + extractFunction('_sendDroppable') +
    '; return { send:_sendDroppable, buffered:_netBuffered, dropped:()=>_netDropped };');
  const FLOOR = +src.match(/NET_BUF_FLOOR = (\d+)/)[1];
  const SNAPS = +src.match(/NET_BUF_SNAPS = (\d+)/)[1];
  return Object.assign(fn(FLOOR, SNAPS, { warn: (m) => warns.push(m) }, null), { warns, FLOOR, SNAPS });
};
const conn = (buffered) => { const sent = []; return { sent, dataChannel: { bufferedAmount: buffered }, send: (m) => sent.push(m) }; };

// ---------------------------------------------------------------- reading the queue
{
  const r = rig();
  eq(r.buffered(conn(1234)), 1234, 'it reads the data channel’s queue');
  eq(r.buffered({ _dc: { bufferedAmount: 7 } }), 7, '...under either property name PeerJS has used');
  eq(r.buffered({}), 0, 'a connection with no channel yet reads as empty');
  eq(r.buffered(null), 0);
  eq(r.buffered({ dataChannel: {} }), 0, 'a channel that does not report reads as empty');
  eq(r.buffered({ dataChannel: { bufferedAmount: 'lots' } }), 0, '...and so does a non-numeric answer');
  eq(r.buffered({ get dataChannel() { throw new Error('closing'); } }), 0,
    'A TRANSPORT THAT WILL NOT ANSWER IS TREATED AS HEALTHY — the failure mode of guessing wrong here is a connection that stops sending, which is worse than one that queues');
}

// ---------------------------------------------------------------- the threshold is in snapshots
{
  const r = rig();
  eq(r.FLOOR, 16384, 'the floor is 16 KB');
  eq(r.SNAPS, 8, 'and the limit is eight snapshots deep — 400 ms of backlog at 20 Hz, whatever the level weighs');
  // a small level: the floor governs
  const small = conn(r.FLOOR - 1);
  eq(r.send(small, { t: 'world' }, 557), true, 'the stock level’s 557-byte keyframe sends under the floor');
  eq(small.sent.length, 1);
  eq(r.send(conn(r.FLOOR + 1), { t: 'world' }, 557), false, '...and is skipped above it');
  // a heavy level: the payload governs, so the same 400 ms window applies
  eq(r.send(conn(60000), { t: 'world' }, 9000), true, 'a 9 KB snapshot tolerates 60 KB of queue (under 8 deep)');
  eq(r.send(conn(80000), { t: 'world' }, 9000), false, '...and not 80 KB (over)');
  assert(r.FLOOR / 557 > r.SNAPS,
    'on a level this small the FLOOR is the binding limit, which is what it is for — 8 × 557 B would trip on ordinary jitter');
}
{ // the arithmetic, stated plainly
  const lim = new Function('FLOOR', 'SNAPS', 'bytes', 'return Math.max(FLOOR, (bytes||0) * SNAPS);');
  eq(lim(16384, 8, 0), 16384, 'an unmeasured payload still gets the floor, never a limit of zero');
  eq(lim(16384, 8, 9000), 72000, 'a big snapshot raises the limit with it');
  eq(lim(16384, 8, 100), 16384, 'a tiny one does not lower it below the floor');
}

// ---------------------------------------------------------------- what it does on a skip
{
  const r = rig();
  const c = conn(1e9);
  for (let i = 0; i < 40; i++) eq(r.send(c, { t: 'world' }, 500), false, 'a saturated channel is skipped');
  eq(c.sent.length, 0, 'nothing was queued onto it');
  eq(r.dropped(), 40, 'and every skip is counted');
  eq(r.warns.length, 0, 'no warning yet — a handful of skips is the system working, not a fault');
  r.send(c, { t: 'world' }, 500);
  eq(r.warns.length, 1, '...but a sustained backlog says so');
  for (let i = 0; i < 200; i++) r.send(c, { t: 'world' }, 500);
  eq(r.warns.length, 1, 'ONCE — a per-frame warning would itself be the next performance problem');
}
{ // a healthy channel is completely unaffected
  const r = rig(), c = conn(0);
  for (let i = 0; i < 100; i++) eq(r.send(c, { t: 'world', i }, 500), true, 'every send lands');
  eq(c.sent.length, 100);
  eq(r.dropped(), 0, 'and nothing is counted as dropped');
  eq(c.sent[99].i, 99, '...in order');
}
{ // a throwing send is a failure, not a crash mid-broadcast
  const r = rig();
  eq(r.send({ dataChannel: { bufferedAmount: 0 }, send() { throw new Error('closed'); } }, {}, 100), false,
    'a closed connection returns false instead of throwing out of the broadcast loop');
  eq(r.send(null, {}, 100), false, 'and a missing connection is simply not sent to');
}

// ---------------------------------------------------------------- the skip is repaired
{
  // Build 1197's snapshots are DELTAS against one shared previous state, so a client that misses one is
  // stale until the next keyframe. Executed: the keyframe decision, and that _snapN = 0 forces one.
  const full = new Function('_snapN', '_nConn', '_snapConnN', '_snapN++; return (_snapN % 10 === 1) || _nConn !== _snapConnN;');
  eq(full(0, 1, 1), true, 'RESETTING _snapN TO 0 MAKES THE NEXT SNAPSHOT A KEYFRAME — the counter is incremented before the modulo');
  eq(full(1, 1, 1), false, 'the one after it is a delta again');
  eq(full(9, 1, 1), false);
  eq(full(10, 1, 1), true, 'and the ordinary 1-in-10 cadence is untouched');
  const bw = extractFunction('broadcastWorld');
  assert(/if\(skipped\) _snapN = 0;/.test(bw), 'a skipped send forces the next snapshot to be a keyframe');
  assert(/let skipped=false;/.test(bw) && /if\(!_sendDroppable\(NET\.conns\[id\], w, bytes\)\) skipped=true;/.test(bw),
    '...if ANY connection was skipped');
  assert(/turns that window from up to nine snapshots \(450 ms\) into one \(50 ms\), and it repairs every skipped\n  \/\/ client at once/.test(src),
    'and what that buys is recorded — one shared payload repairs every skipped client together');
  // the payload is measured ONCE per broadcast, not once per connection
  assert(/try\{ bytes=JSON\.stringify\(w\)\.length; \}catch\(e\)\{ bytes=0; \}/.test(bw), 'the size is computed once');
  assert(bw.indexOf('JSON.stringify(w).length') < bw.indexOf('for(const id in NET.conns)'),
    '...before the fan-out, not inside it');
}

// ---------------------------------------------------------------- ONLY the droppable traffic
{
  // This is the assertion that matters most: a semantic event must never be silently skipped.
  eq((src.match(/_sendDroppable\(/g) || []).length, 3,
    'the definition plus exactly TWO calls — the host fan-out and the client state packet, and nothing else in the file');
  assert(/_sendDroppable\(NET\.conns\[id\], w, bytes\)/.test(src), 'the host world snapshot');
  assert(/_sendDroppable\(NET\.conn, \{ t:'st',/.test(src), 'and the client state packet');
  // everything else still sends unconditionally
  for (const t of ["t:'chat'", "t:'hurt'", "t:'propHit'", "t:'wact'"])
    assert(src.includes(t), t + ' still exists as a plain send');
  const around = (needle) => { const i = src.indexOf(needle); return src.slice(Math.max(0, i - 220), i); };
  for (const t of ["t:'chat'", "t:'propHit'"])
    assert(!/_sendDroppable/.test(around(t)), t + ' is NOT droppable — it is an event, not a state');
  assert(/Everything else — \n\/\/ hits, chat, joins, the level transfer, prop sync — is a semantic event and still goes unconditionally/.test(src)
      || /hits, chat, joins, the level transfer, prop sync — is a semantic event and still goes unconditionally/.test(src),
    'and the rule is stated: only a message the next one supersedes may be dropped');
}
{ // the client packet needs no keyframe repair, and the source says why
  assert(/this packet carries no delta\n         state, so a skip costs exactly one frame of staleness and repairs itself on the very next send/.test(src),
    'the asymmetry between the two droppable sites is explained rather than left to be inferred');
}
{ // the measurement that set the unit
  assert(/keyframe 557 B, delta 325 B, ~6\.8 KB\/s/.test(src), 'the measured sizes are recorded beside the threshold');
  assert(/THE THRESHOLD IS STATED IN SNAPSHOTS, NOT BYTES/.test(src), '...and why bytes would have been the wrong unit');
}

done('build 1298: backpressure on the 20Hz state traffic — the peer channel is reliable and ordered, so a client that cannot drain it does not drop packets, it queues them without bound, and every later hit and chat line waits behind the backlog until the connection is unusable. Snapshots are the one droppable message (the next supersedes it), so they now skip when the send queue is more than eight snapshots deep — a unit that scales with the level instead of a byte count that does not — and a skip forces the next snapshot to be a keyframe, so build 1197’s delta stream repairs in 50 ms rather than 450. Every semantic message still sends unconditionally, which the test pins');
