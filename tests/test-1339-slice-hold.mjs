import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1339 — asked for from use: "add an option to hold a single frame. The default slow bob of the
// weapon while idling looks great, and works for most situations."
//
// A baked weapon idle is usually a breathing loop, and the engine already bobs the viewmodel — so mapping
// one to `idle` gives you TWO idles at once, and only one of them is a number the creator can turn. A held
// frame takes the baked motion out and leaves the bob, which is the look they already had.
//
// IT IS NOT A ONE-FRAME RANGE, and that distinction is the whole build. A range of [n, n] still brackets
// t0 and t0 + 1/fps, which are two different poses, so the clip creeps. Measured on a source whose slide
// travels z 0 -> 3 over 3 seconds (tools/probe/slice-hold.mjs):
//
//   one-frame RANGE [45,45]   keys z [1.500000, 1.533333]   played on the real gun: 2 distinct poses
//   HELD frame      [45]      keys z [1.500000, 1.500000]   played on the real gun: 1 pose, 1.50000
//
// and through the real panel: the Out field disables, the readout reads "still · frame 45 of 90", the entry
// serializes as h:1, and the built clip comes back still.

const mk = (fn) => new Function('THREE', `
  const ANIM_CUT_FPS_MIN = 1, ANIM_CUT_FPS_MAX = 240;
  ${extractFunction('_trackValueAt')}
  ${extractFunction('sliceClip')}
  return ${fn};`)(THREE);
const sliceClip = mk('sliceClip');
// z travels 0 -> 3 over 3s, so any motion inside a slice is directly readable
const source = () => new THREE.AnimationClip('allanim', 3, [
  new THREE.VectorKeyframeTrack('Slide.position', [0, 3], [0,0,0, 0,0,3]),
  new THREE.QuaternionKeyframeTrack('Slide.quaternion', [0, 3], [0,0,0,1, 0,0,0,1]),
]);
const zOf = (c) => [...c.tracks[0].values].filter((_, i) => i % 3 === 2);

// ---------------------------------------------------------------- a range of one frame still moves
{
  const c = sliceClip(source(), 'R', 45, 45, 30, false);
  const z = zOf(c);
  assert(z[0] !== z[1], 'a one-frame RANGE holds two different poses — this is the thing being fixed');
  near(z[0], 1.5, 1e-6, 'in-point at frame 45 of 90 is halfway');
  near(z[1], 1.5 + 3 / 90, 1e-6, 'and the out-point is one frame further along');
}

// ---------------------------------------------------------------- a hold does not, at either end
{
  const c = sliceClip(source(), 'H', 45, 45, 30, true);
  const z = zOf(c);
  eq(z[0], z[1], 'a HELD frame writes the SAME value to both ends');
  near(z[0], 1.5, 1e-6, 'and it is the pose at the in-point');
  assert(c.userData && c.userData._still, 'the clip is marked still');
  near(c.duration, 1 / 30, 1e-9, 'one frame long');
  // every track, not just the first — a rotation that crept would be just as visible
  for (const tr of c.tracks) {
    const vs = tr.getValueSize();
    for (let k = 0; k < vs; k++)
      eq(tr.values[k], tr.values[vs + k], 'track ' + tr.name + ' component ' + k + ' is identical at both ends');
  }
}

// ---------------------------------------------------------------- it cannot drift, whatever is asked of it
{
  // The property that matters is not "the two keys are equal" but "no interpolation between them can
  // produce anything else". Sample the real interpolant across the clip.
  const c = sliceClip(source(), 'H', 45, 45, 30, true);
  const it = c.tracks[0].createInterpolant();
  const seen = new Set();
  for (let i = 0; i <= 20; i++) seen.add(it.evaluate(c.duration * i / 20)[2].toFixed(9));
  eq(seen.size, 1, 'sampled 21 times across its own timeline, a held slice returns ONE pose');

  // and the out-point is ignored entirely — a hold is defined by its in-point alone
  const wide = sliceClip(source(), 'H', 45, 9999, 30, true);
  near(wide.duration, 1 / 30, 1e-9, 'a held slice ignores the out-point…');
  eq(zOf(wide)[0], zOf(c)[0], '…and holds the same pose');
  // the reversed-range swap must not fire for a hold, or "hold frame 45" with a stale out of 10 would
  // silently become "hold frame 10"
  const rev = sliceClip(source(), 'H', 45, 10, 30, true);
  near(zOf(rev)[0], 1.5, 1e-6, 'and a stale smaller out-point does not drag the held frame back to it');
}

