<?php
// RUMPUS ENGINE — live lobby directory (build 956).
// One self-contained endpoint, flat-file storage, no database needed.
// Upload to public_html/api/lobbies.php on any PHP host (GoDaddy cPanel: PHP 7.4+ works).
//
//   GET    lobbies.php            -> { "<code>": {code,name,mode,players,age}, ... }  (fresh lobbies only)
//   PUT    lobbies.php?c=<code>   -> heartbeat/upsert; JSON body {name,mode,players,key}
//   DELETE lobbies.php?c=<code>&k=<key> -> close the lobby (key must match the creating host's)
//   OPTIONS                       -> CORS preflight
//
// Hardening: per-record owner key (first PUT wins the code; later writes need the same key),
// server-side field validation + length caps, per-IP lobby cap, global record cap, request-body
// cap, stale pruning on every request (server clock only — client clocks are never trusted),
// atomic writes under flock. IPs are stored only as salted hashes, never returned.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: content-type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }

$TTL        = (int)(getenv('RUMPUS_LOBBY_TTL') ?: 20);   // seconds without a heartbeat before a lobby is dead
$MAX_ROOMS  = 200;                                        // global cap
$MAX_PER_IP = 3;                                          // one player shouldn't own the whole list
$MAX_BODY   = 2048;                                       // bytes

$FILE = __DIR__ . '/rumpus-lobbies.json';
$SALT_FILE = __DIR__ . '/rumpus-salt.txt';

function respond($codeHttp, $obj) { http_response_code($codeHttp); echo json_encode($obj); exit; }

// stable secret salt for IP hashing, created once server-side
function ipSalt($sf) {
  if (is_file($sf)) { $s = trim((string)@file_get_contents($sf)); if ($s !== '') return $s; }
  $s = bin2hex(random_bytes(16)); @file_put_contents($sf, $s, LOCK_EX); return $s;
}

$code = isset($_GET['c']) ? strtolower(trim((string)$_GET['c'])) : '';
if ($code !== '' && !preg_match('/^[a-z0-9]{4,12}$/', $code)) respond(400, ['error' => 'bad code']);

// ---- open + lock the store (read-modify-write is atomic under this lock) ----
$fh = fopen($FILE, 'c+');
if (!$fh) respond(500, ['error' => 'storage unavailable']);
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$db = json_decode($raw ?: '{}', true);
if (!is_array($db)) $db = [];

// prune stale lobbies on every request — the server clock is the only clock
$now = time();
foreach ($db as $k => $r) {
  if (!is_array($r) || !isset($r['beat']) || ($now - (int)$r['beat']) > $TTL) unset($db[$k]);
}

function saveAndClose($fh, $db) {
  ftruncate($fh, 0); rewind($fh);
  fwrite($fh, json_encode($db)); fflush($fh);
  flock($fh, LOCK_UN); fclose($fh);
}

if ($method === 'GET') {
  $out = new stdClass();
  foreach ($db as $k => $r) {
    $out->$k = [
      'code'    => $r['code'],
      'name'    => $r['name'],
      'mode'    => $r['mode'],
      'players' => $r['players'],
      'age'     => max(0, $now - (int)$r['beat']),   // seconds since last heartbeat (server clock)
    ];
  }
  saveAndClose($fh, $db);   // persist the pruning
  respond(200, $out);
}

if ($method === 'PUT') {
  if ($code === '') { saveAndClose($fh, $db); respond(400, ['error' => 'code required']); }
  $rawBody = file_get_contents('php://input', false, null, 0, $MAX_BODY + 1);
  if ($rawBody === false || strlen($rawBody) > $MAX_BODY) { saveAndClose($fh, $db); respond(413, ['error' => 'body too large']); }
  $b = json_decode($rawBody, true);
  if (!is_array($b)) { saveAndClose($fh, $db); respond(400, ['error' => 'bad json']); }

  $key = isset($b['key']) && is_string($b['key']) ? $b['key'] : '';
  if (!preg_match('/^[a-f0-9]{16,64}$/', $key)) { saveAndClose($fh, $db); respond(400, ['error' => 'bad key']); }
  $keyHash = hash('sha256', $key);

  // the first PUT owns the code; later writes must present the same key
  if (isset($db[$code]) && !hash_equals($db[$code]['keyHash'], $keyHash)) {
    saveAndClose($fh, $db); respond(403, ['error' => 'not your lobby']);
  }

  $ipHash = hash('sha256', ipSalt($SALT_FILE) . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
  if (!isset($db[$code])) {
    $mine = 0; foreach ($db as $r) { if (($r['ipHash'] ?? '') === $ipHash) $mine++; }
    if ($mine >= $MAX_PER_IP) { saveAndClose($fh, $db); respond(429, ['error' => 'too many lobbies from this address']); }
    if (count($db) >= $MAX_ROOMS) { saveAndClose($fh, $db); respond(503, ['error' => 'lobby list full, try again soon']); }
  }

  $name = isset($b['name']) && is_string($b['name']) ? $b['name'] : 'Host';
  $name = preg_replace('/[\x00-\x1f\x7f<>&"\'`]/u', '', $name);           // control chars + HTML metacharacters out
  $name = trim(mb_substr($name, 0, 24)); if ($name === '') $name = 'Host';
  $mode = isset($b['mode']) && is_string($b['mode']) && preg_match('/^[a-z]{2,8}$/', $b['mode']) ? $b['mode'] : 'coop';
  $players = isset($b['players']) ? (int)$b['players'] : 1;
  if ($players < 1) $players = 1; if ($players > 32) $players = 32;

  $db[$code] = ['code' => $code, 'name' => $name, 'mode' => $mode, 'players' => $players,
                'beat' => $now, 'keyHash' => $keyHash, 'ipHash' => $ipHash];
  saveAndClose($fh, $db);
  respond(200, ['ok' => true]);
}

if ($method === 'DELETE') {
  if ($code === '') { saveAndClose($fh, $db); respond(400, ['error' => 'code required']); }
  $key = isset($_GET['k']) && is_string($_GET['k']) ? $_GET['k'] : '';
  if (isset($db[$code])) {
    if (!preg_match('/^[a-f0-9]{16,64}$/', $key) || !hash_equals($db[$code]['keyHash'], hash('sha256', $key))) {
      saveAndClose($fh, $db); respond(403, ['error' => 'not your lobby']);
    }
    unset($db[$code]);
  }
  saveAndClose($fh, $db);
  respond(200, ['ok' => true]);
}

saveAndClose($fh, $db);
respond(405, ['error' => 'method not allowed']);
