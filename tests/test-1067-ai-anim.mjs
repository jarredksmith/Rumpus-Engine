// (build 1067) AI ANIMATION GENERATION — author: "a user could explain in plain language the
// type of animation they'd like... and the API creates it, with all keyframes."
// The design decision that makes it work: Claude never sees a quaternion. It writes ANATOMICAL
// JOINT ANGLES in degrees ("knee bends 90, spine pitches forward 55") — knowledge a language
// model genuinely has — and the engine converts that to the world-space deltas the clip format
// stores, accumulating down the bone chain and clamping to real joint limits. So a physically
// silly number becomes a valid pose instead of a broken rig, and the result is ordinary
// keyframes the author can scrub and fix. This test drives the converter on a REAL rig and
// checks the bones actually end up where the words said they would.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = src.match(/const AI_ANIM_PARENT = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_ANIM_BASE_CH = \{[\s\S]*?\};/)[0] + '\n'
  + src.match(/const AI_ANIM_ALIAS = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_ANIM_LIM = \{[\s\S]*?\n\};/)[0] + '\n'
  + "function _caNewId(){ return 'ca_ai'+Math.random().toString(36).slice(2,8); }\n"
  + extractFunction('_aiAnimAxis', src) + '\n' + extractFunction('_aiPoseToTracks', src) + '\n'
  + extractFunction('_aiAnimParse', src);
const env = new Function('THREE', glue + '\nreturn { axis:_aiAnimAxis, conv:_aiPoseToTracks, parse:_aiAnimParse };')(THREE);

// ---- the axis table: semantics and mirroring ----
{
  eq(env.axis('L:lowleg', 'bend').join(','), 'x,1', 'a knee bends about X');
  eq(env.axis('R:lowleg', 'bend').join(','), 'x,1', '...identically on the right (X survives mirroring)');
  eq(env.axis('L:forearm', 'bend').join(','), 'y,-1', 'an elbow bends about Y');
  eq(env.axis('R:forearm', 'bend').join(','), 'y,1', '...with the sign flipped on the right, so both arms bend the same way');
  eq(env.axis('L:uparm', 'out').join(','), 'z,1', 'an arm lifts sideways about Z');
  eq(env.axis('R:uparm', 'out').join(','), 'z,-1', '...mirrored on the right');
  eq(env.axis('spine0', 'pitch').join(','), 'x,1', 'every bone still takes the universal channels');
  eq(env.axis('head', 'nonsense'), null, 'an unknown channel is ignored, not guessed');
}

