// (build 159) Optional public games list. PeerJS can't enumerate rooms, so open lobbies publish to a shared
// registry (a Firebase Realtime DB URL pasted into LOBBY_DB). Disabled by default => no-op, code-join intact.
import { gameSource, html, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/const LOBBY_DB_DEFAULT = 'https:\/\/www\.rumpusengine\.com\/api\/lobbies\.php';/.test(src) && /const LOBBY_TTL = 15000;/.test(src), 'registry config present, pointing at our own endpoint (build 956)');
assert(/function lobbyEnabled\(\)\{ return \/\^https\?:\\\/\\\//.test(src) && /breach_lobby_db/.test(src), 'feature gated on a URL, with a localStorage override / off switch (build 956)');
assert(/function announceRoom\(\)/.test(src) && /function unannounceRoom\(\)/.test(src) && /function fetchRooms\(cb\)/.test(src), 'publish / remove / list helpers');

const an = extractFunction('announceRoom');
assert(/NET\.mode!=='host'/.test(an) && /method:'PUT'/.test(an) && /setInterval\(ping, 5000\)/.test(an), 'host PUTs + heartbeats while in lobby');
const fr = extractFunction('fetchRooms');
assert(/now-\(r\.ts\|\|0\)\)<LOBBY_TTL/.test(fr), 'stale lobbies filtered out by TTL');

// removed from the public list once the match starts, and on leave
const sm = extractFunction('startMatch');
assert(/unannounceRoom\(\)/.test(sm), 'match start de-lists the lobby');
assert(/lv\.onclick=\(\)=>\{ unannounceRoom\(\); location\.reload\(\); \}/.test(src), 'leave de-lists the lobby');
const el = extractFunction('enterLobby');
assert(/announceRoom\(\)/.test(el), 'opening a lobby publishes it');

// join straight from the list
const jc = extractFunction('joinByCode');
assert(/clientStart\(code\)/.test(jc), 'list entry joins by its code');
assert(/j\.onclick=\(\)=>joinByCode\(r\.code\)/.test(src), 'each row has a Join button');

// UI + polling
assert(/<div id="mpGamesRow"/.test(html) && /<div id="mpGames">/.test(html) && /id="mpRefresh"/.test(html), 'games panel markup (hidden until enabled)');
assert(/!m\.classList\.contains\('hidden'\) && lobbyEnabled\(\)\) refreshGamesList\(\)/.test(src), 'auto-refresh only while the modal is open + enabled');
done('public games list');
