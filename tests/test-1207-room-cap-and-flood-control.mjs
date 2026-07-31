// build 1207: the room has a ceiling and structural messages have a rate limit.
//
// The multiplayer critic's CRITICAL #2: `on('connection')` accepted every peer unconditionally, and
// pAdd/pMov/pDel/chat had no inbound rate cap — so anyone with the room code (the lobby directory
// publishes them) could open unlimited connections to exhaust the host, or flood pAdd to inject thousands
// of props and force every peer to fetch a hostile GLB. Now: a mode-shaped player ceiling refuses fresh
// peers past the cap with a clean 'full' close (a rejoiner reclaiming its slot is never refused), and a
// leaky bucket per source drops structural messages over budget before they apply or relay.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the connection cap, executed
{
  const maxFor = new Function('NET', extractFunction('_maxPlayersFor') + '\nreturn _maxPlayersFor();');
  eq(maxFor({ gameMode: 'duel' }), 2, 'a duel is strictly 1v1');
  eq(maxFor({ gameMode: 'ffa' }), 8, '...other modes cap at 8');

  // drive the real accept decision: build _hostOnConnection with stubs and count who gets a _pid vs a 'full' close
  const mk = (gameMode, existing, rejoin) => {
    const NET = { gameMode, conns: {}, nextId: 100, _seen: {}, duelScore: {}, teams: {}, phase: 'playing', myId: 0, charById: {} };
    for (const e of existing) NET.conns[e] = { open: true };
    const events = { sentFull: false, closed: false, gotPid: null };
    const conn = { metadata: rejoin != null ? { rejoin } : null, _handlers: {},
      on(ev, fn) { this._handlers[ev] = fn; }, send(m) { if (m && m.t === 'full') events.sentFull = true; }, close() { events.closed = true; } };
    const body =
      'function pvpMode(){ return NET.gameMode!=="coop"; }\n' +
      'function teamMode(){ return false; }\n' +
      'function assignTeam(){}\n function refreshLobby(){}\n function serializeLevel(){ return null; }\n' +
      'function _levelUsesSketchfab(){ return false; }\n function sfGetToken(){ return null; }\n' +
      'function myCharCfg(){ return {}; }\n function netStatus(){}\n function broadcastDuelScore(){}\n' +
      'const gameCfg={}, audioSettings={}, MP_RULES={weps:1,nades:1};\n' +
      'function setTimeout(){}\n' +
      extractFunction('_maxPlayersFor') + '\n' + extractFunction('_hostOnConnection') + '\n' +
      '_hostOnConnection(conn);\n' +                                   // run the real accept decision NOW (sets _pid or refuses)
      'return { open:()=>{ if(conn._handlers.open) conn._handlers.open(); } };';
    const api = new Function('NET', 'conn', 'performance', body)(NET, conn, { now: () => 0 });
    api.open();   // fire the 'open' handler if the connection was accepted (a refused peer's handler sends 'full')
    return { conn, events, NET };
  };

  { const r = mk('ffa', [1, 2, 3, 4, 5, 6, 7], null);   // host + 7 clients = 8 present = the cap; a fresh peer is the 9th
    assert(r.events.sentFull, 'the 9th player (7 clients + host already fill the 8-cap) is told the room is full');
    assert(r.conn._pid == null, '...and never gets a player id (never enters NET.conns)'); }
  { const r = mk('ffa', [1, 2, 3, 4, 5, 6], null);      // host + 6 = 7 present; the incoming is the 8th, filling the room
    assert(!r.events.sentFull, 'the 8th player fills the room to exactly the cap and is accepted');
    assert(r.conn._pid != null, '...and gets an id'); }
  { const r = mk('ffa', [1, 2, 3], null);               // plenty of room
    assert(!r.events.sentFull, 'a peer well under the cap is accepted');
    assert(r.conn._pid != null, '...and gets an id'); }
  { const r = mk('duel', [1], null);                     // host + 1 = 2 = duel cap; a third is refused
    assert(r.events.sentFull, 'a third peer in a DUEL is refused (strictly 1v1)'); }
  { // a rejoiner whose slot is FREE must be admitted even when the room is otherwise at the ceiling
    const r2 = mk('ffa', [1, 2, 3, 5, 6, 7, 8], 4);      // 7 clients present (a fresh peer would be the refused 9th); id 4 is free
    assert(!r2.events.sentFull, 'a rejoiner reclaiming a FREE id is admitted even when a fresh peer would be refused');
    eq(r2.conn._pid, 4, '...keeping its old id'); }
}

// ---------------------------------------------------------------- the structural leaky bucket, executed
{
  const RATE = +src.match(/STRUCT_RATE = (\d+)/)[1], BURST = +src.match(/STRUCT_BURST = (\d+)/)[1];
  let t = 0;
  const allow = new Function('performance',
    'const _structAcc={}; const STRUCT_RATE=' + RATE + ', STRUCT_BURST=' + BURST + ';\n' +
    extractFunction('_structAllow') + '\nreturn _structAllow;')({ now: () => t });
  let passed = 0; for (let i = 0; i < 200; i++) if (allow(1)) passed++;
  eq(passed, BURST, 'a same-tick flood of 200 structural messages passes exactly the burst budget (' + BURST + '), the rest are dropped');
  // a second source is independent
  let passed2 = 0; for (let i = 0; i < 200; i++) if (allow(2)) passed2++;
  eq(passed2, BURST, '...a second source has its OWN bucket — one flooder cannot starve an innocent client');
  // the bucket refills over time
  t += 1000; let after = 0; for (let i = 0; i < 200; i++) if (allow(1)) after++;
  assert(after >= RATE - 1, 'after a second, ~STRUCT_RATE tokens have refilled (' + after + ')');
}

// ---------------------------------------------------------------- the wiring
{
  const h = extractFunction('handleClientMsg');
  assert(/if\(msg && \(msg\.t==='pAdd'\|\|msg\.t==='pMov'\|\|msg\.t==='pDel'\|\|msg\.t==='chat'\) && !_structAllow\(id\)\) return;/.test(h),
    'the structural bucket gates pAdd/pMov/pDel/chat before they apply or relay');
  const oc = extractFunction('_hostOnConnection');
  assert(/if\(!_rejoinFree && \(Object\.keys\(NET\.conns\)\.length \+ 1\) >= _maxPlayersFor\(\)\)\{/.test(oc),
    'the cap counts the host (+1) and admits a free-slot rejoiner past it');
  assert(/conn\.send\(\{ t:'full', max:_maxPlayersFor\(\) \}\)/.test(oc), '...and tells a refused peer WHY, then closes');
  assert(/else if\(msg\.t==='full'\)\{/.test(src), 'the client surfaces a full room instead of hanging on "connecting"');
  const dc = extractFunction('dropClient');
  assert(/delete _structAcc\[pid\]; if\(typeof _dmgAcc!=='undefined'\) delete _dmgAcc\[pid\]/.test(dc),
    'a leaver\'s rate buckets are freed with it — no unbounded per-id accumulation');
}

done('build 1207: the room caps at a mode-shaped ceiling (duel 2, else 8) refusing fresh peers with a clean \'full\' close while always admitting a free-slot rejoiner, and pAdd/pMov/pDel/chat run through a per-source leaky bucket (executed: a 200-message flood passes only the burst budget, sources are independent, the bucket refills) — the one-line connection DoS and the pAdd scene-injection flood are both closed');
