// (build 1068) AI REFINEMENT LOOP — author: "add a refinement option to keep iterating until the
// animation is just where the user wants it." To CHANGE an animation the model must first READ
// it — and it can no more read a quaternion than write one. _aiTracksToPose is the exact inverse
// of _aiPoseToTracks: it walks the stored world deltas back down the bone chain
// (own = parentAccum⁻¹ × accum), decomposes each joint, undoes the right-side mirror, and names
// the result with the same anatomical channels the model writes. Because it reads the CLIP and
// not a transcript, refinement works on ANY clip — generated, hand-keyframed, or a Quaternius
// clip pulled in with "Edit existing" — and every pass is stateless, so iterating never drifts.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = src.match(/const AI_ANIM_PARENT = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_ANIM_BASE_CH = \{[\s\S]*?\};/)[0] + '\n'
  + src.match(/const AI_ANIM_ALIAS = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_ANIM_LIM = \{[\s\S]*?\n\};/)[0] + '\n'
  + "function _caNewId(){ return 'ca_ai'+Math.random().toString(36).slice(2,8); }\n"
  + src.match(/const AI_STAGGER_UNIT = [\s\S]*?\n/)[0]
  + src.match(/const AI_STAGGER_MAX  = [\s\S]*?\n/)[0]
  + extractFunction('_aiSlotDepth', src) + '\n' + extractFunction('_aiStagger', src) + '\n'
  + extractFunction('_caEvalQ', src) + '\n' + extractFunction('_caEvalP', src) + '\n'
  + extractFunction('_aiAnimAxis', src) + '\n' + extractFunction('_aiPoseToTracks', src) + '\n'
  + extractFunction('_aiPoseChannels', src) + '\n' + extractFunction('_aiTracksToPose', src) + '\n'
  + extractFunction('_aiRefinePrompt', src);
const env = new Function('THREE', glue
  + '\nreturn { to:_aiPoseToTracks, from:_aiTracksToPose, ch:_aiPoseChannels, prompt:_aiRefinePrompt };')(THREE);

// ---- THE ROUND TRIP: poses -> tracks -> poses must describe the same animation ----
const SPEC = { name: 'Lift box', dur: 3, fps: 30, loop: 'once', interp: 'smooth', keys: [
  { t: 0, pose: {} },
  { t: 1.2, pose: { spine0: { pitch: 50 }, 'L:upleg': { lift: 95 }, 'R:upleg': { lift: 95 },
    'L:lowleg': { bend: 105 }, 'R:lowleg': { bend: 105 }, 'L:forearm': { bend: 40 }, 'R:forearm': { bend: 40 },
    'L:uparm': { raise: 55 }, 'R:uparm': { raise: 55 }, hips: { dy: -0.4 } } },
  { t: 3, pose: { spine0: { pitch: 10 }, 'L:forearm': { bend: 85 }, 'R:forearm': { bend: 85 } } },
] };
{
  const tracks = env.to(SPEC, null);
  assert(tracks, 'the spec converts to tracks');
  const back = env.from(tracks, 16);
  assert(back, 'the tracks convert BACK to poses');
  eq(back.keys.length, 3, 'every key time survives the round trip');
  eq(back.dur, 3, 'duration survives');

  const mid = back.keys.find(k => Math.abs(k.t - 1.2) < 1e-6).pose;
  near(mid.spine0.pitch, 50, 0.6, 'the spine pitch reads back as it was written (50)');
  near(mid['L:lowleg'].bend, 105, 0.6, 'a LEFT knee reads back as bend 105');
  near(mid['R:lowleg'].bend, 105, 0.6, '...and the RIGHT knee reads the same positive number (the mirror is undone)');
  near(mid['L:upleg'].lift, 95, 0.6, 'hip flexion reads back as lift');
  near(mid['R:upleg'].lift, 95, 0.6, '...on both sides');
  near(mid['L:forearm'].bend, 40, 0.6, 'a LEFT elbow reads back as bend 40');
  near(mid['R:forearm'].bend, 40, 0.6, '...and the RIGHT elbow reads the same, not -40');
  near(mid['L:uparm'].raise, 55, 0.6, 'a raised arm reads back as raise');
  near(mid.hips.dy, -0.4, 0.02, 'the hips drop reads back in hip-heights');
  assert(!('yaw' in mid.spine0) && !('roll' in mid.spine0), 'a single-axis joint reports ONE channel, not three noisy ones');

  const first = back.keys[0].pose;
  eq(Object.keys(first).length, 0, 'the rest key reads back as an empty pose');

  // the real proof: re-converting the description reproduces the same quaternions
  const again = env.to(back, null);
  let worst = 0;
  for (const slot in tracks.tracks) {
    const a = tracks.tracks[slot].q, b = again.tracks[slot] && again.tracks[slot].q;
    assert(b, slot + ' survives the round trip');
    eq(a.length, b.length, slot + ' keeps its key count');
    for (let i = 0; i < a.length; i++) {
      // normalize first: keys are stored rounded to 4dp, and angleTo on an un-normalized pair
      // reports the rounding as a phantom angle (the sanitizer normalizes on the real path)
      const qa = new THREE.Quaternion(a[i][1], a[i][2], a[i][3], a[i][4]).normalize();
      const qb = new THREE.Quaternion(b[i][1], b[i][2], b[i][3], b[i][4]).normalize();
      worst = Math.max(worst, qa.angleTo(qb));
    }
  }
  assert(worst < 0.004, 'ROUND TRIP: every bone lands within ' + (worst * 180 / Math.PI).toFixed(2) + '° of where it started');
}

