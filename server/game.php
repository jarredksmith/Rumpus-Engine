<?php
// RUMPUS ENGINE — /game/<slug> landing page (build 972). Upload to public_html/ BESIDE breach.html
// and add these two lines to public_html/.htaccess:
//   RewriteEngine On
//   RewriteRule ^game/([a-z0-9-]{1,64})/?$ game.php?slug=$1 [L,QSA]
// Crawlers get OpenGraph tags (title / description / image) so shared links unfurl with the game's
// own name and screenshot; browsers are sent straight into the game (breach.html?game=<slug>).
// ?img=<slug> serves the stored screenshot as a real image URL (og:image cannot be a data: URI).
$sl = function ($s) { return preg_match('/^[a-z0-9\-]{1,64}$/', (string)$s) ? (string)$s : ''; };
$lookup = function ($slug) {
  $meta = @json_decode((string)@file_get_contents(__DIR__ . '/api/gamesmeta/' . $slug . '.json'), true);
  if (is_array($meta)) return $meta;
  // reviewed community levels have no gamesmeta record — fall back to their library index entry
  $idx = @json_decode((string)@file_get_contents(__DIR__ . '/community/index.json'), true);
  foreach ((is_array($idx) ? ($idx['levels'] ?? []) : []) as $l) {
    if (is_array($l) && ($l['file'] ?? '') === $slug . '.json') return $l;
  }
  return null;
};

if (($img = $sl($_GET['img'] ?? '')) !== '') {
  $meta = $lookup($img);
  $t = is_array($meta) ? (string)($meta['thumb'] ?? '') : '';
  if (preg_match('#^data:image/(jpeg|png);base64,([A-Za-z0-9+/=]+)$#', $t, $m)) {
    header('Content-Type: image/' . $m[1]);
    header('Cache-Control: public, max-age=3600');
    echo base64_decode($m[2]);
    exit;
  }
  http_response_code(404); exit;
}

$slug = $sl($_GET['slug'] ?? '');
$meta = $slug !== '' ? $lookup($slug) : null;
if ($slug === '' || !is_array($meta)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'No such game.'; exit; }

$host = preg_replace('/[^a-z0-9.\-]/i', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'www.rumpusengine.com'));
$name = (string)($meta['name'] ?? $slug);
$desc = trim((string)($meta['desc'] ?? ''));
$by   = (string)($meta['author'] ?? 'a Rumpus creator');
$og   = $desc !== '' ? ($desc . ' — play free in your browser, no install.') : ('A game by ' . $by . ' — play free in your browser, no install.');
$pic  = isset($meta['thumb']) ? ('https://' . $host . '/game.php?img=' . $slug) : '';
$play = '/breach.html?game=' . rawurlencode($slug);
$e = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title><?= $e($name) ?> — made with RUMPUS ENGINE</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="RUMPUS ENGINE">
<meta property="og:title" content="<?= $e($name) ?>">
<meta property="og:description" content="<?= $e($og) ?>">
<meta property="og:url" content="https://<?= $e($host) ?>/game/<?= $e($slug) ?>">
<?php if ($pic !== ''): ?><meta property="og:image" content="<?= $e($pic) ?>">
<meta name="twitter:card" content="summary_large_image">
<?php endif; ?>
<meta http-equiv="refresh" content="0;url=<?= $e($play) ?>">
<style>body{background:#05080a;color:#cfe9df;font:15px system-ui,sans-serif;display:flex;min-height:96vh;align-items:center;justify-content:center}a{color:#7fe6cf}</style>
</head><body>
<p>Loading <b><?= $e($name) ?></b>… <a href="<?= $e($play) ?>">tap here if nothing happens</a>.</p>
<script>location.replace(<?= json_encode($play) ?>);</script>
</body></html>
