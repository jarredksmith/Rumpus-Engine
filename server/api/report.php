<?php
// RUMPUS ENGINE — moderation reports (build 1346).
// Sibling of submit.php: one endpoint, flat-file storage, no database needed.
//
//   POST report.php   JSON {kind, reason, target?, note?, text?, room?}  -> {ok:true, id}
//   OPTIONS           -> CORS preflight
//
// kind is chat|level|game|player; reason is a short whitelist. Reports are validated at the
// door so junk never enters the queue, appended to api/pending/ as rep_*.json beside the level
// submissions, and pushed to the moderator through the shared notifyModerator().
//
// WHY `text` AND `room` EXIST — the load-bearing design point. Multiplayer chat in this engine
// is PEER-TO-PEER: a chat line never touches this server, so there is no message id, no log and
// no artifact to look up later. A chat report that carries only "player X was abusive" is an
// accusation the moderator cannot act on. So the client sends the offending line WITH the
// report, and a chat report without one is refused rather than stored unactionable. `room` is
// the lobby code it happened in, which is the only other server-visible handle on the session.
//
// Hardening (submit.php's + lobbies.php's rules): every text field goes through the shared
// plain() sanitizer with a cap, kind/reason are whitelists, the reporter is identified only by
// the salted ipHash() — a raw IP is never stored and never returned — per-reporter rate limit
// and open-report cap, a global cap on stored reports, atomic writes under flock.
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

// what can be reported, and why. Both are whitelists because both select a moderator workflow.
const REPORT_KINDS   = ['chat', 'level', 'game', 'player'];
const REPORT_REASONS = ['harassment', 'sexual', 'violence', 'hate', 'spam', 'other'];
const REPORT_LIMITS  = ['target' => 120, 'note' => 500, 'text' => 300];

$MAX_REPORTS        = 500;   // global stored-report cap — the queue can never grow without bound
$MAX_REPORTS_PER_IP = 20;    // open reports from one reporter
// seconds between reports per reporter. NOT `getenv(…) ?: 20` — the string "0" is FALSY in PHP,
// so that shape silently ignores an operator who sets the interval to 0 (a `||`/`?:` default on a
// numeric knob is a bug waiting for the value to be 0). The sibling endpoints still have it:
// RUMPUS_SUBMIT_INTERVAL and RUMPUS_LOBBY_TTL cannot be set to 0 today.
$envInt = getenv('RUMPUS_REPORT_INTERVAL');
$MIN_INTERVAL       = ($envInt === false || $envInt === '') ? 20 : max(0, (int)$envInt);
$MAX_BODY           = 4096;  // bytes — a report is small; the caps below are far under this

$raw = file_get_contents('php://input', false, null, 0, $MAX_BODY + 1);
if ($raw === false || strlen($raw) > $MAX_BODY) jsonOut(413, ['error' => 'report too large']);
$b = json_decode($raw, true);
if (!is_array($b)) jsonOut(400, ['error' => 'bad json']);

// a client can put anything in a JSON field; take only scalars, never an array cast to "Array"
$str = function ($k) use ($b) { return (isset($b[$k]) && is_scalar($b[$k])) ? (string)$b[$k] : ''; };

$ip = ipHash();
$now = time();
$pend = pendingDir();

// ---- rate limiting + per-reporter cap (scan the queue — it's capped small) ----
$mine = 0; $lastMine = 0; $all = [];
foreach (glob($pend . '/rep_*.json') ?: [] as $f) {
  $r = json_decode((string)@file_get_contents($f), true);
  $ts = is_array($r) ? (int)($r['ts'] ?? 0) : 0;
  $all[] = ['f' => $f, 'ts' => $ts];
  if (is_array($r) && ($r['ipHash'] ?? '') === $ip) { $mine++; $lastMine = max($lastMine, $ts); }
}
// own rate file, NOT submit.php's: reporting abuse must never be blocked by having just
// submitted a level, and vice versa.
$rateFile = $pend . '/_reprate.json';
$rate = json_decode((string)@file_get_contents($rateFile), true); if (!is_array($rate)) $rate = [];
foreach ($rate as $k => $t) { if ($now - (int)$t > 3600) unset($rate[$k]); }   // the only unbounded part — pruned every request
$lastMine = max($lastMine, (int)($rate[$ip] ?? 0));
// `retry` is seconds — the client can disable its Report button for exactly that long instead of
// guessing, which is the difference between a usable form and one that just says no.
if ($now - $lastMine < $MIN_INTERVAL)
  jsonOut(429, ['error' => 'please wait a moment between reports', 'retry' => $MIN_INTERVAL - ($now - $lastMine)]);