// ---------------------------------------------------------------- a normal slice is untouched
{
  const a = sliceClip(source(), 'N', 0, 60, 30, false);
  const b = sliceClip(source(), 'N', 0, 60, 30);          // the pre-1339 call shape
  eq(JSON.stringify([...a.tracks[0].times]), JSON.stringify([...b.tracks[0].times]),
    'omitting the flag is byte-identical to passing false — every existing slice is unchanged');
  near(a.duration, 2, 1e-9, 'and a real range still spans what it asked for');
}

// ---------------------------------------------------------------- it rides the level, only when set
{
  assert(/if\(c\.h\) e\.h = 1;/.test(src), 'the flag is stored only when set, so nothing else grows a key');
  assert(/c\.f\+'\|'\+\(c\.h\?1:0\)/.test(src),
    'and it is part of the apply signature, or ticking the box on an existing slice would re-apply nothing');
  assert(/sliceClip\(src, c\.n, c\.a, c\.b, c\.f, !!c\.h\)/.test(src), 'and reaches the slicer on rebuild');
}

// ---------------------------------------------------------------- the panel says what it does
{
  const f = extractFunction('showClipSlicer');
  assert(/Hold a single frame \(a still pose\)/.test(f), 'the control is labelled…');
  assert(/leaves the engine\\u2019s own bob to do the moving/.test(f), '…and says why you would want it');
  assert(/outN\.disabled = hold; setOut\.disabled = hold;/.test(f), 'Out is disabled while holding…');
  assert(/a control that vanishes reads as a bug/.test(f), '…rather than hidden, and the reason is recorded');
  assert(/\? \('still \\u00b7 frame ' \+ a \+ '  of  ' \+ mx\)/.test(f) || /'still · frame '/.test(f),
    'the readout says "still", not a frame count');
  assert(/if\(hold\)\{ head2\.value = String\(a\); showFrame\(\); return; \}/.test(f),
    'and Play parks the playhead on the held frame rather than looping nothing');
  assert(/holdCb\.checked = !!c\.h;/.test(f), 'loading a slice back into the fields restores the flag');
  assert(/c\.h \? \('still \\u00b7 frame ' \+ c\.a\)/.test(f) || /\('still · frame ' \+ c\.a\)/.test(f),
    'and the list row shows a still as a still');
}

done('build 1339: a slice can hold a SINGLE FRAME — one pose, no motion at all. Asked for from use, because a baked weapon idle is usually a breathing loop and the engine already bobs the viewmodel, so mapping one to idle gives two idles at once and only one of them is a number the creator can turn. It is deliberately NOT a one-frame range, and that distinction is the whole build: a range of [n,n] still brackets t0 and t0+1/fps, which are two DIFFERENT poses, so the gun creeps — measured on a slide travelling z 0..3, a one-frame range holds [1.500000, 1.533333] and played back on the real gun produced 2 distinct poses, while a held frame holds [1.500000, 1.500000] and produced exactly 1. The property asserted here is the stronger one: sampled 21 times across its own timeline through three\'s real interpolant, a held slice returns ONE value, so it cannot drift however the action is looped, timescaled or blended. A hold is defined by its in-point alone — the out-point is ignored, and the reversed-range swap is skipped so a stale smaller out cannot silently drag the held frame back to it. Omitting the flag is byte-identical to the pre-1339 call, so every existing slice is unchanged');
