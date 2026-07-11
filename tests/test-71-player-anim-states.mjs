// (build 103) The player avatar uses the same idle/walk/run state machine as enemies, switched by the
// avatar's movement, with per-state clip overrides + preview buttons in the Player editor.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/const PLAYER_MODEL0 = \{ url:'', scale:1, face:0, rx:0, rz:0, yoff:0, xoff:0, zoff:0, thumb:'', animLib:'', ikHold:true, clips:\{ idle:'', walk:'', run:'', attack:'' \} \}/.test(src), 'player config has a clip state-map (build 919 animLib; build 937 ikHold)');
const bav = extractFunction('buildAvatarVisual');
assert(/playEnemyStates\(model, gltf, mc\.clips\)/.test(bav), 'avatar uses the state machine');
assert(/playerModelClips = \(gltf\.animations\|\|\[\]\)\.map\(a=>a\.name\|\|''\)/.test(bav), 'records avatar clip names on load');

// movement drives walk/run/idle
const ni = extractFunction('netInterpolate');
assert(/const tier = rp\._aspd > \(rp\._wasRun\?0\.06:0\.105\) \? 'run'/.test(ni) && /setEnemyAnimState\(rp\.mesh, _st\)/.test(ni), 'avatar state from low-passed travel (build 519: directional via _locoSlot, hysteresis tier)');

// editor dropdowns + clickable state-name preview (build 496: replaced the button grid)
assert(/'edPlayerClip_'\+stKey/.test(src), 'player editor has per-state dropdowns');
assert(/playerModelCfg\.clips\[stKey\]=sel\.value; rebuildAvatars\(\)/.test(src), 'dropdown sets the override + rebuilds');
assert(/if\(previewAvatar\) setEnemyAnimState\(previewAvatar, stKey\)/.test(src), 'clicking a state name previews its clip');

// level sync
assert(/player:  \{ url: playerModelCfg\.url, thumb: playerModelCfg\.thumb\|\|'', animLib: playerModelCfg\.animLib\|\|'', ikHold:\(playerModelCfg\.ikHold===false\)\?false:true, state: Object\.assign\(\{\}, editorTargets\.player\.state\), clips: Object\.assign\(\{\}, playerModelCfg\.clips\), clipSpeed: Object\.assign\(\{\}, playerModelCfg\.clipSpeed\|\|\{\}\), clipHold: Object\.assign\(\{\}, playerModelCfg\.clipHold\|\|\{\}\), clipInPlace: Object\.assign\(\{\}, playerModelCfg\.clipInPlace\|\|\{\}\) \}/.test(src), 'serializes the avatar clips (with speed+hold+in-place, build 493; animLib 919; ikHold 937)');
const ap = extractFunction('applyPlayerLevel');
assert(/playerModelCfg\.clips=Object\.assign\(\{ idle:'', walk:'', run:'', attack:'' \}, pl\.clips\|\|\{\}\)/.test(ap), 'adopts the level avatar clips');
done('player avatar animation states');
