import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 321: animated gun viewmodels (idle loop, shoot + reload one-shots)
assert(/const _GUN_CLIP_RE = \{ idle:/.test(src), 'gun clip name patterns exist');
const pg = extractFunction('playGunStates');
assert(/if\(!idle && !shoot && !reload\) return null/.test(pg), 'unrecognizable models fall back');
assert(/acts\.idle\.loop=THREE\.LoopRepeat; acts\.idle\.play\(\)/.test(pg), 'idle loops');
assert(/a\.loop=THREE\.LoopOnce/.test(pg), 'shoot/reload are one-shots');
assert(/addEventListener\('finished'/.test(pg) && /acts\.idle\.reset\(\)\.play\(\)/.test(pg), 'idle resumes after a one-shot');

const tg = extractFunction('triggerGunAnim');
assert(/gunModelByWep\[curWep\]/.test(tg), 'targets the active weapon model');
assert(/st==='shoot'.*fireRate.*\/1000/.test(tg.replace(/\n/g,' ')), 'shoot clip fits the fire interval');
assert(/st==='reload'.*reloadMs.*\/1000/.test(tg.replace(/\n/g,' ')), 'reload clip spans the reload time');
assert(/a\.timeScale=Math\.min\(4, Math\.max\(0\.25, dur\/win\)\)/.test(tg), 'timescale clamped');
assert(/acts\.idle\.stop\(\)/.test(tg) && /a\.reset\(\)\.play\(\)/.test(tg), 'one-shot replaces idle');

// loader prefers states, records names, falls back
assert(/_gunClipNames\[key\] = \(gltf\.animations\|\|\[\]\)\.map/.test(src), 'discovered clip names recorded for the editor');
assert(/if\(!_playWepStates\(key, model, gltf\)\) playModelAnimations\(model, gltf\)/.test(src), 'state clips preferred (gun or fists), loop-all fallback');

// gameplay triggers
assert(/triggerGunAnim\('shoot'\);   \/\/ fire the model's shoot clip if it has one/.test(src), 'shoot() triggers the clip');
assert(/triggerGunAnim\('shoot'\); meleeAttack\(w\)/.test(src), 'melee swing triggers too');
assert(/reloading = true; SFX\.reload\(\); triggerGunAnim\('reload'\)/.test(src), 'reload triggers the clip');

// persistence: serialized + restored on all three weapons paths
assert(/if\(w\.model \|\| w\.view \|\| w\.clips \|\| dmgChg \|\| w\.noMuzzle\) acc\[k\]=\{ model:w\.model\|\|'', view:w\.view\|\|null, clips:w\.clips\|\|null, dmg: dmgChg \? w\.dmg : undefined, noMuzzle: w\.noMuzzle \? true : undefined \}/.test(src), 'clips (and changed damage + muzzle toggle) serialized');
assert((src.match(/Object\.assign\(_wepClipBlank\(k\), wd\.clips\)/g)||[]).length>=3, 'clips restored at boot + net-load + restoreLevel (fists-aware defaults)');

// editor picker
assert(/if\(editorActive==='gun'\)\{   \/\/ animation mapping/.test(src), 'gun tab has the clip mapping UI');
assert(/_rebuildGunStates\(curWep\)/.test(src), 'changing a mapping rebuilds the actions live');
const rb = extractFunction('_rebuildGunStates');
assert(/gltfCache\[wepModelUrl\(key\)\]/.test(rb), 'rebuild reuses the cached gltf');
assert(/mixers\.splice\(mi,1\)/.test(rb), 'old mixer removed from the tick list');
done();
