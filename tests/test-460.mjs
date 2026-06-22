import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 606: lobby keepalive — keep peer connections warm while waiting, prune dead peers there too.

const ka = extractFunction('startLobbyKeepalive');
assert(/setInterval\(\(\)=>\{/.test(ka) && /\}, 2500\)/.test(ka), 'keepalive runs on a ~2.5s interval (well under the 8s timeout)');
assert(/if\(NET\.phase!=='lobby' \|\| NET\.mode==='off'\)\{ stopLobbyKeepalive\(\); return; \}/.test(ka), 'self-terminates once the match starts / we leave');
assert(/for\(const id in NET\.conns\)\{ const c=NET\.conns\[id\]; if\(c && c\.open\)\{ try\{ c\.send\(\{t:'hb'\}\); \}catch\(e\)\{\} \} \}/.test(ka), 'host pings every client');
assert(/const dead=_netTimedOut\(NET\._seen, now, NET_TIMEOUT_MS\); for\(const pid of dead\) dropClient\(pid, 'timeout'\)/.test(ka), 'host prunes silent peers in the lobby');
assert(/if\(NET\.conn && NET\.conn\.open\)\{ try\{ NET\.conn\.send\(\{t:'hb'\}\); \}catch\(e\)\{\} \}/.test(ka), 'client pings the host');
assert(/if\(NET\._hostSeen && \(now-NET\._hostSeen\)>NET_TIMEOUT_MS\) netHostLost\(\)/.test(ka), 'client detects a dead host in the lobby');

// started on both lobby entries, stopped on teardown
assert(/announceRoom\(\); startLobbyKeepalive\(\)/.test(src), 'host starts keepalive entering the lobby');
assert(/_imReady=false; _updateReadyBtn\(\);\s*startLobbyKeepalive\(\)/.test(src), 'client starts keepalive entering the lobby');
assert(/_lobbyHbT=null; \}\n  stopLobbyKeepalive\(\)/.test(src), 'keepalive stops when the room is unannounced (match start / leave)');
assert(/NET\._lost=true;\n  if\(typeof stopLobbyKeepalive==='function'\) stopLobbyKeepalive\(\)/.test(src), 'keepalive stops when the host is lost');

// hb is a no-op message — the top-of-handler stamps refresh the liveness clocks
assert(/NET\._seen\[id\]=performance\.now\(\)/.test(src) && /NET\._hostSeen=performance\.now\(\)/.test(src), 'any message (incl. hb) refreshes the liveness clocks');

done('lobby keepalive: 2.5s heartbeat both ways, self-terminating, prunes dead peers (build 606)');
