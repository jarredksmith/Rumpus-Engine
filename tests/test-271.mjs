import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 376: per-state animation speed. Each player clip slot has a speed multiplier (0.1–4, default 1)
// applied via setEffectiveTimeScale; adjustable live in the editor and persisted/synced with the character.

// setEnemyAnimState reads a per-state speed from the avatar's animCfg and applies it (default 1)
const sa = extractFunction('setEnemyAnimState');
assert(/const _cfg = v\.userData\.animCfg \|\| \(body\.userData && body\.userData\.animCfg\);/.test(sa), 'reads the avatar anim config');
// build 1304: the loop mode belongs to the RESOLVED slot, not the requested name — a one-shot request
// falling back to a looping slot was stamping LoopOnce onto it (idle froze; see test-1304). An authored
// override is still honoured, looked up under the requested name first and the resolved slot second.
assert(/_cfg\.clipSpeed && _cfg\.clipSpeed\[_pick\(_cfg\.clipSpeed\)\] != null\) \? Math\.max\(0\.1, Math\.min\(4, \+_cfg\.clipSpeed\[_pick\(_cfg\.clipSpeed\)\]\)\) : 1/.test(sa), 'per-state speed, clamped 0.1–4, default 1');
assert(/const _pick = \(m\) => \(m && m\[state\] != null\) \? state : key;/.test(sa), '...looked up by requested name, then resolved slot');
assert(/next\.setEffectiveTimeScale\(_spd\);/.test(sa), 'speed applied to the action');

// the cfg is stashed on the visual at both build sites so the read above resolves
assert((src.match(/model\.userData\.animCfg = mc;/g)||[]).length === 2, 'animCfg stashed on the avatar at both build paths');

// live re-scale helper updates the currently-playing action without a rebuild
const live = extractFunction('applyAnimSpeedLive');
assert(/acts\[key\]\.setEffectiveTimeScale\(spd\)/.test(live), 'live helper re-scales the active action');
assert(/previewAvatar/.test(live) && /_ownAvatar/.test(live), 'applies to the preview + the local player');

// editor: a speed input per state, clamped + wired live
assert(/spd\.type='number'; spd\.min='0\.1'; spd\.max='4'/.test(src), 'a speed number-input per clip row');
assert(/playerModelCfg\.clipSpeed\[stKey\]=v; spd\.value=String\(v\); applyAnimSpeedLive\(stKey, v\);/.test(src), 'speed input persists to cfg + applies live');

// persisted/synced with the character
assert(/clipSpeed:Object\.assign\(\{\}, c\.clipSpeed\|\|\{\}\)/.test(src), 'clipSpeed rides the serialized character config');
assert(/clipSpeed:\{\}/.test(src), 'playerModelCfg seeds an empty clipSpeed map');
done();
