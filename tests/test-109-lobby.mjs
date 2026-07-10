// (build 158) Pre-game lobby: hosting opens a waiting room (room code + player list) instead of dropping
// straight into the match. The host presses START, which broadcasts 'begin' so every player spawns together.
// Late joiners (welcome.phase==='playing') still drop into a running game.
import { gameSource, html, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// host enters a lobby on peer open instead of starting immediately
assert(/showRoomBadge\(code\); enterLobby\(\); \}\);/.test(src), 'host opens a lobby (not an instant start)');
assert(!/showRoomBadge\(code\); startGame\(\); \}\);/.test(src), 'host no longer auto-starts');

// lobby plumbing
assert(/function enterLobby\(\)/.test(src) && /function showClientLobby\(\)/.test(src) && /function startMatch\(\)/.test(src), 'lobby host/client/start functions');
assert(/function lobbyRoster\(\)/.test(src) && /function renderLobby\(roster\)/.test(src) && /function broadcastLobby\(\)/.test(src), 'roster + render + broadcast');

const sm = extractFunction('startMatch');
assert(/NET\.phase='playing';/.test(sm) && /NET\.conns\[id\]\.send\(\{t:'begin'\}\)/.test(sm) && /startGame\(\)/.test(sm), 'START sets playing, broadcasts begin, starts');

// welcome carries the phase so a joiner knows lobby vs in-progress
assert(/phase:NET\.phase\}\);/.test(src), 'welcome carries the phase');
assert(/if\(msg\.phase==='lobby'\)\{ showClientLobby\(\); _lobbyDlWatch\(\); \} else \{ startGame\(\); \}/.test(src), 'client waits in lobby (with the download ticker, build 927), or late-joins a running game');

// client reacts to begin + lobby roster
assert(/else if\(msg\.t==='begin'\)\{ NET\.phase='playing'; closeModal\('lobby'\); if\(typeof closeMatchMenu==='function'\) closeMatchMenu\(\); startGame\(\); \}/.test(src), 'client begins on host start (and dismisses the match menu, build 512)');
assert(/else if\(msg\.t==='lobby'\)\{ NET\.lobbyRoster=msg\.players/.test(src), 'client renders the roster broadcast');

// host refreshes the lobby on join / name / leave
assert((src.match(/if\(NET\.phase==='lobby'\) refreshLobby\(\)/g)||[]).length>=3, 'lobby refreshes on join, name, and leave');

// UI
assert(/<div id="lobby" class="modalBack hidden">/.test(html) && /id="lobbyStart"/.test(html) && /id="lobbyPlayers"/.test(html), 'lobby overlay markup');
assert(/sb\.onclick=startMatch/.test(src) && /lv\.onclick=\(\)=>\{ unannounceRoom\(\); location\.reload\(\); \}/.test(src), 'lobby buttons wired');
done('pre-game lobby');
