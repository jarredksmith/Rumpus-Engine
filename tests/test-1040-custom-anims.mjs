// (build 1040) CUSTOM ANIMATION FOUNDATION — phase 1 of the in-game animation editor. Clips
// live in the level (customAnims), tracks are keyed by a fixed canonical humanoid vocabulary
// and hold world-space rotation deltas from rest — rig-independent by the same construction as
// _retargetClip — and _caBuildClip samples them onto any humanoid rig as ordinary THREE clips.
// _withLibAnims appends them to the augmented gltf view, so the existing per-state pickers and
// state machine treat them as the model's own.
import * as THREE from 'three';
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = 'const CA_SLOTS = ' + extractConst('CA_SLOTS', src) + ';\n'
  + 'let _caRev = 0;\n'
  + extractFunction('_caNewId', src) + '\n'
  + extractFunction('_caSanitize', src) + '\n'
  + extractFunction('_canonSuffixRetry', src) + '\n'
  + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_caGatherBones', src) + '\n'
  + extractFunction('_caEvalQ', src) + '\n'
  + extractFunction('_caEvalP', src) + '\n'
  + extractFunction('_caBuildClip', src);
const env = new Function('THREE', 'console', glue
  + '\nreturn { san:_caSanitize, gather:_caGatherBones, build:_caBuildClip, slots:CA_SLOTS };')(THREE, console);

// ---- sanitizer: level/share/network data must never be trusted ----
eq(env.san(undefined).length, 0, 'an old level with no customAnims loads as an empty library');
eq(env.san('garbage').length, 0, 'garbage rejects');
eq(env.san([null, 42, 'x']).length, 0, 'junk entries drop');
{
  const d = env.san([{ name:'  Wave  ', dur:2, fps:30, loop:'once', tracks:{ head:{ q:[[0,0,0,0,1],[1,0,0,0.7071,0.7071]] }, bogus:{ q:[[0,0,0,0,1]] } } }])[0];
  assert(/^ca_[a-z0-9]+$/.test(d.id), 'a stable id is minted');
  eq(d.name, 'Wave', 'name trims');
  eq(d.loop, 'once', 'loop mode survives');
  assert(d.tracks.head && !d.tracks.bogus, 'only canonical slots survive');
  near(Math.hypot(...d.tracks.head.q[1].slice(1)), 1, 1e-3, 'quaternions renormalize');
}
{
  const two = env.san([{ id:'ca_dupe1', name:'a', tracks:{} }, { id:'ca_dupe1', name:'b', tracks:{} }]);
  assert(two[0].id !== two[1].id, 'duplicate ids are re-minted');
  const evil = env.san([{ name:'x', tracks:{ head:{ q:[[0,'alert(1)',0,0,1]] } }, onload:'alert(1)' }])[0];
  assert(!evil.onload && !evil.tracks.head, 'non-numeric keys and foreign fields are stripped — imported data is inert');
  eq(env.san([{ tracks:{ head:{ q:[[0,NaN,0,0,1],[0.5,0,0,0,0]] } } }])[0].tracks.head, undefined, 'NaN and zero-length quats drop');
  const clamped = env.san([{ dur:9999, fps:1000, tracks:{} }])[0];
  eq(clamped.dur, 60, 'duration clamps to 60s'); eq(clamped.fps, 60, 'fps clamps to 60');
}

