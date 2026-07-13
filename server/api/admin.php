<?php
// RUMPUS ENGINE — community moderation page (build 958).
// GET  -> the review UI (HTML below). POST JSON {a, pw, ...} -> actions: list / approve / reject / unpublish.
// SETUP (required once): change $ADMIN_PASSWORD below, then upload. The page refuses to act until you do.
define('RUMPUS_COMM', 1);
require __DIR__ . '/_community_lib.php';

$ADMIN_PASSWORD = 'CHANGE-ME';   // <-- EDIT THIS LINE before (or right after) uploading

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST') {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  if ($ADMIN_PASSWORD === 'CHANGE-ME') jsonOut(503, ['error' => 'setup needed: edit $ADMIN_PASSWORD at the top of admin.php']);

  // brute-force brake: max 30 password attempts per IP per hour
  $ip = ipHash();
  $af = pendingDir() . '/_attempts.json';
  $at = json_decode((string)@file_get_contents($af), true); if (!is_array($at)) $at = [];
  $now = time();
  foreach ($at as $k => $v) { if ($now - (int)($v['t'] ?? 0) > 3600) unset($at[$k]); }
  if ((int)($at[$ip]['n'] ?? 0) >= 30) jsonOut(429, ['error' => 'too many attempts — try again later']);

  $b = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
  if (!is_array($b)) jsonOut(400, ['error' => 'bad json']);
  if (!hash_equals(hash('sha256', $ADMIN_PASSWORD), hash('sha256', (string)($b['pw'] ?? '')))) {
    $at[$ip] = ['n' => (int)($at[$ip]['n'] ?? 0) + 1, 't' => $now];
    @file_put_contents($af, json_encode($at), LOCK_EX);
    jsonOut(403, ['error' => 'wrong password']);
  }
  unset($at[$ip]); @file_put_contents($af, json_encode($at), LOCK_EX);

  $a = (string)($b['a'] ?? '');
  $pend = pendingDir();
  $safeId = function ($id) { return preg_match('/^sub_[0-9]+_[a-f0-9]{8}$/', (string)$id) ? (string)$id : ''; };

  if ($a === 'list') {
    $pending = [];
    foreach (glob($pend . '/sub_*.json') ?: [] as $f) {
      $r = json_decode((string)@file_get_contents($f), true);
      if (!is_array($r)) continue;
      $pending[] = ['id' => basename($f, '.json'), 'name' => $r['name'] ?? '', 'author' => $r['author'] ?? '',
                    'desc' => $r['desc'] ?? '', 'ts' => (int)($r['ts'] ?? 0), 'bytes' => strlen($r['code'] ?? ''),
                    'code' => $r['code'] ?? ''];
    }
    usort($pending, function ($x, $y) { return $y['ts'] - $x['ts']; });
    $idx = json_decode((string)@file_get_contents(commDir() . '/index.json'), true);
    $published = [];
    foreach ((is_array($idx) ? ($idx['levels'] ?? []) : []) as $l) {
      if (is_array($l)) $published[] = ['file' => $l['file'] ?? '', 'name' => $l['name'] ?? '', 'author' => $l['author'] ?? '', 'date' => $l['date'] ?? ''];
    }
    jsonOut(200, ['pending' => $pending, 'published' => $published]);
  }

  if ($a === 'approve') {
    $id = $safeId($b['id'] ?? ''); if ($id === '') jsonOut(400, ['error' => 'bad id']);
    $f = $pend . '/' . $id . '.json';
    $r = json_decode((string)@file_get_contents($f), true);
    if (!is_array($r)) jsonOut(404, ['error' => 'submission not found']);
    $v = validateSubmission($r['name'], $r['author'], $r['desc'] ?? '', $r['code'], substr($id, -8));
    if (!$v['ok']) jsonOut(400, ['error' => $v['reason']]);
    $err = publishEntry($v['entry'], $v['levelJson']);
    if ($err !== '') jsonOut(500, ['error' => $err]);
    @unlink($f);
    jsonOut(200, ['ok' => true, 'file' => $v['entry']['file']]);
  }

  if ($a === 'reject') {
    $id = $safeId($b['id'] ?? ''); if ($id === '') jsonOut(400, ['error' => 'bad id']);
    @unlink($pend . '/' . $id . '.json');
    jsonOut(200, ['ok' => true]);
  }

  if ($a === 'unpublish') {
    $file = (string)($b['file'] ?? '');
    if (!preg_match('/^[a-z0-9\-]+\.json$/', $file)) jsonOut(400, ['error' => 'bad file']);
    $idxFile = commDir() . '/index.json';
    $fh = fopen($idxFile, 'c+'); if (!$fh) jsonOut(500, ['error' => 'no index']);
    flock($fh, LOCK_EX);
    $idx = json_decode(stream_get_contents($fh) ?: '', true); if (!is_array($idx)) $idx = ['levels' => []];
    $idx['levels'] = array_values(array_filter($idx['levels'] ?? [], function ($l) use ($file) { return !is_array($l) || ($l['file'] ?? '') !== $file; }));
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($idx, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    @unlink(commDir() . '/levels/' . $file);
    jsonOut(200, ['ok' => true]);
  }

  jsonOut(400, ['error' => 'unknown action']);
}

