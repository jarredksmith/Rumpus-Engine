<?php
// RUMPUS ENGINE — shared community-library helpers (build 958).
// Included by submit.php and admin.php; refuses to run standalone.
if (!defined('RUMPUS_COMM')) { http_response_code(404); exit; }

const COMM_LIMITS = ['json' => 500000, 'name' => 60, 'author' => 40, 'desc' => 200, 'code' => 700000];

function commDir()    { return dirname(__DIR__) . '/community'; }
function pendingDir() { $d = __DIR__ . '/pending'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }
// build 972: unlisted games — levels served CORS-open beside the library, metadata web-denied under api/
function gamesDir()     { $d = commDir() . '/games'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }
function gamesMetaDir() { $d = __DIR__ . '/gamesmeta'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }

function jsonOut($http, $obj) { http_response_code($http); echo json_encode($obj); exit; }

function ipHash() {
  $sf = __DIR__ . '/rumpus-salt.txt';
  $s = is_file($sf) ? trim((string)@file_get_contents($sf)) : '';
  if ($s === '') { $s = bin2hex(random_bytes(16)); @file_put_contents($sf, $s, LOCK_EX); }
  return hash('sha256', $s . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
}

// Strip markdown/HTML metacharacters, collapse whitespace, cap length — same as the GitHub Action.
function plain($s, $max) {
  $s = preg_replace('/[<>`*_\[\]#|]/u', '', (string)$s);
  $s = preg_replace('/\s+/u', ' ', $s);
  return mb_substr(trim($s), 0, $max);
}

// 'RUMPUSLVL:'/'BREACHLVL:' + ('g'+base64url(gzip(json)) | 'r'+base64url(json)) -> JSON text or null.
function decodeLevelCode($code) {
  $s = preg_replace('/^(BREACHLVL|RUMPUSLVL):/', '', trim((string)$code));
  if ($s === '' || !preg_match('/^[gr][A-Za-z0-9_\-]+$/', $s)) return null;
  $tag = $s[0];
  $b64 = strtr(substr($s, 1), '-_', '+/');
  $pad = strlen($b64) % 4; if ($pad) $b64 .= str_repeat('=', 4 - $pad);
  $bytes = base64_decode($b64, true);
  if ($bytes === false) return null;
  if ($tag === 'g') { $bytes = @gzdecode($bytes); if ($bytes === false || $bytes === null) return null; }
  return $bytes;
}

// Port of the GitHub Action's validateSubmission: returns ['ok'=>true,'entry'=>...,'level'=>...]
// or ['ok'=>false,'reason'=>...]. $uniq suffixes the file slug (the Action used the issue number).
function validateSubmission($name, $author, $desc, $code, $uniq) {
  $name = plain($name, COMM_LIMITS['name']);
  $author = plain($author, COMM_LIMITS['author']);
  $desc = plain($desc, COMM_LIMITS['desc']);
  if ($name === '')   return ['ok' => false, 'reason' => 'level name is empty'];
  if ($author === '') return ['ok' => false, 'reason' => 'author name is empty'];
  if (!is_string($code) || strlen($code) > COMM_LIMITS['code']) return ['ok' => false, 'reason' => 'level code missing or too large'];
  $jsonText = decodeLevelCode($code);
  if ($jsonText === null) return ['ok' => false, 'reason' => 'the level code did not decode — submit straight from the game'];
  if (strlen($jsonText) > COMM_LIMITS['json']) return ['ok' => false, 'reason' => 'the level is ' . number_format(strlen($jsonText)) . ' bytes — the library caps levels at ' . number_format(COMM_LIMITS['json'])];
  // OBJECT mode, not assoc: assoc decoding turns every empty JSON object {} into [] on re-encode,
  // which corrupts the game's empty maps (weapons/invItems/clip tables…) in published levels (build 973)
  $level = json_decode($jsonText);
  if (!is_object($level) || (!isset($level->props) && !isset($level->world)))
    return ['ok' => false, 'reason' => 'that code is not a level (no props/world keys)'];
  // lift the screenshot into the gallery index; strip it from the level file itself
  $thumb = '';
  if (isset($level->thumb) && is_string($level->thumb)
      && preg_match('#^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$#', $level->thumb)
      && strlen($level->thumb) <= 100000) $thumb = $level->thumb;
  unset($level->thumb);
  $levelJson = json_encode($level);
  $sketchfab = strpos($levelJson, 'sketchfab:') !== false;
  $slug = strtolower(preg_replace('/^-+|-+$/', '', preg_replace('/[^a-z0-9]+/', '-', strtolower($name))));
  $slug = (substr($slug, 0, 40) ?: 'level') . '-' . $uniq;
  $entry = ['file' => $slug . '.json', 'name' => $name, 'author' => $author];
  if ($desc !== '') $entry['desc'] = $desc;
  $entry['objective'] = (isset($level->game->objective) && is_string($level->game->objective)) ? $level->game->objective : 'eliminate';
  $entry['date'] = gmdate('Y-m-d');
  if ($sketchfab) $entry['sketchfab'] = true;
  if ($thumb !== '') $entry['thumb'] = $thumb;
  return ['ok' => true, 'entry' => $entry, 'levelJson' => $levelJson];
}

// Publish an approved submission: write the level file, prepend the index entry (dedupe by file).
function publishEntry($entry, $levelJson) {
  $dir = commDir();
  if (!is_dir($dir . '/levels')) @mkdir($dir . '/levels', 0755, true);
  if (!preg_match('/^[a-z0-9\-]+\.json$/', $entry['file'])) return 'bad slug';
  if (@file_put_contents($dir . '/levels/' . $entry['file'], $levelJson, LOCK_EX) === false) return 'could not write the level file';
  $idxFile = $dir . '/index.json';
  $fh = fopen($idxFile, 'c+'); if (!$fh) return 'could not open index.json';
  flock($fh, LOCK_EX);
  $idx = json_decode(stream_get_contents($fh) ?: '', true);
  if (!is_array($idx)) $idx = ['levels' => []];
  $keep = [];
  foreach (($idx['levels'] ?? []) as $l) { if (is_array($l) && ($l['file'] ?? '') !== $entry['file']) $keep[] = $l; }
  $idx['levels'] = array_merge([$entry], $keep);
  $idx['updated'] = $entry['date'];
  ftruncate($fh, 0); rewind($fh);
  fwrite($fh, json_encode($idx, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
  fflush($fh); flock($fh, LOCK_UN); fclose($fh);
  return '';
}