// ---- build a real humanoid and check the poses land where the words said ----
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); if (p) p.add(b); return b; };
function rig() {   // faces +Z, Y up
  const root = new THREE.Group();
  const hips = mkB('mixamorigHips', null, 0, 1, 0); root.add(hips);
  const sp = mkB('mixamorigSpine', hips, 0, 0.2, 0), sp1 = mkB('mixamorigSpine1', sp, 0, 0.2, 0), sp2 = mkB('mixamorigSpine2', sp1, 0, 0.2, 0);
  const nk = mkB('mixamorigNeck', sp2, 0, 0.1, 0); mkB('mixamorigHead', nk, 0, 0.15, 0);
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const sh = mkB('mixamorig' + S + 'Shoulder', sp2, g * 0.08, 0.05, 0);
    const ua = mkB('mixamorig' + S + 'Arm', sh, g * 0.12, 0, 0);
    const fa = mkB('mixamorig' + S + 'ForeArm', ua, 0, -0.28, 0);      // arms hang down
    mkB('mixamorig' + S + 'Hand', fa, 0, -0.25, 0);
    const ul = mkB('mixamorig' + S + 'UpLeg', hips, g * 0.1, -0.05, 0);
    const ll = mkB('mixamorig' + S + 'Leg', ul, 0, -0.45, 0);
    const ft = mkB('mixamorig' + S + 'Foot', ll, 0, -0.45, 0);
    mkB('mixamorig' + S + 'ToeBase', ft, 0, -0.06, 0.16);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
// build the clip through the REAL pipeline and pose the rig at a time
const caGlue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_caGatherBones', src) + '\n' + extractFunction('_caEnsureRootName', src) + '\n'
  + extractFunction('_caEvalQ', src) + '\n' + extractFunction('_caEvalP', src) + '\n' + extractFunction('_caBuildClip', src);
const buildClip = new Function('THREE', caGlue + '\nreturn _caBuildClip;')(THREE);
function poseAt(spec, t) {
  const data = env.conv(spec, null);
  assert(data, 'the spec converts');
  const root = rig();
  const clip = buildClip(root, data);
  assert(clip, 'the converted data builds a real clip');
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play(); mixer.setTime(t); root.updateWorldMatrix(true, true);
  return { root, dir: (a, b) => root.getObjectByName(b).getWorldPosition(new THREE.Vector3())
    .sub(root.getObjectByName(a).getWorldPosition(new THREE.Vector3())).normalize() };
}
{ // a bent knee sends the foot BEHIND the character (they face +Z)
  const p = poseAt({ name: 'knee', dur: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: { 'L:lowleg': { bend: 90 } } }] }, 0.999);
  const shin = p.dir('mixamorigLeftLeg', 'mixamorigLeftFoot');
  assert(shin.z < -0.85, 'BEND THE KNEE 90: the shin swings backward, heel toward the hips (z=' + shin.z.toFixed(2) + ')');
}
{ // hip flexion brings the knee FORWARD
  const p = poseAt({ name: 'hip', dur: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: { 'L:upleg': { lift: 90 } } }] }, 0.999);
  const thigh = p.dir('mixamorigLeftUpLeg', 'mixamorigLeftLeg');
  assert(thigh.z > 0.85, 'LIFT THE HIP 90: the thigh points forward, knee up (z=' + thigh.z.toFixed(2) + ')');
}
{ // the chain accumulates: hip lifted 90 AND knee bent 90 puts the shin pointing DOWN again
  const p = poseAt({ name: 'sit', dur: 1, keys: [{ t: 0, pose: {} },
    { t: 1, pose: { 'L:upleg': { lift: 90 }, 'L:lowleg': { bend: 90 } } }] }, 0.999);
  const shin = p.dir('mixamorigLeftLeg', 'mixamorigLeftFoot');
  assert(shin.y < -0.85, 'THIGH FORWARD + KNEE BENT = a seated leg: the shin hangs down (y=' + shin.y.toFixed(2) + ')');
}
{ // an unmentioned child RIDES its parent — bend the spine, the head follows
  const p = poseAt({ name: 'bow', dur: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: { spine0: { pitch: 60 } } }] }, 0.999);
  const neck = p.dir('mixamorigNeck', 'mixamorigHead');
  assert(neck.z > 0.4, 'BOW: the head tips forward with the spine even though it was never mentioned (z=' + neck.z.toFixed(2) + ')');
}
{ // both arms raised by the same positive number are symmetric
  const p = poseAt({ name: 'reach', dur: 1, keys: [{ t: 0, pose: {} },
    { t: 1, pose: { 'L:uparm': { raise: 90 }, 'R:uparm': { raise: 90 } } }] }, 0.999);
  const L = p.dir('mixamorigLeftArm', 'mixamorigLeftForeArm'), R = p.dir('mixamorigRightArm', 'mixamorigRightForeArm');
  assert(L.z > 0.85 && R.z > 0.85, 'RAISE BOTH ARMS 90: both point forward (' + L.z.toFixed(2) + ', ' + R.z.toFixed(2) + ')');
  near(L.z, R.z, 0.02, '...symmetrically — the mirror is automatic');
}
{ // arms OUT go to opposite sides, not the same side
  const p = poseAt({ name: 'T', dur: 1, keys: [{ t: 0, pose: {} },
    { t: 1, pose: { 'L:uparm': { out: 90 }, 'R:uparm': { out: 90 } } }] }, 0.999);
  const L = p.dir('mixamorigLeftArm', 'mixamorigLeftForeArm'), R = p.dir('mixamorigRightArm', 'mixamorigRightForeArm');
  assert(L.x > 0.85 && R.x < -0.85, 'ARMS OUT 90 = a T-pose: they mirror to opposite sides (' + L.x.toFixed(2) + ', ' + R.x.toFixed(2) + ')');
}

