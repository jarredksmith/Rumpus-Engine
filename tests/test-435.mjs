import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 578: multiplayer liveness. Peers send ~20x/sec in-game; if one goes silent past NET_TIMEOUT_MS it's a
// real drop (ungraceful disconnects never fire 'close'). Host removes the ghost; client returns to menu.

// --- run the REAL pure timeout detector ---
const timedOut = new Function('return ('+extractFunction('_netTimedOut')+')')();
const now = 100000;
const seen = { 1: now-500, 2: now-9000, 3: now-2000, 4: now-20000 };
const dead = timedOut(seen, now, 8000).sort((a,b)=>a-b);
eq(JSON.stringify(dead), JSON.stringify([2,4]), 'only peers silent past the timeout are flagged');
eq(JSON.stringify(timedOut({}, now, 8000)), JSON.stringify([]), 'empty map -> nobody dropped');
eq(JSON.stringify(timedOut(null, now, 8000)), JSON.stringify([]), 'null-safe');
assert(timedOut({5:0}, now, 8000)[0]===5, 'a never-seen peer (ts 0) counts as timed out');

// --- config + state ---
assert(/const NET_TIMEOUT_MS = 8000;/.test(src), 'generous 8s timeout (lag-spike safe)');
assert(/_seen:\{\}/.test(src) && /_hostSeen:0/.test(src) && /_lost:false/.test(src), 'NET carries liveness state');

// --- host side ---
const dc = extractFunction('dropClient');
assert(/c\.close\(\)/.test(dc) && /removeRemotePlayer\(pid\)/.test(dc) && /delete NET\.conns\[pid\]/.test(dc) && /delete NET\._seen\[pid\]/.test(dc), 'dropClient closes the conn and clears all its state');
assert(/NET\._seen\[id\]=performance\.now\(\)/.test(extractFunction('handleClientMsg')), 'any client message refreshes its liveness');
assert(/conn\.on\('close', \(\)=>dropClient\(conn\._pid\)\)/.test(src) && /conn\.on\('error', \(\)=>dropClient\(conn\._pid\)\)/.test(src), 'host close AND error both drop the client (error was a no-op before)');
assert(/if\(NET\._seen\) NET\._seen\[conn\._pid\]=performance\.now\(\)/.test(src), 'liveness clock starts when a client connects');

// --- client side ---
const hl = extractFunction('netHostLost');
assert(/if\(NET\._lost\) return; NET\._lost=true;/.test(hl) && /location\.reload\(\)/.test(hl), 'host-lost teardown runs once and returns to menu');
assert(/NET\._hostSeen=performance\.now\(\)/.test(extractFunction('handleHostMsg')), 'any host message refreshes host liveness');
assert(/if\(gameOn\) netHostLost\(\); else netStatus\('Disconnected from host'\)/.test(src), 'a host close mid-game returns to menu instead of freezing');

// --- the periodic sweep, gated to active play ---
const nt = extractFunction('netTick');
assert(/typeof gameOn!=='undefined' && gameOn/.test(nt), 'liveness sweep only runs in-game (avoids lobby false-positives)');
assert(/_netTimedOut\(NET\._seen, now, NET_TIMEOUT_MS\)/.test(nt) && /dropClient\(pid, 'timeout'\)/.test(nt), 'host sweeps for silent clients');
assert(/now-NET\._hostSeen\)>NET_TIMEOUT_MS\)\{ netHostLost/.test(nt), 'client watches for a silent host');

done('multiplayer liveness: silent peers detected + cleaned up; host loss returns the client to menu (build 578)');
