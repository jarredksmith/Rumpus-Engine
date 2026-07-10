import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 501: bring the enemy editor tab to parity with the player tab — per-clip Speed / Hold / In-place,
// a clickable state label to preview, and the build-499 stale-pick prune on model load. The shared animator
// and _lockRootMotion already read these off the visual's animCfg, so enemies honor them once the cfg carries
// the fields. They also persist in the saved level.

// ---- enemy cfg now carries the three per-clip maps (default, back-fill, load, save) ----
assert(/clips:\{ idle:'', walk:'', run:'', attack:'' \}, clipSpeed:\{\}, clipHold:\{\}, clipInPlace:\{\} \};/.test(src), 'ENEMY_MODEL0 default has clipSpeed/clipHold/clipInPlace');
assert(/for\(const _f of \['clipSpeed','clipHold','clipInPlace'\]\) if\(!enemyModels\[k\]\[_f\]\) enemyModels\[k\]\[_f\]=\{\};/.test(src), 'older enemy configs are back-filled with the maps');
assert(/clips: Object\.assign\(\{ idle:'', walk:'', run:'', attack:'' \}, src\.clips\|\|\{\}\), clipSpeed: Object\.assign\(\{\}, src\.clipSpeed\|\|\{\}\), clipHold: Object\.assign\(\{\}, src\.clipHold\|\|\{\}\), clipInPlace: Object\.assign\(\{\}, src\.clipInPlace\|\|\{\}\)/.test(src), 'a saved level loads the enemy maps');
assert(/clips:Object\.assign\(\{\}, m\.clips\), clipSpeed:Object\.assign\(\{\}, m\.clipSpeed\|\|\{\}\), clipHold:Object\.assign\(\{\}, m\.clipHold\|\|\{\}\), clipInPlace:Object\.assign\(\{\}, m\.clipInPlace\|\|\{\}\)/.test(src), 'the level save persists the enemy maps');

// ---- prune stale picks when a different enemy model loads (mirror of build 499) ----
assert(/if\(enemyModelClips\[body\.userData\.enemyType\]\.length && mc\.clips && !\(gltf\.userData && gltf\.userData\._libFailed\)\)\{ for\(const _st in mc\.clips\)\{ const _v=mc\.clips\[_st\]; if\(_v && enemyModelClips\[body\.userData\.enemyType\]\.indexOf\(_v\)<0\) mc\.clips\[_st\]=''; \} \}/.test(src), 'a new enemy model drops per-state picks that named the previous model\u2019s clips');

// ---- the enemy editor exposes the same per-clip controls + clickable preview ----
assert(/if\(typeof previewEnemy!=='undefined' && previewEnemy\) setEnemyAnimState\(previewEnemy, stKey\)/.test(src), 'enemy state label previews the clip on click');
assert(/spd\.onchange=\(\)=>\{ if\(!mc\.clipSpeed\) mc\.clipSpeed=\{\};[\s\S]*?mc\.clipSpeed\[stKey\]=v;[\s\S]*?refreshEnemyVisuals\(\)/.test(src), 'enemy Speed control writes clipSpeed + rebuilds');
assert(/mc\.clipHold\[stKey\]=hold\.checked; refreshEnemyVisuals\(\)/.test(src), 'enemy Hold control writes clipHold + rebuilds');
assert(/mc\.clipInPlace\[stKey\]=ip\.checked; refreshEnemyVisuals\(\)/.test(src), 'enemy In-place control writes clipInPlace + rebuilds');

// ---- executable: the enemy prune behaves like the player's (stale cleared, valid kept, no-anim untouched) ----
function reconcile(cfgClips, modelClips){
  if(modelClips.length && cfgClips){ for(const st in cfgClips){ const v=cfgClips[st]; if(v && modelClips.indexOf(v)<0) cfgClips[st]=''; } }
  return cfgClips;
}
{ const c={ idle:'A_idle', walk:'A_walk', attack:'' }; reconcile(c, ['B_idle','B_run']); assert(c.idle==='' && c.walk==='', 'stale enemy picks cleared'); }
{ const c={ idle:'grunt_idle', walk:'A_walk' }; reconcile(c, ['grunt_idle']); assert(c.idle==='grunt_idle' && c.walk==='', 'valid enemy pick kept, stale one cleared'); }
{ const c={ idle:'A_idle' }; reconcile(c, []); assert(c.idle==='A_idle', 'an animation-less enemy model leaves picks intact'); }

done();
