<?php
// RUMPUS ENGINE — creator model uploads (build 974).
// Upload your own .glb once, use it by URL everywhere — levels, share codes, published games.
//   POST   ?name=<filename>&k=<owner key>  (body = the raw .glb bytes)  -> {ok, slug, url, bytes}
//   DELETE ?slug=<slug>&k=<owner key>                                   -> {ok}
// The bytes must really be binary glTF 2.0 — the GLB header (magic 'glTF', version 2, declared
// length == body length) is verified, so nothing that isn't a model can land here. Files serve
// from community/models/<slug>.glb (CORS-open, script execution hard-off via .htaccess);
// metadata lives in api/modelsmeta/ (web-denied). Same owner-key pattern as unlisted games:
// the key is stored hashed; re-uploading the same filename with the same key replaces in place,
// and only the uploader (or admin.php) can delete. Caps, all env-tunable: 8 MB/file
// (RUMPUS_MODEL_MAX), 10 files + 40 MB per key (RUMPUS_MODELS_PER_KEY / _MODEL_BYTES_PER_KEY),
// 500 files + 2 GB global (RUMPUS_MODELS_MAX / _MODELS_DISK), 20s between uploads per IP
// (RUMPUS_UPLOAD_INTERVAL). NOTE: PHP's post_max_size must be >= the file cap (see server/README.md).
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: content-type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
define('RUMPUS_COMM', 1);
require __DIR__ . '/_community_lib.php';

$MAX_BYTES = (int)(getenv('RUMPUS_MODEL_MAX') ?: 8388608);
$PER_KEY   = (int)(getenv('RUMPUS_MODELS_PER_KEY') ?: 10);
$BYTES_KEY = (int)(getenv('RUMPUS_MODEL_BYTES_PER_KEY') ?: 41943040);
$MAX_FILES = (int)(getenv('RUMPUS_MODELS_MAX') ?: 500);
$MAX_DISK  = (int)(getenv('RUMPUS_MODELS_DISK') ?: 2147483648);
$INTERVAL  = (int)(getenv('RUMPUS_UPLOAD_INTERVAL') ?: 20);

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$key = (string)($_GET['k'] ?? '');
if (!preg_match('/^[0-9a-f]{16,64}$/', $key)) jsonOut(400, ['error' => 'missing owner key — upload from inside the game']);

if ($method === 'DELETE') {
  $slug = (string)($_GET['slug'] ?? '');
  if (!preg_match('/^[a-z0-9\-]{1,64}$/', $slug)) jsonOut(400, ['error' => 'bad slug']);
  $mf = modelsMetaDir() . '/' . $slug . '.json';
  $meta = json_decode((string)@file_get_contents($mf), true);
  if (!is_array($meta)) jsonOut(404, ['error' => 'no such model']);
  if (!hash_equals((string)($meta['keyHash'] ?? ''), hash('sha256', $key))) jsonOut(403, ['error' => 'not your upload']);
  @unlink(modelsDir() . '/' . $slug . '.glb');
  @unlink($mf);
  jsonOut(200, ['ok' => true]);
}
if ($method !== 'POST') jsonOut(405, ['error' => 'POST the .glb bytes to upload, DELETE to remove']);

$ip = ipHash();
$rf = __DIR__ . '/models_rate.json';   // web-denied by api/.htaccess like every .json here
$rate = json_decode((string)@file_get_contents($rf), true); if (!is_array($rate)) $rate = [];
$now = time();
foreach ($rate as $k2 => $t) { if ($now - (int)$t > 86400) unset($rate[$k2]); }
if ($now - (int)($rate[$ip] ?? 0) < $INTERVAL) jsonOut(429, ['error' => 'uploading too fast — wait a moment and try again']);

