<?php
// RUMPUS ENGINE — instant UNLISTED game publishing (build 972).
// The reviewed community library (submit.php) is opt-in discovery; THIS endpoint is the other
// half: a creator publishes a game page reachable only by its URL, immediately, with no review.
// Same validation + text sanitizer as the library. An owner key (client-generated hex, stored
// hashed) lets the same creator update or delete their slug later.
//   POST   {name, author, desc?, code, key, slug?} -> {ok, slug, url, playUrl}   (slug = update in place)
//   DELETE ?slug=<slug>&k=<key>                    -> {ok}
// Levels land in community/games/<slug>.json (CORS-open, NOT in the library index); metadata in
// api/gamesmeta/<slug>.json (web-denied by api/.htaccess) for game.php unfurls + admin moderation.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: content-type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
define('RUMPUS_COMM', 1);
require __DIR__ . '/_community_lib.php';

$PUBLISH_INTERVAL = (int)(getenv('RUMPUS_PUBLISH_INTERVAL') ?: 60);   // seconds between publishes per IP
$MAX_GAMES        = (int)(getenv('RUMPUS_MAX_GAMES') ?: 500);         // global cap
$MAX_PER_IP       = (int)(getenv('RUMPUS_GAMES_PER_IP') ?: 20);

function gameHost() { return preg_replace('/[^a-z0-9.\-]/i', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'www.rumpusengine.com')); }

$method = $_SERVER['REQUEST_METHOD'] ?? '';

if ($method === 'DELETE') {
  $slug = (string)($_GET['slug'] ?? '');
  $key  = (string)($_GET['k'] ?? '');
  if (!preg_match('/^[a-z0-9\-]{1,64}$/', $slug) || !preg_match('/^[0-9a-f]{16,64}$/', $key)) jsonOut(400, ['error' => 'bad slug or key']);
  $mf = gamesMetaDir() . '/' . $slug . '.json';
  $meta = json_decode((string)@file_get_contents($mf), true);
  if (!is_array($meta)) jsonOut(404, ['error' => 'no such game']);
  if (!hash_equals((string)($meta['keyHash'] ?? ''), hash('sha256', $key))) jsonOut(403, ['error' => 'not your game']);
  @unlink(gamesDir() . '/' . $slug . '.json');
  @unlink($mf);
  jsonOut(200, ['ok' => true]);
}
if ($method !== 'POST') jsonOut(405, ['error' => 'POST to publish, DELETE to remove']);

$body = file_get_contents('php://input', false, null, 0, COMM_LIMITS['code'] + 8192);
$in = json_decode((string)$body, true);
if (!is_array($in)) jsonOut(400, ['error' => 'the body is not JSON']);
$key = (string)($in['key'] ?? '');
if (!preg_match('/^[0-9a-f]{16,64}$/', $key)) jsonOut(400, ['error' => 'missing owner key — publish from inside the game']);

// same slug + same key = update in place; same slug + different key = someone else's URL
$slugIn = (string)($in['slug'] ?? '');
$isUpdate = false;
if ($slugIn !== '') {
  if (!preg_match('/^[a-z0-9\-]{1,64}$/', $slugIn)) jsonOut(400, ['error' => 'bad slug']);
  $old = json_decode((string)@file_get_contents(gamesMetaDir() . '/' . $slugIn . '.json'), true);
  if (is_array($old)) {
    if (!hash_equals((string)($old['keyHash'] ?? ''), hash('sha256', $key))) jsonOut(403, ['error' => 'that game URL belongs to someone else']);
    $isUpdate = true;
  }
}

$ip = ipHash();
$rf = __DIR__ . '/games_rate.json';   // web-denied by api/.htaccess like every .json here
$rate = json_decode((string)@file_get_contents($rf), true); if (!is_array($rate)) $rate = [];
$now = time();
foreach ($rate as $k => $t) { if ($now - (int)$t > 86400) unset($rate[$k]); }
if ($now - (int)($rate[$ip] ?? 0) < $PUBLISH_INTERVAL) jsonOut(429, ['error' => 'publishing too fast — wait a moment and try again']);

$v = validateSubmission($in['name'] ?? '', $in['author'] ?? '', $in['desc'] ?? '', $in['code'] ?? '', 'x');
if (!$v['ok']) jsonOut(400, ['error' => $v['reason']]);

if ($isUpdate) {
  $slug = $slugIn;
} else {
  $metas = glob(gamesMetaDir() . '/*.json') ?: [];
  if (count($metas) >= $MAX_GAMES) jsonOut(503, ['error' => 'the game space is full — try again another day']);
  $mine = 0;
  foreach ($metas as $f) { $m = json_decode((string)@file_get_contents($f), true); if (is_array($m) && ($m['ip'] ?? '') === $ip) $mine++; }
  if ($mine >= $MAX_PER_IP) jsonOut(429, ['error' => 'you already have ' . $mine . ' published games — unpublish one first']);
  // a clean slug from the game name, uniquified only when taken (never shadow a library level)
  $base = strtolower(preg_replace('/^-+|-+$/', '', preg_replace('/[^a-z0-9]+/', '-', strtolower($v['entry']['name']))));
  $base = substr($base, 0, 48) ?: 'game';
  $slug = $base;
  for ($n = 2; is_file(gamesMetaDir() . '/' . $slug . '.json') || is_file(commDir() . '/levels/' . $slug . '.json'); $n++) $slug = $base . '-' . $n;
}

$level = json_decode($v['levelJson'], true);
// the served copy knows its own URL — a first publish serializes before the slug exists client-side
if (isset($level['homepage']) && is_array($level['homepage'])) $level['homepage']['slug'] = $slug;
if (@file_put_contents(gamesDir() . '/' . $slug . '.json', json_encode($level), LOCK_EX) === false) jsonOut(500, ['error' => 'could not write the game file']);
// the unfurl image: the submit-time screenshot, or the title screen's own backdrop
$og = (string)($v['entry']['thumb'] ?? '');
if ($og === '' && isset($level['homepage']['bg']) && is_string($level['homepage']['bg'])
    && preg_match('#^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$#', $level['homepage']['bg'])
    && strlen($level['homepage']['bg']) <= 150000) $og = $level['homepage']['bg'];
$meta = [
  'slug' => $slug, 'name' => $v['entry']['name'], 'author' => $v['entry']['author'],
  'desc' => (string)($v['entry']['desc'] ?? ''), 'objective' => $v['entry']['objective'],
  'date' => $v['entry']['date'], 'keyHash' => hash('sha256', $key), 'ip' => $ip,
];
if ($og !== '') $meta['thumb'] = $og;
if (@file_put_contents(gamesMetaDir() . '/' . $slug . '.json', json_encode($meta), LOCK_EX) === false) {
  @unlink(gamesDir() . '/' . $slug . '.json');
  jsonOut(500, ['error' => 'could not write the game record']);
}

$rate[$ip] = $now; @file_put_contents($rf, json_encode($rate), LOCK_EX);
$host = gameHost();
jsonOut(200, ['ok' => true, 'slug' => $slug,
  'url' => 'https://' . $host . '/game/' . $slug,
  'playUrl' => 'https://' . $host . '/breach.html?game=' . $slug]);