// ---- a combined (multi-axis) joint falls back to pitch/yaw/roll rather than lying ----
{
  const t = env.to({ dur: 1, keys: [{ t: 1, pose: { 'L:uparm': { raise: 40, out: 30 } } }] }, null);
  const back = env.from(t, 16);
  const p = back.keys[0].pose['L:uparm'];
  const n = Object.keys(p).length;
  assert(n >= 2, 'a two-axis shoulder is described with enough channels to reproduce it (' + Object.keys(p).join(',') + ')');
  const again = env.to(back, null);
  const qa = new THREE.Quaternion(...t.tracks['L:uparm'].q[0].slice(1)).normalize();
  const qb = new THREE.Quaternion(...again.tracks['L:uparm'].q[0].slice(1)).normalize();
  assert(qa.angleTo(qb) < 0.02, '...and re-converting reproduces it within ' + (qa.angleTo(qb) * 180 / Math.PI).toFixed(2) + '°');
}

// ---- reading a clip the AI never wrote (hand-keyed / sampled from a pack) ----
{
  // a raw clip with an arbitrary world delta, as _aeKeySlot or _aeSampleClip would store it
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.7);
  const raw = { name: 'Hand made', dur: 1, fps: 30, interp: 'smooth',
    tracks: { spine0: { q: [[0, 0, 0, 0, 1], [1, q.x, q.y, q.z, q.w]] } } };
  const back = env.from(raw, 16);
  assert(back && back.keys.length === 2, 'a hand-authored clip is readable too');
  near(back.keys[1].pose.spine0.pitch, 0.7 * 180 / Math.PI, 0.6, '...and describes correctly (40.1°)');
}

// ---- a densely sampled clip is described at a readable density, ends intact ----
{
  const keys = []; for (let i = 0; i <= 60; i++) keys.push([i / 60, 0, 0, 0, 1]);
  const back = env.from({ dur: 1, fps: 30, interp: 'smooth', tracks: { spine0: { q: keys } } }, 16);
  assert(back.keys.length <= 16 && back.keys.length >= 3, 'a 61-key clip is summarised to a readable set of beats (' + back.keys.length + ')');
  eq(back.keys[0].t, 0, 'the first key is kept');
  eq(back.keys[back.keys.length - 1].t, 1, 'the last key is kept');
}

// ---- guards ----
eq(env.from(null, 16), null, 'junk in, null out');
eq(env.from({ tracks: {} }, 16), null, 'a clip with no tracks has nothing to describe');
eq(env.from({ tracks: { 'b:Blade': { q: [[0, 0, 0, 0, 1]] } } }, 16), null,
  'a non-humanoid bone track is not describable in this vocabulary (the dialog says so instead of guessing)');

// ---- the refine brief ----
{
  const pr = env.prompt('bend deeper at the bottom', SPEC, ['hips', 'spine0', 'L:lowleg'], false);
  assert(/REVISING an existing game animation/.test(pr), 'it frames the task as a revision');
  assert(/bend deeper at the bottom/.test(pr), 'it carries the animator’s note');
  assert(/THE CURRENT ANIMATION/.test(pr) && /"Lift box"/.test(pr), 'it carries the current animation');
  assert(/COMPLETE revised animation in exactly that shape — not a diff/.test(pr), 'it asks for the whole clip back, not a patch');
  assert(/Keep everything the animator did not ask you to change/.test(pr), 'it protects the parts you did not mention');
  assert(/hips, spine0, L:lowleg/.test(pr), 'it lists the live rig’s bones');
}

// ---- the dialog: a real iteration loop ----
{
  const fn = extractFunction('_aeAIDialog', src);
  assert(/let mode = hasKeys\(\) \? 'refine' : 'new';/.test(fn),
    'a clip with keys opens straight into Refine — the common case after generating');
  assert(/const segRef=mkSeg\('refine','Refine this clip'/.test(fn) && /const segNew=mkSeg\('new','New animation'/.test(fn),
    'both modes are offered');
  assert(/cur=_aiTracksToPose\(_caSanitize\(\[_aeClip\]\)\[0\], 16\);/.test(fn),
    'refining sends the CURRENT clip, sanitized, as readable poses');
  assert(/_aeSnapshot\(\);   \/\/ clip-level undo: Ctrl\+Z steps back through the refinements/.test(fn),
    'each refinement is undoable with Ctrl+Z');
  assert(/_aeClip\.tracks=clean\.tracks; _aeClip\.dur=clean\.dur;/.test(fn),
    'a refinement replaces the loaded clip IN PLACE (no library clutter per pass)');
  assert(/mode='refine';   \/\/ the natural next step is to iterate on what you just got/.test(fn),
    'a fresh generation flips to Refine so the next note continues the loop');
  assert(/st\.innerHTML='<span style="color:#9fe6cf;">Applied \\u2014 '\+nk\+' keys on '\+nb\+' bones\. Look it over, then describe the next change\.<\/span>';/.test(fn),
    'the sheet stays open and invites the next change');
  assert(/ta\.value=''; paint\(\);/.test(fn), '...with the box cleared and ready');
  assert(/addLog\(desc\.slice\(0,90\)\);/.test(fn), 'each applied note is listed so you can see the path you took');
  assert(/align-items:flex-end/.test(fn) && /back\.style\.background='transparent'/.test(fn),
    'the sheet sits at the bottom over a clear backdrop, so the character stays visible while iterating');
  assert(/if\(\(e\.ctrlKey\|\|e\.metaKey\) && e\.key==='Enter'\)\{ e\.preventDefault\(\); run\(\); \}/.test(fn),
    'Ctrl+Enter fires it without reaching for the mouse');
  assert(/const doneB=mkBtn\('Done'/.test(fn), 'Done closes the loop');
  assert(/back\.className='uiDlgBack';/.test(fn), 'it still marks its backdrop so the editor yields Escape');
}

done('build 1068: read the clip back as anatomy, revise it in place, repeat — iterate until it is right');
