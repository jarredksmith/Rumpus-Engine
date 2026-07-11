// (build 930) SKETCHFAB RIGS COULDN'T ATTACH THE ANIMATION LIBRARY. Poly Pizza serves original
// GLBs, but Sketchfab RE-PROCESSES models through its glTF pipeline, which dedupes node names with
// numeric suffixes — 'mixamorig:Hips' arrives as 'mixamorig:Hips_01'. Every exact-match pattern in
// _canonBoneKey missed, the humanoid-core gate failed, and dozens of legitimately Mixamo-rigged
// models reported "no recognizable humanoid bones". A failed classification now RETRIES with the
// trailing [_.]NN suffix stripped; UE-style meaningful indices (spine_01, thumb_01_l) match on the
// first pass and never reach the retry. A failed rig also logs a sample of its bone names.
// Verified live: a full Mixamo rig with dedup suffixes on EVERY bone attached 52 clips, with
// tracks written to the suffixed bone names and finite values.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

const retry = extractFunction('_canonSuffixRetry', src);
const body = extractFunction('_canonBoneKey', src);
const canon = new Function(retry + '\n' + body + '\nreturn _canonBoneKey;')();

// the Sketchfab shapes that used to fail
eq(canon('mixamorig:Hips_01'), 'hips', 'suffixed hips');
eq(canon('mixamorig:Head_02'), 'head', 'suffixed head');
eq(canon('LeftArm_07'), 'L:uparm', 'suffixed arm');
eq(canon('mixamorigLeftForeArm_12'), 'L:forearm', 'suffixed forearm');
eq(canon('LeftHandThumb1_22'), 'L:thumb1', 'suffixed finger');
eq(canon('mixamorigRightUpLeg_31'), 'R:upleg', 'suffixed leg');

// UE-style meaningful indices are untouched (first-pass matches)
eq(canon('spine_01'), 'spine@1', 'UE spine index intact');
eq(canon('neck_01'), 'neck@1', 'UE neck index intact');
eq(canon('thumb_01_l'), 'L:thumb1', 'UE finger intact');
eq(canon('calf_l'), 'L:lowleg', 'UE calf intact');

// helpers stay excluded even with suffixes
eq(canon('upperarm_twist_01'), null, 'twist bones still excluded');
eq(canon('index_04_leaf_l'), null, 'leaf bones still excluded');
eq(canon('HeadTop_End'), null, 'end bones still excluded');

// both null exits route through the retry, and failed rigs log their bone names
assert(/if\(!side\) return _canonSuffixRetry\(name\);/.test(body), 'sideless misses retry (Hips_01 exits here)');
assert(/return _canonSuffixRetry\(name\);\n\}/.test(body+'\n}') || /return _canonSuffixRetry\(name\);/.test(body), 'tail misses retry');
assert(/Bone names sampled:/.test(src), 'a failed rig logs a sample of its bone names for diagnosis');

done('build 930: Sketchfab-processed Mixamo rigs attach the animation library');
