<?php
// RUMPUS ENGINE — creator asset uploads: models, textures, sounds (build 974/975).
// Upload your own file once, use it by URL everywhere — levels, share codes, published games.
//   POST   ?type=model|texture|sound&name=<filename>&k=<owner key>  (body = the raw bytes)
//                                                                    -> {ok, slug, url, bytes}
//   DELETE ?type=<type>&slug=<slug>&k=<owner key>                    -> {ok}
// The bytes must really be the media they claim — a signature ('magic bytes') check on both client
// and server picks the canonical extension and rejects anything else, so nothing that isn't a
// model/image/sound can land. Files serve from community/<models|textures|sounds>/ (CORS-open,
// script execution hard-off via .htaccess); metadata lives in api/<type>smeta/ (web-denied).
// Owner key stored hashed: same filename + same key replaces in place; delete is key-gated.
// Caps (env-tunable): model 8 MB, texture/sound 4 MB; 20 files + 60 MB per key (shared across
// types); 1000 files + 3 GB global; 20s between uploads per IP. NOTE: PHP's post_max_size must be
// >= the largest cap (see server/README.md).
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: content-type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
define('RUMPUS_COMM', 1);
require __DIR__ . '/_community_lib.php';

$MAX = ['model' => (int)(getenv('RUMPUS_MODEL_MAX') ?: 8388608),
        'texture' => (int)(getenv('RUMPUS_TEXTURE_MAX') ?: 4194304),
        'sound' => (int)(getenv('RUMPUS_SOUND_MAX') ?: 4194304)];
$PER_KEY   = (int)(getenv('RUMPUS_UPLOADS_PER_KEY') ?: 20);
$BYTES_KEY = (int)(getenv('RUMPUS_UPLOAD_BYTES_PER_KEY') ?: 62914560);
$MAX_FILES = (int)(getenv('RUMPUS_UPLOADS_MAX') ?: 1000);
$MAX_DISK  = (int)(getenv('RUMPUS_UPLOADS_DISK') ?: 3221225472);
$INTERVAL  = (int)(getenv('RUMPUS_UPLOAD_INTERVAL') ?: 20);

