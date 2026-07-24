// (build 1070) OVERLAPPING ACTION — author: "when it's creating keyframes via the API, it puts
// all keyframes for each bone at exactly the same time marker... for more realistic movement it
// should stagger the movements across keyframes a bit."
// The pose contract keys every bone on the same instant, which reads mechanical — a real body's
// core leads and its extremities trail (animators call it drag / follow-through). Rather than ask
// the model to invent per-bone timings in tens of milliseconds, the ENGINE drags each bone by its
// depth in the skeleton. Only interior keys move, so clip length is untouched and loops still
// meet; the lag is capped at 40% of a track's tightest gap so a key can never overtake its
// neighbour; and reading a staggered clip back for refinement collapses the drag, so iterating
// never compounds it.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = src.match(/const AI_ANIM_PARENT = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_ANIM_BASE_CH = \{[\s\S]*?\};/)[0] + '\n'
  + src.match(/const AI_ANIM_ALIAS = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_ANIM_LIM = \{[\s\S]*?\n\};/)[0] + '\n'
  + src.match(/const AI_STAGGER_UNIT = [\s\S]*?\n/)[0]
  + src.match(/const AI_STAGGER_MAX  = [\s\S]*?\n/)[0]
  + "function _caNewId(){ return 'ca_s'+Math.random().toString(36).slice(2,8); }\n"
  + extractFunction('_caEvalQ', src) + '\n' + extractFunction('_caEvalP', src) + '\n'
  + extractFunction('_aiSlotDepth', src) + '\n' + extractFunction('_aiStagger', src) + '\n'
  + extractFunction('_aiAnimAxis', src) + '\n' + extractFunction('_aiPoseToTracks', src) + '\n'
  + extractFunction('_aiPoseChannels', src) + '\n' + extractFunction('_aiTracksToPose', src);
const env = new Function('THREE', glue
  + '\nreturn { depth:_aiSlotDepth, stag:_aiStagger, to:_aiPoseToTracks, from:_aiTracksToPose };')(THREE);

// ---- depth drives the drag ----
eq(env.depth('hips'), 0, 'the hips lead');
eq(env.depth('root'), 0, 'a prop root leads too');
eq(env.depth('spine0'), 1, 'the spine follows the hips');
eq(env.depth('head'), 5, 'the head trails the whole spine');
eq(env.depth('L:hand'), 7, 'a hand is the furthest thing from the core');
eq(env.depth('L:upleg'), 1, 'a thigh hangs straight off the hips');
eq(env.depth('L:foot'), 3, '...and a foot trails it');

// ---- the pose spec everything below is built from ----
const SPEC = { name: 'Squat', dur: 3, fps: 30, interp: 'smooth', keys: [
  { t: 0, pose: {} },
  { t: 1, pose: { spine0: { pitch: 40 }, 'L:upleg': { lift: 80 }, 'L:lowleg': { bend: 90 },
    'L:uparm': { raise: 50 }, 'L:hand': { pitch: 15 }, 'L:foot': { point: 12 }, head: { pitch: 10 }, hips: { dy: -0.3 } } },
  { t: 2, pose: { spine0: { pitch: 40 }, 'L:upleg': { lift: 80 }, 'L:lowleg': { bend: 90 },
    'L:uparm': { raise: 50 }, 'L:hand': { pitch: 15 }, 'L:foot': { point: 12 }, head: { pitch: 10 }, hips: { dy: -0.3 } } },
  { t: 3, pose: {} },
] };
const midT = (d, slot) => d.tracks[slot].q[1][0];   // the first INTERIOR key of that bone

// ---- off by default: callers opt in, so nothing else in the engine changes behaviour ----
{
  const flat = env.to(SPEC, null);
  for (const sl of Object.keys(flat.tracks)) eq(midT(flat, sl), 1, sl + ' keys on the beat when stagger is off');
}

// ---- on: the core leads, the extremities trail ----
{
  const d = env.to(SPEC, null, 1);
  eq(midT(d, 'hips'), 1, 'the hips still hit the beat exactly — they lead');
  assert(midT(d, 'spine0') > 1, 'the spine arrives after the hips (' + midT(d, 'spine0') + ')');
  assert(midT(d, 'head') > midT(d, 'spine0'), 'the head arrives after the spine');
  assert(midT(d, 'L:hand') > midT(d, 'L:uparm'), 'the hand arrives after the arm that carries it');
  assert(midT(d, 'L:foot') > midT(d, 'L:upleg'), 'the foot arrives after the thigh');
  assert(midT(d, 'L:hand') - 1 <= 0.131, 'the deepest drag stays under the ceiling (' + (midT(d, 'L:hand') - 1).toFixed(3) + 's)');
  assert(midT(d, 'spine0') - 1 >= 0.015, '...and the shallowest is still visible (' + (midT(d, 'spine0') - 1).toFixed(3) + 's)');
  // distinct arrival times are the whole point
  const arrivals = new Set(Object.keys(d.tracks).map(sl => midT(d, sl)));
  assert(arrivals.size >= 4, 'the bones no longer all land on one marker (' + arrivals.size + ' distinct times)');
}

