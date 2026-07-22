// (build 919) BUILT-IN ANIMATION LIBRARY — the multi-step Mixamo pipeline (export every clip as FBX,
// convert, re-upload) collapses to one checkbox. A CC0 clip pack (Quaternius' Universal Animation
// Library, /anims/UAL1_Standard.glb) ships with the game; ticking "Use built-in animation library" on
// the player avatar or an enemy model RETARGETS every clip onto that model's own skeleton:
// _canonBoneKey canonicalizes bone names across conventions (Mixamo/UE/Rigify), _buildBoneMap pairs
// the skeletons (side-aware, chains paired proportionally), _retargetClip resamples world-space
// rotation deltas at 24fps into tracks named for the TARGET rig (+ hip position scaled to hip height).
// Verified live (headless): 42 clips retargeted onto a synthetic Mixamo rig (finite unit quaternions,
// hips bob scaled to the rig), and the full avatar pipeline held 39 state actions with moving bones.
import { gameSource, html, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the pack registry: CC0 pack served from the repo, with curated default per-state picks
assert(/ANIM_LIB_PACKS = \{/.test(src) && /anims\/UAL1_Standard\.glb/.test(src), 'the CC0 pack ships from /anims');
assert(/picks: \{ idle:'Idle_Loop'/.test(src) && /die:'Death01'/.test(src) && /run:'Jog_Fwd_Loop'/.test(src),
  'curated default picks (auto-by-name would mismatch, e.g. idle -> Crouch_Idle_Loop)');

// executable: the canonical bone key unifies Mixamo / UE / Rigify names and rejects helpers
const canon = evalDecl(extractFunction('_canonBoneKey', src), '_canonBoneKey', {});
eq(canon('mixamorig:LeftForeArm'), 'L:forearm', 'Mixamo forearm');
eq(canon('lowerarm_l'), 'L:forearm', 'UE forearm');
eq(canon('forearm.L'), 'L:forearm', 'Rigify forearm');
eq(canon('RightUpLeg'), 'R:upleg', 'Mixamo thigh');
eq(canon('thigh_r'), 'R:upleg', 'UE thigh');
eq(canon('mixamorig1LeftLeg'), 'L:lowleg', "Mixamo 'Leg' is the shin");
eq(canon('pelvis'), 'hips', 'UE pelvis = hips');
eq(canon('mixamorig:Spine1'), 'spine@1', 'spine chain index');
eq(canon('LeftHandThumb2'), 'L:thumb2', "Mixamo finger (leading 'Hand' stripped)");
eq(canon('thumb_02_l'), 'L:thumb2', 'UE finger');
eq(canon('index_04_leaf_l'), null, 'leaf helpers never retarget');
eq(canon('HeadTop_End'), null, 'end helpers never retarget');
eq(canon('upperarm_twist_l'), null, 'twist helpers never retarget');
eq(canon('root'), null, 'the root bone is not retargeted (hips is the retarget root)');

// the retargeter: world-delta resample, tracks named for the TARGET rig, hips position scaled
const rt = extractFunction('_retargetClip', src);
assert(/multiply\(pr\.srcRestInv\)\.multiply\(pr\.align\)\.multiply\(pr\.dstRestW\)/.test(rt), 'world-space rotation delta re-based onto the target rest pose (build 1047: through the rest-direction alignment, so A-pose rigs land T-pose clips)');
assert(/QuaternionKeyframeTrack\(pr\.dst\.name\+'\.quaternion'/.test(rt) && /VectorKeyframeTrack\(hips\.dst\.name\+'\.position'/.test(rt),
  'tracks are written for the TARGET rig bones (+ hips position)');
assert(/hipScale/.test(rt), 'hip travel scales to the target hip height');

// compatibility gate: a rig without the humanoid core refuses cleanly
const bm = extractFunction('_buildBoneMap', src);
assert(/has\('hips'\) && has\('head'\) && has\('L:uparm'\)/.test(bm), 'rigs without a humanoid core are rejected (capsule keeps the model honest)');

// the load path: both builders route through the shim, so the picker + state machine see lib clips
assert(/function _loadGLTFWithLib\(url, cfg, cb, errcb\)\{ loadGLTFCached\(url, \(g\)=>_withLibAnims\(g, cfg, cb\), errcb\); \}/.test(src), 'the shim wraps loadGLTFCached');
eq((src.match(/_loadGLTFWithLib\(mc\.url, mc,/g)||[]).length, 2, 'player avatar + enemy models both attach');

// persistence: level serialize + restore + MP char sanitize all carry animLib
assert(/animLib: playerModelCfg\.animLib\|\|''/.test(src), 'level serialize keeps the flag');
assert(/playerModelCfg\.animLib=\(typeof pl\.animLib==='string' && ANIM_LIB_PACKS\[pl\.animLib\]\)\?pl\.animLib:''/.test(src), 'level restore keeps the flag');
assert(/animLib:\(typeof c\.animLib==='string' && ANIM_LIB_PACKS\[c\.animLib\]\)\?c\.animLib:''/.test(src), 'MP character sanitize keeps the flag (remote players attach on their side)');

// UI + credits
eq((src.match(/Use built-in animation library/g)||[]).length, 2, 'checkbox on the player panel AND the enemy panel');
assert(/Universal Animation Library \(built-in character animations\)', by:'Quaternius', lic:'CC0'/.test(src), 'the pack is credited (CC0, release-clean)');

done('build 919: one checkbox retargets a full CC0 animation set onto any humanoid rig');
