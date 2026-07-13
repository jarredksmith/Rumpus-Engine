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
jsonOut(200, ['ok' => true, 'id' => $id]);