// ---- the invariants that keep a staggered clip valid ----
{
  const d = env.to(SPEC, null, 1);
  for (const sl of Object.keys(d.tracks)) {
    const q = d.tracks[sl].q;
    eq(q[0][0], 0, sl + ': the first key stays pinned at 0');
    eq(q[q.length - 1][0], SPEC.dur, sl + ': the last key stays pinned at the end (clip length + loops intact)');
    for (let i = 1; i < q.length; i++) assert(q[i][0] > q[i - 1][0], sl + ': keys never overtake each other');
    if (d.tracks[sl].p) {
      const p = d.tracks[sl].p;
      eq(p[0][0], 0, sl + ': position keys are dragged in lockstep with rotation');
      for (let i = 1; i < p.length; i++) assert(p[i][0] > p[i - 1][0], sl + ': position keys stay ordered');
    }
  }
}
// tight keys clamp the drag rather than reordering
{
  const tight = { dur: 1, fps: 30, interp: 'smooth', keys: [
    { t: 0, pose: {} }, { t: 0.1, pose: { 'L:hand': { pitch: 20 } } },
    { t: 0.14, pose: { 'L:hand': { pitch: 40 } } }, { t: 1, pose: {} } ] };
  const d = env.to(tight, null, 1);
  const q = d.tracks['L:hand'].q;
  for (let i = 1; i < q.length; i++) assert(q[i][0] > q[i - 1][0], 'a 0.04s gap still orders correctly after the drag');
  assert(q[1][0] - 0.1 <= 0.04 * 0.4 + 1e-9, 'the drag is capped at 40% of the tightest gap (' + (q[1][0] - 0.1).toFixed(4) + 's)');
}
// a two-key track has no interior key to move
{
  const two = { dur: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: { 'L:hand': { pitch: 20 } } }] };
  const d = env.to(two, null, 1);
  eq(d.tracks['L:hand'].q.map(k => k[0]).join(','), '0,1', 'both keys are endpoints — nothing to drag');
}

// ---- refinement reads a STAGGERED clip back as clean beats, and never compounds ----
{
  const d1 = env.to(SPEC, null, 1);
  const back = env.from(d1, 16);
  eq(back.keys.map(k => k.t).join(','), '0,1,2,3', 'the drag collapses back to the four beats the animator thinks in');
  // each bone is described at ITS OWN extreme, not sampled mid-ramp at the leader's time
  const k1 = back.keys[1].pose;
  near(k1['L:lowleg'].bend, 90, 1.5, 'a dragged knee still reads its full 90° (not an under-reported mid-ramp value)');
  near(k1['L:uparm'].raise, 50, 1.5, '...and a dragged arm reads its full 50°');
  near(k1.head.pitch, 10, 1.5, '...and the deepest-dragged bone reads correctly too');
  near(k1.hips.dy, -0.3, 0.02, '...including the hips translation');
  // re-generating from that description re-staggers from scratch — the drag must not double
  const d2 = env.to(back, null, 1);
  for (const sl of Object.keys(d1.tracks)) {
    near(midT(d2, sl), midT(d1, sl), 1e-6, sl + ': a second pass reproduces the SAME drag — iterating never compounds it');
  }
}

// ---- wiring ----
assert(/const data=_aiPoseToTracks\(spec, slots, stagger\);/.test(src), 'the generator passes the author’s choice through');
assert(/\}, cur, _aiStaggerOn\?1:0\);/.test(src), '...from the dialog, on both the new and refine paths');
assert(/let _aiStaggerOn=true;/.test(src), 'overlapping action is ON by default');
{
  const fn = extractFunction('_aeAIDialog', src);
  assert(/ovCb\.onchange=\(\)=>\{ _aiStaggerOn=ovCb\.checked; \};/.test(fn), 'the dialog offers a toggle');
  assert(/Overlap &amp; follow-through/.test(fn), '...labelled in animator’s language');
  assert(/off = everything hits on the same frame/.test(fn), '...and says what turning it off does (robotic/mechanical motion)');
}
assert(/return _aiStagger\(data, stagger\|\|0\);/.test(src), 'the converter applies it as its last step');
assert(/if\(keep\[keep\.length-1\]!==last\) keep\.push\(last\);/.test(src), 'the clip’s end is never absorbed into a cluster');

done('build 1070: the hips lead and the hands trail — generated motion overlaps like real animation, and refining never compounds the drag');