header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>RUMPUS ENGINE — community review</title>
<style>
body{margin:0;background:#0a1014;color:#dff5ec;font:14px/1.5 system-ui,sans-serif;padding:24px;max-width:900px;margin:0 auto}
h1{font-size:19px;letter-spacing:2px;color:#39ff88} h2{font-size:13px;letter-spacing:2px;color:#9fc4ba;margin:26px 0 8px}
input{background:#101a20;color:#dff5ec;border:1px solid #2a3a42;border-radius:6px;padding:8px 10px;font-size:14px}
button{background:#12351f;color:#8affc0;border:1px solid #39ff88;border-radius:6px;padding:7px 14px;cursor:pointer;font-weight:600}
button.warn{background:#351212;color:#ffb3b3;border-color:#ff6b6b}
button.ghost{background:transparent;color:#9fc4ba;border-color:#2a3a42}
.card{border:1px solid #24323a;border-radius:8px;padding:12px 14px;background:#0c1418;margin-bottom:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.card b{color:#eafff7} .meta{color:#9fc4ba;font-size:12px} .grow{flex:1;min-width:200px}
#msg{color:#ffc9a3;margin:10px 0;min-height:18px} a{color:#7fe6cf}
</style></head><body>
<h1>RUMPUS ENGINE — community review</h1>
<div style="display:flex;gap:8px;align-items:center;margin-top:12px">
  <input id="pw" type="password" placeholder="admin password" style="flex:1;max-width:280px">
  <button onclick="load()">Load queue</button>
</div>
<div id="msg"></div>
<h2>PENDING REVIEW</h2><div id="pending" class="meta">—</div>
<h2>PUBLISHED</h2><div id="published" class="meta">—</div>
<script>
const $=id=>document.getElementById(id);
function pw(){ const v=$('pw').value; try{ sessionStorage.setItem('rumpus_admin_pw', v); }catch(e){} return v; }
try{ $('pw').value=sessionStorage.getItem('rumpus_admin_pw')||''; }catch(e){}
async function api(body){
  const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({error:'bad response'}));
  if(!r.ok){ throw new Error(d.error||('HTTP '+r.status)); }
  return d;
}
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function act(body, okMsg){
  $('msg').textContent='';
  try{ await api(body); $('msg').textContent=okMsg; load(); }
  catch(e){ $('msg').textContent='✕ '+e.message; }
}
async function load(){
  $('msg').textContent='';
  let d; try{ d=await api({a:'list', pw:pw()}); }catch(e){ $('msg').textContent='✕ '+e.message; return; }
  const p=$('pending');
  p.innerHTML = d.pending.length ? '' : 'Queue is empty.';
  for(const s of d.pending){
    const div=document.createElement('div'); div.className='card';
    const when=s.ts?new Date(s.ts*1000).toISOString().slice(0,16).replace('T',' '):'';
    div.innerHTML='<div class="grow"><b>'+esc(s.name)+'</b> <span class="meta">by '+esc(s.author)+' · '+when+' UTC · '
      +Math.round(s.bytes/1024)+' KB</span>'+(s.desc?'<div class="meta">'+esc(s.desc)+'</div>':'')+'</div>';
    const test=document.createElement('a'); test.textContent='▶ Test play'; test.target='_blank';
    test.href='../breach.html#lvl='+encodeURIComponent(String(s.code).replace(/^(RUMPUSLVL|BREACHLVL):/,''));
    const ok=document.createElement('button'); ok.textContent='Approve'; ok.onclick=()=>act({a:'approve',id:s.id,pw:pw()},'✓ published '+s.name);
    const no=document.createElement('button'); no.className='warn'; no.textContent='Reject'; no.onclick=()=>{ if(confirm('Reject "'+s.name+'"?')) act({a:'reject',id:s.id,pw:pw()},'rejected'); };
    div.appendChild(test); div.appendChild(ok); div.appendChild(no); p.appendChild(div);
  }
  const pub=$('published');
  pub.innerHTML = d.published.length ? '' : 'Nothing published yet.';
  for(const l of d.published){
    const div=document.createElement('div'); div.className='card';
    div.innerHTML='<div class="grow"><b>'+esc(l.name)+'</b> <span class="meta">by '+esc(l.author)+' · '+esc(l.date)+' · '+esc(l.file)+'</span></div>';
    const rm=document.createElement('button'); rm.className='warn'; rm.textContent='Unpublish';
    rm.onclick=()=>{ if(confirm('Remove "'+l.name+'" from the library?')) act({a:'unpublish',file:l.file,pw:pw()},'removed'); };
    div.appendChild(rm); pub.appendChild(div);
  }
}
</script></body></html>
