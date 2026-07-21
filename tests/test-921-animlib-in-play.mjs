// (build 921) THE T-POSE IN PLAY — the animation library worked in the editor preview but the player
// T-posed in actual play. The in-play third-person body is built from myCharCfg(), a field-whitelist
// written before build 919 that silently dropped animLib: without the flag the library clips never
// attached in play, the saved per-state picks pointed at clip names that don't exist, and the state
// machine fell back to the model's first clip (a T-pose on these rigs). Four sibling whitelists had
// the same leak: the level serializer's enemies + roster blocks, the roster snapshot, and the
// roster->editor load. All five now carry animLib.
// Verified live: with the library on, the in-play body (ensureOwnAvatar -> myCharCfg) held 39 state
// actions (idle=Idle_Loop, run=Jog_Fwd_Loop), bones moved under the mixer, and roster snapshot +
// level serialize round-trips kept the flag for player, enemies and roster.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// 1) myCharCfg — the in-play body, MP broadcast and cutscene avatar all read this
const mcc = extractFunction('myCharCfg', src);
assert(/animLib:\(typeof c\.animLib==='string' && ANIM_LIB_PACKS\[c\.animLib\]\)\?c\.animLib:''/.test(mcc),
  'myCharCfg carries animLib (the in-play T-pose leak)');

// 2+3) level serializer: enemies + roster blocks keep the flag
assert(/clip:m\.clip, animLib:m\.animLib\|\|'', autoRig:m\.autoRig\|\|undefined, clips:Object\.assign\(\{\}, m\.clips\)/.test(src),
  'serializeLevel.enemies keeps animLib');
assert(/roster: charRoster\.map\(c=>\(\{ name:c\.name,[^}]*animLib:c\.animLib\|\|''/.test(src),
  'serializeLevel.roster keeps animLib');

// 4) roster snapshot ("Add current player model")
assert(/_snapshotPlayerCharCfg[\s\S]{0,400}thumb:c\.thumb, animLib:c\.animLib\|\|''/.test(src),
  'the roster snapshot keeps animLib');

// 5) roster -> editor load restores it
const lce = extractFunction('_loadCharIntoEditor', src);
assert(/animLib:c\.animLib\|\|''/.test(lce), 'loading a roster character back restores animLib');

done('build 921: the animation library follows the player INTO play — no more T-pose');