// ---- rigs: mixamo-style and blender-style, same proportions ----
const mkBone = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; };
function mixamoRig(scale = 1) {
  const root = new THREE.Group();
  const hips = mkBone('mixamorigHips', null, 0, 1 * scale, 0); root.add(hips);
  const sp = mkBone('mixamorigSpine', hips, 0, 0.15 * scale, 0);
  const sp1 = mkBone('mixamorigSpine1', sp, 0, 0.15 * scale, 0);
  const sp2 = mkBone('mixamorigSpine2', sp1, 0, 0.15 * scale, 0);
  const nk = mkBone('mixamorigNeck', sp2, 0, 0.1 * scale, 0);
  mkBone('mixamorigHead', nk, 0, 0.1 * scale, 0);
  for (const S of ['Left', 'Right']) {
    const sgn = S === 'Left' ? 1 : -1;
    const sh = mkBone('mixamorig' + S + 'Shoulder', sp2, sgn * 0.08 * scale, 0.05 * scale, 0);
    const ua = mkBone('mixamorig' + S + 'Arm', sh, sgn * 0.12 * scale, 0, 0);
    const fa = mkBone('mixamorig' + S + 'ForeArm', ua, sgn * 0.25 * scale, 0, 0);
    mkBone('mixamorig' + S + 'Hand', fa, sgn * 0.25 * scale, 0, 0);
    const ul = mkBone('mixamorig' + S + 'UpLeg', hips, sgn * 0.1 * scale, -0.05 * scale, 0);
    const ll = mkBone('mixamorig' + S + 'Leg', ul, 0, -0.45 * scale, 0);
    mkBone('mixamorig' + S + 'Foot', ll, 0, -0.45 * scale, 0);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
function blenderRig() {   // different names, only TWO spine bones, no dedicated pelvis... uh, has pelvis
  const root = new THREE.Group();
  const hips = mkBone('pelvis', null, 0, 0.9, 0); root.add(hips);
  const sp = mkBone('spine', hips, 0, 0.2, 0);
  const sp1 = mkBone('spine.001', sp, 0, 0.25, 0);
  const nk = mkBone('neck', sp1, 0, 0.1, 0);
  mkBone('head', nk, 0, 0.1, 0);
  for (const S of ['L', 'R']) {
    const sgn = S === 'L' ? 1 : -1;
    const ua = mkBone('upper_arm.' + S, sp1, sgn * 0.15, 0.05, 0);
    const fa = mkBone('forearm.' + S, ua, sgn * 0.22, 0, 0);
    mkBone('hand.' + S, fa, sgn * 0.2, 0, 0);
    const ul = mkBone('thigh.' + S, hips, sgn * 0.1, -0.05, 0);
    const ll = mkBone('shin.' + S, ul, 0, -0.4, 0);
    mkBone('foot.' + S, ll, 0, -0.4, 0);
  }
  root.updateWorldMatrix(true, true);
  return root;
}

// ---- gather: canonical slots resolve on both rigs ----
{
  const m = env.gather(mixamoRig());
  eq(m.get('hips').name, 'mixamorigHips', 'mixamo hips');
  eq(m.get('spine2').name, 'mixamorigSpine2', 'three spines fill all three slots');
  eq(m.get('R:forearm').name, 'mixamorigRightForeArm', 'sided limbs resolve');
  const b = env.gather(blenderRig());
  eq(b.get('hips').name, 'pelvis', 'blender pelvis is hips');
  eq(b.get('spine0').name, 'spine', 'a 2-bone spine fills the low slot');
  eq(b.get('spine2').name, 'spine.001', '...and the chest slot');
  assert(!b.get('spine1'), '...but not the middle (dedup: one bone answers one slot)');
  eq(b.get('L:uparm').name, 'upper_arm.L', 'dotted side suffixes resolve');
}
{ // pelvis-less: lowest spine promotes to hips (the engine's build-1010 convention)
  const root = new THREE.Group();
  const s0 = mkBone('spine_01', null, 0, 1, 0); root.add(s0);
  const s1 = mkBone('spine_02', s0, 0, 0.2, 0); mkBone('head', s1, 0, 0.3, 0);
  root.updateWorldMatrix(true, true);
  eq(env.gather(root).get('hips').name, 'spine_01', 'a pelvis-less rig promotes its lowest spine to hips');
}

// ---- build + play: a 90° right-arm raise authored as data drives the mixamo rig ----
const Q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const DATA = { id:'ca_test01', v:1, name:'Arm raise', dur:1, fps:30, loop:'loop', tracks:{
  'R:uparm': { q: [[0, 0, 0, 0, 1], [1, Q90.x, Q90.y, Q90.z, Q90.w]] },
  'hips': { p: [[0, 0, 0, 0], [1, 0, 0.5, 0]] },   // normalized: rise half a hip-height
} };
{
  const rig = mixamoRig();
  const arm = rig.getObjectByName('mixamorigRightArm');
  const preQ = arm.quaternion.clone(), preHip = rig.getObjectByName('mixamorigHips').position.clone();
  const clip = env.build(rig, DATA);
  assert(clip && clip.duration === 1, 'the clip builds at the authored duration');
  assert(arm.quaternion.equals(preQ) && rig.getObjectByName('mixamorigHips').position.equals(preHip),
    'building NEVER mutates the bind pose');
  assert(clip.tracks.some(t => t.name === 'mixamorigRightArm.quaternion'), 'tracks are named for the target rig');
  assert(clip.tracks.some(t => t.name === 'mixamorigHips.position'), 'the hips position track rides along');
  const mixer = new THREE.AnimationMixer(rig);
  mixer.clipAction(clip).play();
  mixer.setTime(0.999); rig.updateWorldMatrix(true, true);
  const wq = arm.getWorldQuaternion(new THREE.Quaternion());
  const restW = Q90.clone();   // rest world was identity, so posed world should be ~Q90
  assert(Math.abs(wq.angleTo(restW)) < 0.03, 'at t=1 the arm sits at the authored 90° world delta: off by ' + wq.angleTo(restW).toFixed(4));
  mixer.setTime(0.5); rig.updateWorldMatrix(true, true);
  near(arm.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion()), Math.PI / 4, 0.06,
    'halfway through it has slerped ~45° (smooth quaternion interpolation, shortest path)');
  const hipY = rig.getObjectByName('mixamorigHips').position.y;
  mixer.setTime(0.999); rig.updateWorldMatrix(true, true);
  near(rig.getObjectByName('mixamorigHips').position.y, 1 + 0.5 * 1, 0.02, 'hip offset scales by THIS rig’s hip height (1m)');
  mixer.stopAllAction(); mixer.uncacheRoot(rig);
}

// ---- retarget: the SAME data drives the blender rig, tracks named for ITS bones ----
{
  const rig = blenderRig();
  const clip = env.build(rig, DATA);
  assert(clip, 'the same clip data builds on a differently-named rig');
  assert(clip.tracks.some(t => t.name === 'upper_arm_R.quaternion') || clip.tracks.some(t => t.name === 'upper_arm.R.quaternion'),
    'tracks target the blender bone names: ' + clip.tracks.map(t => t.name).join(', '));
  const mixer = new THREE.AnimationMixer(rig);
  mixer.clipAction(clip).play(); mixer.setTime(0.999); rig.updateWorldMatrix(true, true);
  const wq = rig.getObjectByName('upper_arm.R').getWorldQuaternion(new THREE.Quaternion());
  assert(Math.abs(wq.angleTo(Q90)) < 0.03, 'the world delta lands identically on the second rig (true retargeting)');
  near(rig.getObjectByName('pelvis').position.y, 0.9 + 0.5 * 0.9, 0.02, 'hip rise scales by the SHORTER rig’s hip height (0.9m)');
  mixer.stopAllAction(); mixer.uncacheRoot(rig);
}

// ---- resilience ----
{
  const rig = mixamoRig();
  const d = { id:'ca_x', name:'toes', dur:1, fps:30, tracks:{ 'L:toe': { q:[[0,0,0,0,1],[1,0,0,0.7,0.7]] } } };
  eq(env.build(rig, d), null, 'a clip aimed only at bones this rig lacks builds nothing (and never throws)');
  eq(env.build(new THREE.Group(), DATA), null, 'a rig with no recognizable bones is a clean null');
  eq(env.build(rig, { name:'empty', dur:1, fps:30, tracks:{} }), null, 'a keyless clip is a clean null');
}

// ---- wiring pins: attach path, serialization, loader restores ----
assert(/const ca=\(typeof _caClipsFor==='function'\) \? _caClipsFor\(g\) : \[\];/.test(src) &&
       /animations:\(g\.animations\|\|\[\]\)\.concat\(ca\)/.test(src),
  '_withLibAnims appends custom clips to the augmented view on every path');
assert(/if\(baseNames\.has\(clip\.name\)\) clip\.name=clip\.name\+' \(custom\)';/.test(src),
  'name collisions with model/library clips get a suffix (by-name pickers stay exact)');
assert(/gltf\.userData\._caFor===_caRev && gltf\.userData\._caClips/.test(src), 'built clips cache per gltf until the library changes');
assert(/customAnims: \(\(typeof customAnims!=='undefined' && customAnims\.length\) \? _caSanitize\(customAnims\) : undefined\)/.test(src),
  'serializeLevel stores the library (omitted when empty — old levels stay byte-identical)');
assert(/let customAnims = _caSanitize\(savedLevel && savedLevel\.customAnims\);/.test(src), 'boot restores it');
eq((src.match(/customAnims = _caSanitize\(level\.customAnims\); _caRev\+\+;/g) || []).length, 2,
  'both level-apply paths (local load + network transfer) restore it and invalidate clip caches');

done('build 1040: custom clips — sanitized, serialized, retargeting onto any humanoid through the existing pipeline');
