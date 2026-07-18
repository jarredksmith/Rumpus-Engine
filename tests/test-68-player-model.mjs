// (build 99) Remote/duel avatars can use a custom GLB instead of the blue capsule. Level-synced like
// enemy models; feet on the ground; a hit-cylinder so duel shots register on skinned models.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

const bav = extractFunction('buildAvatarVisual');
assert(/playerModelCfg/.test(bav) && /_loadGLTFWithLib\(mc\.url, mc/.test(bav), 'avatar loads the player model when a url is set (via the anim-library shim, build 919)');
assert(/model\.position\.set\(model\.position\.x-cx\+mc\.xoff, model\.position\.y-lbox\.min\.y\+mc\.yoff/.test(bav), 'model feet sit at the group origin (ground)');
assert(/o\.raycast=\(\)=>\{\}/.test(bav) && /CylinderGeometry\(fr,fr,hb,10\)/.test(bav), 'avatar uses a hit-proxy cylinder for duel shots');
assert(/const PLAYER_MODEL0 = \{ url:'', scale:1, face:0, rx:0, rz:0, yoff:0, xoff:0, zoff:0, thumb:'', animLib:'', ikHold:true, jointFix:\{\}, clips:\{ idle:'', walk:'', run:'', attack:'' \} \}/.test(src), 'player model config default (build 919 animLib; build 937 ikHold)');

const mk = extractFunction('makeRemotePlayer');
assert(/buildAvatarVisual\(g, cfg\)/.test(mk), 'makeRemotePlayer delegates to buildAvatarVisual');

// editor target + level sync
assert(/player: \{\s*\n\s*label: 'Player'/.test(src), 'editor has a Player target/tab');
assert(/getUrl\(\)\{ return playerModelCfg\.url; \}/.test(src), 'Player target reads/writes the model url');
assert(/player:  \{ url: playerModelCfg\.url, thumb: playerModelCfg\.thumb\|\|'', animLib: playerModelCfg\.animLib\|\|'', ikHold:\(playerModelCfg\.ikHold===false\)\?false:true, jointFix:_sanitizeJointFix\(playerModelCfg\.jointFix\), state: Object\.assign\(\{\}, editorTargets\.player\.state\), clips: Object\.assign\(\{\}, playerModelCfg\.clips\), clipSpeed: Object\.assign\(\{\}, playerModelCfg\.clipSpeed\|\|\{\}\), clipHold: Object\.assign\(\{\}, playerModelCfg\.clipHold\|\|\{\}\), clipInPlace: Object\.assign\(\{\}, playerModelCfg\.clipInPlace\|\|\{\}\), grip: _sanitizeGripMap\(tpGunGrips\), view: _snapshotView\(\) \}/.test(src), 'serializeLevel writes the player avatar (with speed+hold+in-place, build 493; animLib 919; ikHold 937)');
assert(/if\(level\.player\) applyPlayerLevel\(level\.player\)/.test(src), 'clients/shared loads adopt the level avatar');
const ap = extractFunction('applyPlayerLevel');
assert(/playerModelCfg\.url=\(pl\.url\|\|''\)\.trim\(\)/.test(ap) && /rebuildAvatars\(\)/.test(ap), 'applyPlayerLevel sets cfg + rebuilds');

// editor preview stand-in
assert(/ensurePlayerPreview\(editorActive==='player'\)/.test(src), 'Player tab shows a preview avatar');
done('player avatar model');