// Signature check -> canonical extension, or '' if the bytes aren't the claimed media.
function sniffAsset($type, $b) {
  $len = strlen($b);
  if ($type === 'model') {
    if ($len < 12 || substr($b, 0, 4) !== 'glTF') return '';
    $ver = unpack('V', substr($b, 4, 4))[1]; $dlen = unpack('V', substr($b, 8, 4))[1];
    return ($ver === 2 && $dlen === $len) ? 'glb' : '';   // declared length == arrived => not truncated
  }
  if ($type === 'texture') {
    if (substr($b, 0, 8) === "\x89PNG\r\n\x1a\n") return 'png';
    if (substr($b, 0, 3) === "\xFF\xD8\xFF") return 'jpg';
    if (substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WEBP') return 'webp';
    return '';
  }
  if ($type === 'sound') {
    if (substr($b, 0, 4) === 'OggS') return 'ogg';
    if (substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WAVE') return 'wav';
    if (substr($b, 0, 3) === 'ID3') return 'mp3';
    if ($len >= 2 && ord($b[0]) === 0xFF && (ord($b[1]) & 0xE0) === 0xE0) return 'mp3';   // MPEG frame sync
    return '';
  }
  return '';
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$type = (string)($_GET['type'] ?? 'model');
if (!in_array($type, assetTypes(), true)) jsonOut(400, ['error' => 'unknown upload type']);
$key = (string)($_GET['k'] ?? '');
if (!preg_match('/^[0-9a-f]{16,64}$/', $key)) jsonOut(400, ['error' => 'missing owner key — upload from inside the game']);
$kh = hash('sha256', $key);

if ($method === 'DELETE') {
  $slug = (string)($_GET['slug'] ?? '');
  if (!preg_match('/^[a-z0-9\-]{1,64}\.[a-z0-9]{2,5}$/', $slug) && !preg_match('/^[a-z0-9\-]{1,64}$/', $slug))
    jsonOut(400, ['error' => 'bad slug']);
  // slug may or may not carry the extension; the meta file is keyed by the extension-less slug
  $base = preg_replace('/\.[a-z0-9]{2,5}$/', '', $slug);
  $mf = assetMetaDir($type) . '/' . $base . '.json';
  $meta = json_decode((string)@file_get_contents($mf), true);
  if (!is_array($meta)) jsonOut(404, ['error' => 'no such upload']);
  if (!hash_equals((string)($meta['keyHash'] ?? ''), $kh)) jsonOut(403, ['error' => 'not your upload']);
  @unlink(assetFilesDir($type) . '/' . $base . '.' . ($meta['ext'] ?? 'bin'));
  @unlink($mf);
  jsonOut(200, ['ok' => true]);
}
if ($method !== 'POST') jsonOut(405, ['error' => 'POST the bytes to upload, DELETE to remove']);

$ip = ipHash();
$rf = __DIR__ . '/uploads_rate.json';   // web-denied by api/.htaccess like every .json here
$rate = json_decode((string)@file_get_contents($rf), true); if (!is_array($rate)) $rate = [];
$now = time();
foreach ($rate as $k2 => $t) { if ($now - (int)$t > 86400) unset($rate[$k2]); }
if ($now - (int)($rate[$ip] ?? 0) < $INTERVAL) jsonOut(429, ['error' => 'uploading too fast — wait a moment and try again']);

$cap = $MAX[$type];
$body = file_get_contents('php://input', false, null, 0, $cap + 16);
$len = strlen((string)$body);
if ($len === 0) jsonOut(400, ['error' => 'empty upload — if the file is large, the server\'s post_max_size may be below the cap']);
if ($len > $cap) jsonOut(413, ['error' => 'the file is over the ' . round($cap / 1048576, 1) . ' MB cap for ' . $type . 's — compress it and try again']);

$ext = sniffAsset($type, $body);
if ($ext === '') {
  $hint = $type === 'model' ? '.glb (binary glTF 2.0)' : ($type === 'texture' ? 'a PNG, JPEG or WebP image' : 'an MP3, OGG or WAV sound');
  jsonOut(400, ['error' => 'that is not ' . $hint . ' — or the upload was cut short']);
}

// per-key + global quotas across ALL types (a full scan at these caps is fine — metas are tiny)
$mine = 0; $mineBytes = 0; $all = 0; $allBytes = 0;
foreach (assetTypes() as $t) {
  foreach (glob(assetMetaDir($t) . '/*.json') ?: [] as $f) {
    $m = json_decode((string)@file_get_contents($f), true);
    if (!is_array($m)) continue;
    $all++; $allBytes += (int)($m['bytes'] ?? 0);
    if (($m['keyHash'] ?? '') === $kh) { $mine++; $mineBytes += (int)($m['bytes'] ?? 0); }
  }
}

// slug from the filename; re-uploading your own name (same type) replaces in place, else uniquify
$base = strtolower(preg_replace('/^-+|-+$/', '', preg_replace('/[^a-z0-9]+/', '-', strtolower(preg_replace('/\.[a-z0-9]+$/i', '', (string)($_GET['name'] ?? ''))))));
$base = substr($base, 0, 48) ?: $type;
$slug = $base; $replacing = false; $mf = null;
for ($n = 2; ; $n++) {
  $cand = assetMetaDir($type) . '/' . $slug . '.json';
  $m = json_decode((string)@file_get_contents($cand), true);
  if (!is_array($m)) break;
  if (hash_equals((string)($m['keyHash'] ?? ''), $kh)) {
    $replacing = true; $mf = $cand; $mineBytes -= (int)($m['bytes'] ?? 0); $allBytes -= (int)($m['bytes'] ?? 0);
    @unlink(assetFilesDir($type) . '/' . $slug . '.' . ($m['ext'] ?? 'bin'));   // old ext may differ (jpg -> png)
    break;
  }
  $slug = $base . '-' . $n;
}
if (!$replacing) {
  if ($all >= $MAX_FILES || $allBytes + $len > $MAX_DISK) jsonOut(503, ['error' => 'the upload space is full — try again another day']);
  if ($mine >= $PER_KEY) jsonOut(429, ['error' => 'you already have ' . $mine . ' uploads — delete one first']);
}
if ($mineBytes + $len > $BYTES_KEY) jsonOut(429, ['error' => 'this would put you over your ' . round($BYTES_KEY / 1048576) . ' MB upload space — delete something first']);

$fname = $slug . '.' . $ext;
if (@file_put_contents(assetFilesDir($type) . '/' . $fname, $body, LOCK_EX) === false) jsonOut(500, ['error' => 'could not write the file']);
$meta = ['slug' => $slug, 'type' => $type, 'ext' => $ext, 'name' => plain((string)($_GET['name'] ?? ''), 80),
         'bytes' => $len, 'keyHash' => $kh, 'ip' => $ip, 'date' => gmdate('Y-m-d')];
if (@file_put_contents(assetMetaDir($type) . '/' . $slug . '.json', json_encode($meta), LOCK_EX) === false) {
  @unlink(assetFilesDir($type) . '/' . $fname);
  jsonOut(500, ['error' => 'could not write the record']);
}
$rate[$ip] = $now; @file_put_contents($rf, json_encode($rate), LOCK_EX);
$host = preg_replace('/[^a-z0-9.\-]/i', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'www.rumpusengine.com'));
jsonOut(200, ['ok' => true, 'slug' => $slug, 'bytes' => $len,
  'url' => 'https://' . $host . '/community/' . assetKind($type) . '/' . $fname]);