if ($mine >= $MAX_REPORTS_PER_IP) jsonOut(429, ['error' => 'you already have ' . $mine . ' reports waiting for review']);

// ---- validate NOW so garbage never sits in the queue ----
$kind = strtolower(trim($str('kind')));
if (!in_array($kind, REPORT_KINDS, true))
  jsonOut(400, ['error' => 'kind must be one of: ' . implode(', ', REPORT_KINDS)]);
$reason = strtolower(trim($str('reason')));
if ($reason === '') $reason = 'other';
if (!in_array($reason, REPORT_REASONS, true))
  jsonOut(400, ['error' => 'reason must be one of: ' . implode(', ', REPORT_REASONS)]);

$target = plain($str('target'), REPORT_LIMITS['target']);   // level file / game slug / player name
$note   = plain($str('note'),   REPORT_LIMITS['note']);     // free text from the reporter
$text   = plain($str('text'),   REPORT_LIMITS['text']);     // the reported message itself (chat)
$room   = strtolower(trim($str('room')));
// lobbies.php's own code shape. A malformed one is DROPPED, not fatal — it is context, and
// losing a report because the room code was odd would be the wrong trade.
if (!preg_match('/^[a-z0-9]{4,12}$/', $room)) $room = '';

// The chat rule, stated where it bites: no evidence, no report.
if ($kind === 'chat' && $text === '')
  jsonOut(400, ['error' => 'a chat report must include the reported message — chat is peer-to-peer, so the server has no copy of it']);
if ($kind !== 'chat' && $target === '')
  jsonOut(400, ['error' => 'target required — the level file, game slug or player name being reported']);

// ---- store ----
// Keep the queue bounded WITHOUT ever turning a report away: at the cap the OLDEST reports are
// dropped instead of the newest being refused. Refusing (submit.php's 503) is right for level
// submissions and wrong here — it would let a flood of junk reports silence the real ones.
if (count($all) >= $MAX_REPORTS) {
  usort($all, function ($x, $y) { return $x['ts'] - $y['ts']; });
  $drop = count($all) - $MAX_REPORTS + 1;
  for ($i = 0; $i < $drop; $i++) @unlink($all[$i]['f']);
}

$id = 'rep_' . $now . '_' . bin2hex(random_bytes(4));
$rec = ['kind' => $kind, 'reason' => $reason, 'target' => $target, 'note' => $note,
        'text' => $text, 'room' => $room, 'ts' => $now, 'ipHash' => $ip];
if (@file_put_contents($pend . '/' . $id . '.json', json_encode($rec), LOCK_EX) === false)
  jsonOut(500, ['error' => 'could not store the report']);
$rate[$ip] = $now;
@file_put_contents($rateFile, json_encode($rate), LOCK_EX);

notifyModerator([
  'subject' => 'report — ' . $kind . ' / ' . $reason,
  'title'   => 'New moderation report',
  'intro'   => 'A player reported content in RUMPUS ENGINE.',
  'line'    => strtoupper($kind) . ' · ' . $reason
             . ($target !== '' ? ' · ' . $target : '')
             . ($room !== '' ? ' · room ' . $room : '')
             . ($text !== '' ? "\n  reported message: \u{201c}" . $text . "\u{201d}" : '')
             . ($note !== '' ? "\n  reporter says: " . $note : '')
             . "\n  (" . min(count($all) + 1, $MAX_REPORTS) . ' reports pending)',
  'cta'     => 'Review reports',
  'icon'    => '🚩',
  'frag'    => '#reports',
]);
jsonOut(200, ['ok' => true, 'id' => $id]);
