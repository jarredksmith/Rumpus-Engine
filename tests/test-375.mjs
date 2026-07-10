import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 499 (bugfix): switching the player model left the previous model's per-state clip picks in
// playerModelCfg.clips, and refreshPlayerClipOptions merges saved picks into the dropdown, so the OLD
// model's clip names showed up as stale options alongside the new model's. Fix: when a different model
// finishes loading we now know its real clip list, so we drop any per-state pick that isn't in it.

// ---- the reconciliation runs on the player's own model load ----
assert(/playerModelClips = \(gltf\.animations\|\|\[\]\)\.map\(a=>a\.name\|\|''\);/.test(src), 'player model load discovers the new clip names');
assert(/if\(playerModelClips\.length && playerModelCfg\.clips && !\(gltf\.userData && gltf\.userData\._libFailed\)\)\{ for\(const _st in playerModelCfg\.clips\)\{ const _v=playerModelCfg\.clips\[_st\]; if\(_v && playerModelClips\.indexOf\(_v\)<0\) playerModelCfg\.clips\[_st\]=''; \} \}/.test(src),
  'a new model prunes per-state picks that named the previous model\u2019s clips');

// ---- the dropdown still merges saved picks (so a pre-discovery pick still shows) ----
const rp = extractFunction('refreshPlayerClipOptions');
assert(/const names = playerModelClips\.slice\(\);/.test(rp), 'options start from the discovered clip list');
assert(/for\(const e of Object\.values\(playerModelCfg\.clips\)\)\{ if\(e && names\.indexOf\(e\)<0\) names\.push\(e\); \}/.test(rp), 'pre-discovery merge of saved picks is preserved');

// ---- executable: the prune logic (mirror of the inline reconciliation) ----
function reconcile(cfgClips, modelClips){
  if(modelClips.length && cfgClips){ for(const st in cfgClips){ const v=cfgClips[st]; if(v && modelClips.indexOf(v)<0) cfgClips[st]=''; } }
  return cfgClips;
}
{
  // old model picks A_idle/A_walk; new model only has B_idle/B_walk/B_run
  const cfg = { idle:'A_idle', walk:'A_walk', run:'', attack:'' };
  reconcile(cfg, ['B_idle','B_walk','B_run']);
  assert(cfg.idle==='' && cfg.walk==='', 'stale picks from the previous model are cleared (fall back to Auto)');
}
{
  // a pick the new model actually has is kept
  const cfg = { idle:'hero_idle', walk:'A_walk' };
  reconcile(cfg, ['hero_idle','hero_run']);
  assert(cfg.idle==='hero_idle', 'a valid pick that exists in the new model survives');
  assert(cfg.walk==='', 'the invalid pick alongside it is still cleared');
}
{
  // model arrived with NO animations -> leave the config untouched (nothing to validate against)
  const cfg = { idle:'A_idle', walk:'A_walk' };
  reconcile(cfg, []);
  assert(cfg.idle==='A_idle' && cfg.walk==='A_walk', 'an animation-less model does not wipe saved picks');
}

done();
