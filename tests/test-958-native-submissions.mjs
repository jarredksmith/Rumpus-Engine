// (build 958) NATIVE COMMUNITY SUBMISSIONS + one live catalog.
// - The gallery reads https://www.rumpusengine.com/community/ FIRST (CORS-open via the
//   community/.htaccess), so the cPanel site and the GitHub Pages copy share ONE live library;
//   it falls back to the community/ folder beside the game when the server is unreachable.
// - Submit posts straight to our submit.php for review — no GitHub account needed. Real
//   rejections (too big / rate limit / queue full) surface and stop; only network/5xx failures
//   fall back to the old GitHub-issue flow (kept intact below the new path).
// - Server: submissions fully validated at the door (PHP gzdecode of the 'g'+base64url(gzip)
//   codec, 500KB cap, props/world shape check, sanitized names), pending queue + admin.php
//   review page (approve/reject/unpublish, CHANGE-ME setup guard, brute-force brake).
// Verified END-TO-END headless with real php -S: in-game Submit -> pending (name/author) ->
// approve -> the in-game gallery lists it FROM THE SERVER -> dead-server page falls back to
// the beside-the-game catalog. Plus an 11-check curl suite.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();
const dir = path.dirname(fileURLToPath(import.meta.url));

// --- game side: one live catalog with fallback ---
assert(/const COMM_BASE_DEFAULT = 'https:\/\/www\.rumpusengine\.com\/community\/';/.test(src), 'server catalog is the default base');
assert(/const COMM_API_DEFAULT {2}= 'https:\/\/www\.rumpusengine\.com\/api\/';/.test(src), 'submit API base');
assert(/breach_comm_base/.test(src) && /breach_comm_api/.test(src), 'both bases have localStorage overrides');
assert(/bases\.push\('community\/'\)/.test(src), 'beside-the-game catalog is the fallback');
assert(/_commBaseActive=base;/.test(src), 'the base that served the index is remembered');
assert(/fetch\(_commBaseActive\+'levels\/'\+file/.test(src), 'level fetches follow the same base as the index');

// --- game side: native submit with honest failure handling ---
assert(/fetch\(_commApi\(\)\+'submit\.php', \{ method:'POST'/.test(src), 'submit posts to our server');
assert(/Submitted for review/.test(src), 'success message');
assert(/if\(r\.status===400 \|\| r\.status===429 \|\| r\.status===503\)/.test(src), 'real rejections stop (no pointless GitHub fallback)');
assert(/Server unreachable \\u2014 opening the GitHub form instead/.test(src) || /Server unreachable — opening the GitHub form instead/.test(src),
  'network failures fall back to the GitHub flow');
assert(/breach_author_name/.test(src), 'author name is remembered');

// --- server side ---
const lib = readFileSync(path.join(dir, '..', 'server', 'api', '_community_lib.php'), 'utf8');
assert(/gzdecode\(/.test(lib), 'PHP decodes the gzip share codec');
assert(/'json' => 500000/.test(lib) && /'name' => 60/.test(lib) && /'author' => 40/.test(lib), 'caps match the pipeline');
assert(/isset\(\$level\['props'\]\) && !isset\(\$level\['world'\]\)/.test(lib), 'level shape check (props/world)');
assert(/preg_match\('#\^data:image\/\(jpeg\|png\);base64,/.test(lib), 'thumbnail lifted only when it is a real image data-url');
assert(/unset\(\$level\['thumb'\]\)/.test(lib), 'thumb stripped from the published level file');

const sub = readFileSync(path.join(dir, '..', 'server', 'api', 'submit.php'), 'utf8');
assert(/Access-Control-Allow-Origin: \*/.test(sub), 'submit endpoint is CORS-open');
assert(/\$MAX_PENDING_PER_IP = 5;/.test(sub) && /\$MAX_PENDING\s+= 200;/.test(sub), 'queue caps');
assert(/validateSubmission\(\$b\['name'\]/.test(sub), 'submissions validated at the door');

const adm = readFileSync(path.join(dir, '..', 'server', 'api', 'admin.php'), 'utf8');
assert(/'CHANGE-ME'\) jsonOut\(503/.test(adm), 'admin refuses to run until the password is set');
assert(/hash_equals\(hash\('sha256', \$ADMIN_PASSWORD\)/.test(adm), 'constant-time password check');
assert(/>= 30\) jsonOut\(429/.test(adm), 'brute-force brake');
assert(/'approve'/.test(adm) && /'reject'/.test(adm) && /'unpublish'/.test(adm), 'approve/reject/unpublish actions');
assert(/breach\.html#lvl='\+encodeURIComponent/.test(adm), 'Test play link opens the actual level in-game');

const ht = readFileSync(path.join(dir, '..', 'community', '.htaccess'), 'utf8');
assert(/Access-Control-Allow-Origin "\*"/.test(ht), 'community catalog is CORS-open for the Pages copy');

done('build 958: native submissions with review queue + one live community catalog');
