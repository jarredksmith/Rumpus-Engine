<?php
// build 1015 — optional per-deployment ICE (STUN/TURN) config.
// The game fetches this once per session; if it returns a non-empty JSON array of
// {urls, username?, credential?} entries, they replace the built-in defaults.
// Configure by setting RUMPUS_ICE_JSON in the environment (cPanel: Setup PHP, or .htaccess
// SetEnv) to a JSON array, e.g. supplying Cloudflare/Twilio TURN credentials:
//   RUMPUS_ICE_JSON=[{"urls":["stun:stun.l.google.com:19302"]},{"urls":"turn:your.turn:3478","username":"u","credential":"c"}]
// Empty / unset -> [] and the game keeps its defaults. Nothing here is secret-sensitive
// beyond the TURN credentials you choose to publish to your own players.
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

$raw = getenv('RUMPUS_ICE_JSON');
if (!$raw) { echo '[]'; exit; }
$cfg = json_decode($raw, true);
if (!is_array($cfg)) { echo '[]'; exit; }
$out = [];
foreach ($cfg as $e) {
    if (!is_array($e) || !isset($e['urls'])) continue;
    $row = ['urls' => $e['urls']];
    if (isset($e['username']))   $row['username']   = (string)$e['username'];
    if (isset($e['credential'])) $row['credential'] = (string)$e['credential'];
    $out[] = $row;
}
echo json_encode($out);