$body = file_get_contents('php://input', false, null, 0, $MAX_BYTES + 16);
$len = strlen((string)$body);
if ($len === 0) jsonOut(400, ['error' => 'empty upload — if the file is large, the server\'s post_max_size may be below the cap']);
if ($len > $MAX_BYTES) jsonOut(413, ['error' => 'the file is over the ' . round($MAX_BYTES / 1048576, 1) . ' MB cap — compress it (gltf.report or gltfpack) and try again']);

// binary glTF 2.0 header: magic 'glTF', version 2, declared total length == what actually arrived
$ver = $len >= 12 ? unpack('V', substr($body, 4, 4))[1] : 0;
$dlen = $len >= 12 ? unpack('V', substr($body, 8, 4))[1] : -1;
if ($len < 12 || substr($body, 0, 4) !== 'glTF' || $ver !== 2 || $dlen !== $len)
  jsonOut(400, ['error' => 'that is not a .glb (binary glTF 2.0) file — or the upload was cut short']);

// per-key + global quotas (metas are tiny; a full scan at these caps is fine)
$mine = 0; $mineBytes = 0; $all = 0; $allBytes = 0; $kh = hash('sha256', $key);
foreach (glob(modelsMetaDir() . '/*.json') ?: [] as $f) {
  $m = json_decode((string)@file_get_contents($f), true);
  if (!is_array($m)) continue;
  $all++; $allBytes += (int)($m['bytes'] ?? 0);
  if (($m['keyHash'] ?? '') === $kh) { $mine++; $mineBytes += (int)($m['bytes'] ?? 0); }
}

// slug from the filename; re-uploading your own name replaces in place, someone else's uniquifies
$base = strtolower(preg_replace('/^-+|-+$/', '', preg_replace('/[^a-z0-9]+/', '-', strtolower(preg_replace('/\.glb$/i', '', (string)($_GET['name'] ?? ''))))));
$base = substr($base, 0, 48) ?: 'model';
$slug = $base; $replacing = false;
for ($n = 2; ; $n++) {
  $m = json_decode((string)@file_get_contents(modelsMetaDir() . '/' . $slug . '.json'), true);
  if (!is_array($m)) break;
  if (hash_equals((string)($m['keyHash'] ?? ''), $kh)) { $replacing = true; $mineBytes -= (int)($m['bytes'] ?? 0); $allBytes -= (int)($m['bytes'] ?? 0); break; }
  $slug = $base . '-' . $n;
}
if (!$replacing) {
  if ($all >= $MAX_FILES || $allBytes + $len > $MAX_DISK) jsonOut(503, ['error' => 'the model space is full — try again another day']);
  if ($mine >= $PER_KEY) jsonOut(429, ['error' => 'you already have ' . $mine . ' uploads — delete one first']);
}
if ($mineBytes + $len > $BYTES_KEY) jsonOut(429, ['error' => 'this would put you over your ' . round($BYTES_KEY / 1048576) . ' MB upload space — delete something first']);

if (@file_put_contents(modelsDir() . '/' . $slug . '.glb', $body, LOCK_EX) === false) jsonOut(500, ['error' => 'could not write the model file']);
$meta = ['slug' => $slug, 'name' => plain((string)($_GET['name'] ?? ''), 80), 'bytes' => $len,
         'keyHash' => $kh, 'ip' => $ip, 'date' => gmdate('Y-m-d')];
if (@file_put_contents(modelsMetaDir() . '/' . $slug . '.json', json_encode($meta), LOCK_EX) === false) {
  @unlink(modelsDir() . '/' . $slug . '.glb');
  jsonOut(500, ['error' => 'could not write the model record']);
}
$rate[$ip] = $now; @file_put_contents($rf, json_encode($rate), LOCK_EX);
$host = preg_replace('/[^a-z0-9.\-]/i', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'www.rumpusengine.com'));
jsonOut(200, ['ok' => true, 'slug' => $slug, 'bytes' => $len,
  'url' => 'https://' . $host . '/community/models/' . $slug . '.glb']);