// ---- joint limits turn implausible numbers into valid poses ----
{
  const d = env.conv({ name: 'x', dur: 1, keys: [{ t: 1, pose: { 'L:lowleg': { bend: 400 }, 'R:lowleg': { bend: -90 } } }] }, null);
  const q = new THREE.Quaternion(...d.tracks['L:lowleg'].q[0].slice(1));
  near(2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI, 155, 0.5, 'a 400° knee clamps to the anatomical limit (155°)');
  const q2 = new THREE.Quaternion(...d.tracks['R:lowleg'].q[0].slice(1));
  near(q2.angleTo(new THREE.Quaternion()), 0, 1e-6, 'a backwards-bending knee clamps to straight');
}

// ---- the contract: each key is a COMPLETE pose, so motions ease back to rest ----
{
  const d = env.conv({ name: 'x', dur: 2, keys: [
    { t: 0, pose: {} }, { t: 1, pose: { spine0: { pitch: 40 } } }, { t: 2, pose: {} } ] }, null);
  eq(d.tracks.spine0.q.length, 3, 'a bone mentioned in ANY key is keyed at EVERY key time');
  const first = new THREE.Quaternion(...d.tracks.spine0.q[0].slice(1));
  near(first.angleTo(new THREE.Quaternion()), 0, 1e-6, '...at rest where it was omitted (so it eases in and out)');
}

// ---- hips/root translation ----
{
  const d = env.conv({ name: 'x', dur: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: { hips: { dy: -0.4 } } }] }, null);
  eq(d.tracks.hips.p.length, 2, 'hips translation is keyed');
  near(d.tracks.hips.p[1][2], -0.4, 1e-6, '...in hip-heights, so a crouch really lowers the body');
}
{
  const d = env.conv({ name: 'x', dur: 1, keys: [{ t: 1, pose: { root: { yaw: 90, dy: 2 } } }] }, ['root']);
  assert(d.tracks.root && d.tracks.root.q && d.tracks.root.p, 'prop mode: the whole-model root takes rotation AND travel');
}

// ---- guards ----
eq(env.conv(null, null), null, 'junk in, null out');
eq(env.conv({ keys: [] }, null), null, 'no keys, no clip');
eq(env.conv({ keys: [{ t: 0, pose: { 'not:a:bone': { pitch: 20 } } }] }, null), null, 'unknown bones are ignored');
{
  const d = env.conv({ keys: [{ t: 0, pose: { spine0: { pitch: 20 }, 'L:uparm': { raise: 10 } } }] }, ['spine0']);
  eq(Object.keys(d.tracks).join(','), 'spine0', 'the allow-list keeps the model to bones this rig actually has');
}

// ---- the response parser tolerates chatty models ----
eq(env.parse('```json\n{"a":1}\n```').a, 1, 'code fences are stripped');
eq(env.parse('Sure! {"a":2} hope that helps').a, 2, 'prose around the JSON is stripped');
eq(env.parse('no json here'), null, 'unparseable input returns null, never throws');

// ---- wiring ----
assert(/_aeOpen|aeAI/.test(src) && /id="aeAI"/.test(src), 'the editor toolbar has the AI button');
assert(/el\.querySelector\('#aeAI'\)\.onclick=\(\)=>_aeAIDialog\(\);/.test(src), '...wired to the prompt sheet');
assert(/function _aeAIDialog\(\)\{/.test(src), 'the prompt sheet exists');
assert(/back\.className='uiDlgBack';/.test(extractFunction('_aeAIDialog', src)),
  'it marks its backdrop so the fullscreen editor yields Escape and keys');
assert(/const clean=_caSanitize\(\[data\]\)\[0\];/.test(src), 'generated clips go through the SAME sanitizer as imported ones');
assert(/Settings \\u2192 API keys/.test(extractFunction('_aeAIDialog', src)), 'a missing key points at Settings');
assert(/max_tokens:4096, messages:\[\{ role:'user', content:_aiAnimPrompt\(desc, slots, propMode\) \}\]/.test(src),
  'the request carries the built brief');
assert(/BONES AVAILABLE ON THIS MODEL/.test(src), 'the prompt lists the LIVE rig’s bones so the model cannot invent one');

done('build 1067: describe it in plain language, get real keyframes — anatomy in, quaternions out, yours to edit');
