import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 514: co-op enemy reactions. Enemies travel a separate E/enemyMeshes path that didn't carry hit
// info, so clients never saw them flinch. Now enemyHurt records a networked dir/seq, the world snapshot
// carries hd/hs per enemy, a client's hit supplies the shooter position, and the client animates enemy
// meshes (locomotion + directional flinch), mirroring the remote-player resolver.

// ---- enemyHurt records the networked flinch (dir code + bumped seq), like botHurt ----
const eh = extractFunction('enemyHurt');
assert(/en\._netHitDir=\(_dn==='Front'\?0:_dn==='Back'\?1:_dn==='Left'\?2:3\); en\._netHitSeq=\(\(en\._netHitSeq\|\|0\)\+1\)&255;/.test(eh),
  'enemyHurt records the directional hit + bumps the sequence');

// ---- the world snapshot carries hd/hs per enemy ----
assert(/const E=enemies\.map\(e=>\(\{ id:e\.id, p:\[[^\]]+\], hd:e\._netHitDir\|\|0, hs:e\._netHitSeq\|\|0 \}\)\);/.test(src),
  'each enemy in the snapshot carries hd/hs');

// ---- a client shooting an enemy now supplies its position (directional flinch) ----
assert(/msg\.t==='hit'\)\{ const en=enemies\.find\(e=>e\.id===msg\.e\); if\(en\)\{ spark\([^)]*\); const _s=NET\.players\[id\]; _coopKillFor=id; const _killed=enemyHurt\(en, _netDmgBudget\(id,'pve',_netDmg\(msg\.d\)\), \(_s&&_s\.posEye\)\?_s\.posEye\.x:null, \(_s&&_s\.posEye\)\?_s\.posEye\.z:null\); _coopKillFor=null; if\(_killed\) sendToPlayer\(id, \{t:'frag'\}\); \}/.test(src),
  'a client hit on an enemy is credited with the shooter position');

// ---- client ingest stores hd/hs and seeds _lastHs so spawning never flinches ----
const ue = extractFunction('upsertEnemyMesh');
assert(/_lastHs:\(e\.hs\|\|0\)/.test(ue), 'a new enemy mesh seeds _lastHs (no spawn flinch)');
assert(/em\.hd=e\.hd\|\|0; em\.hs=e\.hs\|\|0;/.test(ue), 'each update refreshes the enemy hd/hs');

// ---- client animates enemy meshes: fresh hit -> directional flinch, else locomotion ----
assert(/if\(em\.hs!=null && em\.hs!==em\._lastHs\)\{ em\._lastHs=em\.hs; em\._hitT=performance\.now\(\)\+260; em\._hitDir=\(em\.hd\|0\); \}/.test(src),
  'a fresh networked hit arms the enemy flinch one-shot');
assert(/if\(em\._hitT && performance\.now\(\) < em\._hitT\) _st=\['hitFront','hitBack','hitLeft','hitRight'\]\[em\._hitDir\|\|0\];/.test(src),
  'the flinch plays the directional hit clip, overriding locomotion');
assert(/setEnemyAnimState\(em\.mesh, _st\);/.test(src), 'the client drives the enemy mesh animation state');

done();
