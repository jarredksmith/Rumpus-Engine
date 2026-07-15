<?php
// RUMPUS ENGINE — community level submission endpoint (build 958).
// POST JSON {name, author, desc?, code} — code is the game's RUMPUSLVL:/BREACHLVL: share code.
// Submissions are FULLY validated here (decode, caps, shape) so junk never enters the queue,
// then stored in api/pending/ for review in admin.php. Nothing publishes without approval.
define('RUMPUS_COMM', 1);
require __DIR__ . '/_community_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: content-type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST') jsonOut(405, ['error' => 'POST only']);

$MAX_PENDING        = 200;   // global queue cap
$MAX_PENDING_PER_IP = 5;
$MIN_INTERVAL       = (int)(getenv('RUMPUS_SUBMIT_INTERVAL') ?: 30);   // seconds between submissions per IP

$raw = file_get_contents('php://input', false, null, 0, COMM_LIMITS['code'] + 4096);
if ($raw === false || strlen($raw) > COMM_LIMITS['code'] + 2048) jsonOut(413, ['error' => 'submission too large']);
$b = json_decode($raw, true);
if (!is_array($b)) jsonOut(400, ['error' => 'bad json']);

$ip = ipHash();
$now = time();
$pend = pendingDir();

// rate limiting + per-IP cap (scan the queue — it's capped small)
$mine = 0; $total = 0; $lastMine = 0;
foreach (glob($pend . '/sub_*.json') ?: [] as $f) {
  $total++;
  $r = json_decode((string)@file_get_contents($f), true);
  if (is_array($r) && ($r['ipHash'] ?? '') === $ip) { $mine++; $lastMine = max($lastMine, (int)($r['ts'] ?? 0)); }
}
$rateFile = $pend . '/_rate.json';
$rate = json_decode((string)@file_get_contents($rateFile), true); if (!is_array($rate)) $rate = [];
foreach ($rate as $k => $t) { if ($now - (int)$t > 3600) unset($rate[$k]); }
$lastMine = max($lastMine, (int)($rate[$ip] ?? 0));
if ($now - $lastMine < $MIN_INTERVAL) jsonOut(429, ['error' => 'please wait a moment between submissions']);
if ($mine >= $MAX_PENDING_PER_IP) jsonOut(429, ['error' => 'you already have ' . $mine . ' levels waiting for review']);
if ($total >= $MAX_PENDING) jsonOut(503, ['error' => 'the review queue is full — try again later']);

// validate NOW so garbage never sits in the queue
$v = validateSubmission($b['name'] ?? '', $b['author'] ?? '', $b['desc'] ?? '', $b['code'] ?? '', 'x');
if (!$v['ok']) jsonOut(400, ['error' => $v['reason']]);

$id = 'sub_' . $now . '_' . bin2hex(random_bytes(4));
$rec = ['name' => plain($b['name'], COMM_LIMITS['name']), 'author' => plain($b['author'], COMM_LIMITS['author']),
        'desc' => plain($b['desc'] ?? '', COMM_LIMITS['desc']), 'code' => (string)$b['code'],
        'ts' => $now, 'ipHash' => $ip];
if (@file_put_contents($pend . '/' . $id . '.json', json_encode($rec), LOCK_EX) === false)
  jsonOut(500, ['error' => 'could not store the submission']);
$rate[$ip] = $now;
@file_put_contents($rateFile, json_encode($rate), LOCK_EX);
notifyModerator($rec, $total + 1);
jsonOut(200, ['ok' => true, 'id' => $id]);

// ---- moderator alerts (both optional; failures never affect the submission) ----
// $NOTIFY_EMAIL: any address — sent via PHP mail() from noreply@<your domain>. Check spam the
// first time. $NOTIFY_DISCORD: a Discord channel webhook URL (Server Settings -> Integrations ->
// Webhooks -> Copy URL) — instant push on your phone via the Discord app, never lands in spam.
function notifyModerator($rec, $queueLen) {
  $NOTIFY_EMAIL   = 'CHANGE-ME';   // e.g. 'you@example.com'  ('' or CHANGE-ME = off)
  $NOTIFY_DISCORD = '';            // e.g. 'https://discord.com/api/webhooks/…'  ('' = off)

  $host = preg_replace('/[^a-z0-9.\-]/i', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'www.rumpusengine.com'));
  $review = 'https://' . $host . '/api/admin.php';
  $line = '"' . $rec['name'] . '" by ' . $rec['author']
        . ($rec['desc'] !== '' ? ' — ' . $rec['desc'] : '')
        . ' (' . max(1, round(strlen($rec['code']) / 1024)) . ' KB, ' . $queueLen . ' pending)';

  if ($NOTIFY_EMAIL !== '' && strpos($NOTIFY_EMAIL, 'CHANGE-ME') === false) {
    // plain() already stripped control chars from name/author/desc, so headers can't be injected
    @mail($NOTIFY_EMAIL,
          'RUMPUS ENGINE: level awaiting review — ' . $rec['name'],
          "A new community level was submitted.\n\n" . $line . "\n\nReview + test play: " . $review . "\n",
          'From: noreply@' . preg_replace('/^www\./', '', $host) . "\r\nContent-Type: text/plain; charset=utf-8");
  }
  if ($NOTIFY_DISCORD !== '' && strpos($NOTIFY_DISCORD, 'discord.com/api/webhooks/') !== false) {
    $payload = json_encode(['content' => "🕹️ **New level awaiting review**\n" . $line . "\n" . $review]);
    @file_get_contents($NOTIFY_DISCORD, false, stream_context_create(['http' => [
      'method' => 'POST', 'header' => "Content-Type: application/json\r\n",
      'content' => $payload, 'timeout' => 4, 'ignore_errors' => true,
    ]]));
  }
}
