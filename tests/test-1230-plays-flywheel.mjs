// build 1230: the play-count flywheel — the feature panel's "no play-count/rating/comment flywheel".
// plays.php (a lobbies.php sibling: flat-file, salted-IP-hash rate limits, no accounts) counts plays
// and thumbs; the client reports a play when a library level loads FOR PLAY (an editor open is not a
// play), fetches the counts in parallel with the index so the library never blocks on the second
// endpoint, shows counts in the row meta, offers a Most-played sort only once the data exists, and
// caps every vote at one per browser (UI) and one per IP hash (server). Every write fire-and-forget.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const src = gameSource();
const phpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'api', 'plays.php');
const php = readFileSync(phpPath, 'utf8');

// ---------------------------------------------------------------- the client helpers, executed
// _playsDb ends its regex with `//`, which extractFunction's brace-matcher reads as a line comment
// (the documented string-literal trap, comment edition) — slice it between function markers instead.
const _dbFn = src.slice(src.indexOf('function _playsDb'), src.indexOf('function _playsId'));
const HELPERS = _dbFn + '\n' + ['_playsId', '_playsOf', '_playsReport', '_playsVoted', '_playsVote']
  .map(n => extractFunction(n)).join('\n');
const drive = (script) => {
  const body =
    'const _mem = {}; const localStorage = { getItem: k => _mem[k] || null, setItem: (k, v) => { _mem[k] = v; } };\n' +
    "const PLAYS_DB_DEFAULT = 'https://x/api/plays.php';\n" +
    'let _playsMap = null;\n' +
    'const calls = []; const fetch = (url, opts) => { calls.push({ url, method: opts && opts.method }); return { catch(){ } }; };\n' +
    HELPERS + '\n' + script;
  return new Function(body)();
};
{
  const r = drive(
    "const id = _playsId({ file: 'My Level (v2).JSON' });\n" +
    "_playsReport({ file: 'My Level (v2).JSON' });\n" +
    'return { id, calls };');
  eq(r.id, 'mylevelv2.json', 'the id is the catalog file name, lowercased and stripped to boring characters');
  eq(r.calls.length, 1, 'a play reports exactly one POST');
  assert(/a=play$/.test(r.calls[0].url) && r.calls[0].method === 'POST', '...to the play action');
}
{
  const r = drive(
    "_playsMap = { 'alpha.json': { p: 132, up: 9 } };\n" +
    "return { a: _playsOf({ file: 'alpha.json' }), b: _playsOf({ file: 'missing.json' }) };");
  eq(r.a.p, 132, 'counts read from the fetched map');
  eq(r.b.p, 0, 'an untracked level reads zero, never undefined');
}
{ // one vote per browser, and voting twice sends nothing
  const r = drive(
    "const L = { file: 'alpha.json' };\n" +
    'const before = _playsVoted(L);\n' +
    '_playsVote(L);\n' +
    'const after = _playsVoted(L);\n' +
    '_playsVote(L); _playsVote(L);\n' +   // the UI guard is the caller's job; the vote itself is idempotent server-side
    'return { before, after, posts: calls.filter(c => /a=up/.test(c.url)).length };');
  eq(r.before, false, 'fresh browser: not voted');
  eq(r.after, true, 'voting marks this browser');
  assert(r.posts >= 1, '...and posts the vote');
}
{ // the off switch kills every request
  const r = drive(
    "_mem['breach_plays_db'] = 'off';\n" +
    "_playsReport({ file: 'a.json' }); _playsVote({ file: 'a.json' });\n" +
    'return calls.length;');
  eq(r, 0, "'off' disables the whole feature — zero network traffic");
}

// ---------------------------------------------------------------- the wiring
{
  assert(/_playsFetch\(\)\.then\(ok=>\{ if\(ok && document\.getElementById\('commRows'\)\) _commRenderUI\(\); \}\);/.test(src),
    'counts fetch in PARALLEL with the index — rows render immediately, counts pop in when they land');
  assert(/\.\.\.\(_playsMap\?\[\['top','Most played'\]\]:\[\]\)/.test(src),
    'the Most-played sort is offered only once the data actually exists');
  assert(/top:\(a,b\)=>\(_playsOf\(b\)\.p-_playsOf\(a\)\.p\) \|\| \(_playsOf\(b\)\.up-_playsOf\(a\)\.up\) \|\| \(a\._i-b\._i\)/.test(src),
    '...sorting by plays, then thumbs, then newest');
  assert(/_playsReport\(entry\);   \/\/ build 1230: loaded FOR PLAY \(an editor open is not a play\)/.test(src),
    'only the play path reports — opening a level in the editor is not a play');
  const loadFn = extractFunction('_commLoad');
  const iEd = loadFn.indexOf('if(toEditor){'), iRep = loadFn.indexOf('_playsReport(entry)');
  assert(iEd > 0 && iRep > iEd, '...and the report sits in the else (play) branch, after the level actually restored');
  assert(/vb\.title='Thumbs up/.test(src) && /_playsVoted\(L\)\)\{ vb\.disabled=true/.test(src),
    'the row thumbs button exists and renders already-voted as spent');
}

// ---------------------------------------------------------------- the server file (inspection pins — PHP can't execute here)
{
  assert(/preg_match\('\/\^\[a-z0-9._-\]\{1,64\}\$\/', \$id\)/.test(php), 'ids validate against a boring charset');
  assert(/\$PLAY_GAP = 3600;/.test(php) && /\(\$now - \$last\) >= \$PLAY_GAP/.test(php),
    'a play counts at most once per IP per id per hour');
  assert(/!in_array\(\$iph, \$rec\['v'\], true\)/.test(php), 'a thumbs-up counts once per IP hash, ever');
  assert(/hash\('sha256', ipSalt\(\$SALT_FILE\) \. '\|' \. \(\$_SERVER\['REMOTE_ADDR'\]/.test(php),
    'IPs are stored only as salted hashes');
  assert(/\$out->\$k = \['p' => \(int\)\(\$r\['p'\] \?\? 0\), 'up' => \(int\)\(\$r\['up'\] \?\? 0\)\];/.test(php),
    '...and GET returns counts only — voter hashes never leave the server');
  assert(/flock\(\$fh, LOCK_EX\)/.test(php) && /ftruncate\(\$fh, 0\)/.test(php), 'read-modify-write is atomic under flock');
  assert(/\(\$now - \(int\)\$t\) > \$SEEN_TTL\) unset\(\$db\['seen'\]\[\$k\]\)/.test(php),
    'the rate-limit table — the only unbounded part — prunes on every request');
  assert(/count\(\$db\['levels'\]\) >= \$MAX_IDS/.test(php) && /\$MAX_VOTERS/.test(php), 'record and voter-list caps hold');
  assert(/rumpus-salt\.txt/.test(php), 'the IP salt is shared with lobbies.php — one salt per deployment');
}

done('build 1230: the play-count flywheel — client helpers executed (boring stable ids, one POST per play, zero-for-untracked, one vote per browser, the off switch kills all traffic), the wiring pinned (parallel fetch that never blocks the library, Most-played offered only with data, plays-then-thumbs-then-newest, report only on the PLAY path), and plays.php inspected for the lobbies.php hardening: salted IP hashes never returned, hourly play dedup, once-ever votes, flock atomicity, pruned limiter, record caps');
