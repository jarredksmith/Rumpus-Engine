<?php
// RUMPUS ENGINE — play counts + thumbs-up for the community library (build 1230).
// Sibling of lobbies.php: one self-contained endpoint, flat-file storage, no database needed.
// Upload to public_html/api/plays.php beside lobbies.php (GoDaddy cPanel: PHP 7.4+ works).
//
//   GET  plays.php                 -> { "<id>": {"p":<plays>,"up":<thumbs>}, ... }
//   POST plays.php?id=<id>&a=play  -> count one play   (per IP: at most one per id per hour)
//   POST plays.php?id=<id>&a=up    -> thumbs-up        (per IP: at most one per id, ever)
//   OPTIONS                        -> CORS preflight
//
// Hardening (lobbies.php's rules): the server clock is the only clock, IPs are stored only as
// salted hashes and never returned, id validation + global record cap, atomic writes under flock,
// and the rate-limit table (the only unbounded part) is pruned on every request.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: content-type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }

$MAX_IDS  = 500;     // global cap on tracked levels — matches the library's realistic size by orders of magnitude
$PLAY_GAP = 3600;    // seconds before the same IP can count another play on the same id
$SEEN_TTL = 86400;   // play-limiter entries older than a day are pruned
$MAX_VOTERS = 5000;  // per-id voter-hash list cap (the up-count freezes there rather than growing the file forever)

$FILE = __DIR__ . '/rumpus-plays.json';
$SALT_FILE = __DIR__ . '/rumpus-salt.txt';   // shared with lobbies.php — one salt per deployment

function respond($codeHttp, $obj) { http_response_code($codeHttp); echo json_encode($obj); exit; }

// stable secret salt for IP hashing, created once server-side (same helper as lobbies.php)
function ipSalt($sf) {
  if (is_file($sf)) { $s = trim((string)@file_get_contents($sf)); if ($s !== '') return $s; }
  $s = bin2hex(random_bytes(16)); @file_put_contents($sf, $s, LOCK_EX); return $s;
}

$id = isset($_GET['id']) ? strtolower(trim((string)$_GET['id'])) : '';
if ($id !== '' && !preg_match('/^[a-z0-9._-]{1,64}$/', $id)) respond(400, ['error' => 'bad id']);

// ---- open + lock the store (read-modify-write is atomic under this lock) ----
$fh = fopen($FILE, 'c+');
if (!$fh) respond(500, ['error' => 'storage unavailable']);
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$db = json_decode($raw ?: '{}', true);
if (!is_array($db)) $db = [];
if (!isset($db['levels']) || !is_array($db['levels'])) $db['levels'] = [];
if (!isset($db['seen'])   || !is_array($db['seen']))   $db['seen'] = [];

$now = time();
foreach ($db['seen'] as $k => $t) { if (($now - (int)$t) > $SEEN_TTL) unset($db['seen'][$k]); }

function saveAndClose($fh, $db) {
  ftruncate($fh, 0); rewind($fh);
  fwrite($fh, json_encode($db));
  fflush($fh); flock($fh, LOCK_UN); fclose($fh);
}

if ($method === 'GET') {
  $out = new stdClass();   // {} even when empty, never []
  foreach ($db['levels'] as $k => $r) {
    if (!is_array($r)) continue;
    $out->$k = ['p' => (int)($r['p'] ?? 0), 'up' => (int)($r['up'] ?? 0)];
  }
  saveAndClose($fh, $db);   // persists the pruning
  respond(200, $out);
}

if ($method === 'POST') {
  if ($id === '') { flock($fh, LOCK_UN); fclose($fh); respond(400, ['error' => 'id required']); }
  $act = isset($_GET['a']) ? (string)$_GET['a'] : 'play';
  if ($act !== 'play' && $act !== 'up') { flock($fh, LOCK_UN); fclose($fh); respond(400, ['error' => 'bad action']); }
  if (!isset($db['levels'][$id]) && count($db['levels']) >= $MAX_IDS) { flock($fh, LOCK_UN); fclose($fh); respond(429, ['error' => 'full']); }

  $iph = substr(hash('sha256', ipSalt($SALT_FILE) . '|' . ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 16);
  $rec = (isset($db['levels'][$id]) && is_array($db['levels'][$id])) ? $db['levels'][$id] : ['p' => 0, 'up' => 0, 'v' => []];
  if (!isset($rec['v']) || !is_array($rec['v'])) $rec['v'] = [];

  if ($act === 'play') {
    $sk = 'p|' . $id . '|' . $iph;
    $last = (int)($db['seen'][$sk] ?? 0);
    if (($now - $last) >= $PLAY_GAP) { $rec['p'] = (int)($rec['p'] ?? 0) + 1; $db['seen'][$sk] = $now; }
  } else {   // 'up': once per IP hash, ever — voter hashes live in the record, never in a response
    if (!in_array($iph, $rec['v'], true) && count($rec['v']) < $MAX_VOTERS) {
      $rec['v'][] = $iph; $rec['up'] = (int)($rec['up'] ?? 0) + 1;
    }
  }
  $db['levels'][$id] = $rec;
  saveAndClose($fh, $db);
  respond(200, ['id' => $id, 'p' => (int)$rec['p'], 'up' => (int)$rec['up']]);
}

flock($fh, LOCK_UN); fclose($fh);
respond(405, ['error' => 'method']);
