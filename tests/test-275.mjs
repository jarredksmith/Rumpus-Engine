import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 380: (A) per-state loop/HOLD toggle — a state can hold its last frame instead of looping
// (fixes Aim looping forever while right-click is held); (B) 'crouch' animation state.

// --- (A) hold mode, applied live in setEnemyAnimState from cfg.clipHold, default true only for 'die' ---
const sa = extractFunction('setEnemyAnimState');
// build 1304: the loop mode belongs to the RESOLVED slot, not the requested name — a one-shot request
// falling back to a looping slot was stamping LoopOnce onto it (idle froze; see test-1304). An authored
// override is still honoured, looked up under the requested name first and the resolved slot second.
assert(/const _holdDefault = _ANIM_ONESHOT\.has\(key\);/.test(sa), 'one-shot slots hold by default, loops loop (build 486)');
assert(/const _hold = \(_cfg && _cfg\.clipHold && _cfg\.clipHold\[_pick\(_cfg\.clipHold\)\] != null\) \? !!_cfg\.clipHold\[_pick\(_cfg\.clipHold\)\] : _holdDefault;/.test(sa), 'per-state hold override from config');
assert(/if\(_hold\)\{ next\.loop = THREE\.LoopOnce; next\.clampWhenFinished = true; \} else \{ next\.loop = THREE\.LoopRepeat; next\.clampWhenFinished = false; \}/.test(sa), 'hold => play once + clamp last frame; otherwise loop');
// the early-return on same-state keeps a held clip frozen (it does not re-trigger every frame). build 1306
// made that return conditional — a HELD state still returns first and unconditionally, which is this
// assertion's intent; what changed is that a state which is NOT held and has stopped running is re-armed.
assert(/const _same = \(v\.userData\.animState === key\);\n  if\(_same && !restart\)\{\n    if\(_hold\) return;/.test(sa),
  'same-state re-selection is a no-op for a HELD clip, so a held pose stays clamped');   /* build 1307: unless the caller says a NEW event arrived — a second swing must replay */

// config carries clipHold, persisted + serialized
assert(/clipHold:\{\}/.test(src), 'playerModelCfg seeds clipHold');
assert(/clipHold:Object\.assign\(\{\}, c\.clipHold\|\|\{\}\)/.test(src), 'clipHold rides the serialized character');
// editor: a hold checkbox per clip row. build 1306: it defaults to the RUNTIME rule (_ANIM_ONESHOT) rather
// than to 'die' alone — Death still defaults on, and so now do Reload, Jump land, Equip and Move stop,
// which the engine had always played once while the box said they looped.
assert(/hold\.checked = \(playerModelCfg\.clipHold && playerModelCfg\.clipHold\[stKey\]!=null\) \? !!playerModelCfg\.clipHold\[stKey\] : _ANIM_ONESHOT\.has\(stKey\);/.test(src), 'hold checkbox defaults on for Death');
assert(/_ANIM_ONESHOT = new Set\(\[[^\]]*'die'/.test(src), "...because 'die' is in the one-shot set");
assert(/playerModelCfg\.clipHold\[stKey\]=hold\.checked; rebuildAvatars\(\);/.test(src), 'toggling hold updates the cfg + rebuilds');

// --- (B) crouch state ---
assert(/re:\/crouch\|crouched\|kneel\|duck\/i/.test(src), 'crouch auto-matches by clip name (ANIM_SLOTS)');
assert(/re:\/slide\|slid\|dash\/i/.test(src), "slide name-pattern present in ANIM_SLOTS");
assert(/else if\(crouching\)\{ st = _ownSpeed<0\.012 \? 'crouch' : _locoSlot\(mvx,mvz,player\.yaw,'crouch',\(a\.userData\.visual\.userData\.animState\)\|\|''\); \}/.test(src), 'local crouch: idle-crouch when still, directional crouch-walk when moving (build 488)');
assert(/rp\.crouch \? \(md>0\.02 \? _locoSlot\(_dx,_dz,rp\.yaw,'crouch',[^)]*\) : 'crouch'\)/.test(src), 'remote crouch pose (directional) from synced flag (build 497)');
assert((src.match(/cr:crouching\?1:0/g)||[]).length === 2, 'crouch flag on both send sites');
assert(/cr:rp\.crouch\?1:0/.test(src) && /rp\.crouch = !!msg\.cr;/.test(src) && /rp\.crouch=!!pl\.cr;/.test(src), 'crouch relayed + read on both receives');
assert(/k:'crouch',.{0,60}l:'Crouch'/.test(src), 'editor exposes a Crouch clip row (from ANIM_SLOTS)');
done();
