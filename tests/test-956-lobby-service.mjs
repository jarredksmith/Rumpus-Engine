// (build 956) LIVE LOBBY BROWSER. The dormant "Open games" list (built for a Firebase URL nobody
// ever configured) now runs on our own endpoint: server/api/lobbies.php, deployed on
// rumpusengine.com — flat-file PHP, no database. Hardening on both sides: per-session owner keys
// (first heartbeat owns the room code; updates/closes need the same key), server-clock freshness
// (entries carry `age` seconds; client clocks never compared with the server's), keyed keepalive
// DELETE on unload, per-IP + global caps, body cap, name sanitization, flock'd atomic writes.
// Verified END-TO-END headless: real php -S + two game pages over the peer shim — host announces,
// PHP lists it, joiner's row renders, click Join connects, heartbeat updates the public count to
// 2p, unannounce removes the entry. Plus a 12-check curl suite (403 on wrong key, 413 oversize,
// 429 per-IP cap, TTL expiry, sanitizer).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();
const dir = path.dirname(fileURLToPath(import.meta.url));

// --- game side ---
assert(/const LOBBY_DB_DEFAULT = 'https:\/\/www\.rumpusengine\.com\/api\/lobbies\.php';/.test(src), 'default endpoint is our PHP service');
assert(/localStorage\.getItem\('breach_lobby_db'\)/.test(src) && /if\(o==='off'\) return '';/.test(src),
  'self-hosters can override the endpoint; off switch works');
assert(/function _mkLobbyKey\(\)/.test(src), 'owner key generator exists');
assert(/if\(!_lobbyKey\) _lobbyKey=_mkLobbyKey\(\);/.test(src), 'announce mints the per-session owner key');
assert(/players:1\+Object\.keys\(NET\.conns\)\.length, ts:Date\.now\(\), key:_lobbyKey \};/.test(src), 'heartbeat carries the key');
assert(/_lobbyUrl\(_lobbyCode\)\+\(_lobbyKey\?'&k='\+_lobbyKey:''\), \{ method:'DELETE', keepalive:true \}/.test(src),
  'close is keyed and keepalive (survives unload)');
assert(/if\(typeof r\.age==='number'\)\{ if\(r\.age<=20\) out\.push\(r\); \}/.test(src), 'freshness uses the server-computed age');

// --- server side (shipped in the repo, deployed to cPanel) ---
const php = readFileSync(path.join(dir, '..', 'server', 'api', 'lobbies.php'), 'utf8');
assert(/Access-Control-Allow-Origin: \*/.test(php), 'PHP: CORS open (the game calls cross-origin from Pages too)');
assert(/flock\(\$fh, LOCK_EX\)/.test(php), 'PHP: read-modify-write is atomic under flock');
assert(/hash_equals\(\$db\[\$code\]\['keyHash'\]/.test(php), 'PHP: constant-time owner-key check');
assert(/\$MAX_PER_IP = 3;/.test(php) && /\$MAX_ROOMS\s*= 200;/.test(php) && /\$MAX_BODY\s*= 2048;/.test(php), 'PHP: abuse caps');
assert(/\(\$now - \(int\)\$r\['beat'\]\) > \$TTL\) unset\(\$db\[\$k\]\)/.test(php), 'PHP: stale lobbies pruned on every request');
assert(/preg_replace\('\/\[\\x00-\\x1f\\x7f<>&"\\'`\]\/u', '', \$name\)/.test(php), 'PHP: names sanitized server-side');
assert(/'age'\s*=> max\(0, \$now - \(int\)\$r\['beat'\]\)/.test(php), 'PHP: list returns server-clock age');
assert(!/\bipHash'\s*=>\s*\$r\[/.test(php) && !/'keyHash'\s*=>\s*\$r\[/.test(php), 'PHP: GET never returns key or IP hashes');

const ht = readFileSync(path.join(dir, '..', 'server', 'api', '.htaccess'), 'utf8');
assert(/FilesMatch "\\\.\(json\|txt\)\$"/.test(ht) && /Require all denied/.test(ht), '.htaccess denies direct reads of the data files');

done('build 956: live lobby browser — own PHP service, keyed heartbeats, server-clock freshness');
