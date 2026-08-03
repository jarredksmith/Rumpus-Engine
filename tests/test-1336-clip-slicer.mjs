import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1336 — asked for from use: most .glb characters and weapons on the free-model web bake idle, fire
// and reload into ONE long take, and this engine maps a SLOT to a CLIP NAME, so a model with one clip
// could only ever have one animation. The art fix is an NLA strip per action in Blender, which is a whole
// tool and a whole skill away from someone building a level.
//
// A slice is just another named clip, and that is why this is small: every consumer already resolves by
// name out of `gltf.animations` — _resolveStateClip, the per-weapon variants (1294), the `clip:<name>`
// direct play (1079), the slot dropdowns, the peer replay. The slices are injected INTO that array, so
// none of them changed.
//
// three ships AnimationUtils.subclip and it is deliberately NOT used. Both of its failure modes are
// EXECUTED below against the real r149 build, because they are silent: a dropped track is a bone frozen at
// whatever the previous animation left it on, and a short duration is a reload that ends early.
//
// Measured live (tools/probe/clip-slicer.mjs), a 5s take keyed at t=0 and t=5 plus a bone keyed only at 0:
//   sliceClip(60,120,@30) -> duration 2.000, 2 tracks, t 0..2, the single-key bone KEPT
//   AnimationUtils.subclip -> duration 0.000, 0 tracks                <- nothing at all
//   applyAnimCuts x3       -> ["allanim","Idle","Reload"] unchanged; editing b 120->90 updates in place
//   scrub                  -> t 0/1.25/2.5/5 posed the rig at x 0/1.25/2.5/5
//   panel                  -> Add produced "Shoot", the clip list grew to 4, it serialized, and a slice
//                             named after a real clip was refused (3 cuts before, 3 after)

const sliceClip = new Function('THREE', `
  const ANIM_CUT_FPS_MIN = 1, ANIM_CUT_FPS_MAX = 240;
  ${extractFunction('_trackValueAt')}
  ${extractFunction('sliceClip')}
  return sliceClip;`)(THREE);

// a SPARSE take: the hips are keyed across the whole clip, one bone is keyed only at t=0
const mkClip = () => new THREE.AnimationClip('allanim', 5, [
  new THREE.VectorKeyframeTrack('Hips.position', [0, 5], [0,0,0, 5,0,0]),
  new THREE.QuaternionKeyframeTrack('Arm.quaternion', [0], [0,0,0,1]),
]);

// ---------------------------------------------------------------- what three's own subclip does here
{
  const c = THREE.AnimationUtils.subclip(mkClip(), 'Reload', 60, 120, 30);
  eq(c.tracks.length, 0, 'three drops EVERY track with no key inside the range — the slice is empty');
  eq(c.duration, 0, '…and the duration collapses, so a sliced reload would end the instant it began');
  // and on a densely-keyed track it still trims the END to the last surviving key
  const dense = new THREE.AnimationClip('d', 4, [new THREE.VectorKeyframeTrack('H.position', [0,1,2,3], [0,0,0, 1,0,0, 2,0,0, 3,0,0])]);
  const d = THREE.AnimationUtils.subclip(dense, 'x', 60, 120, 30);   // t 2.0 .. 4.0 -> asked for 2s
  eq(d.duration, 1, 'and a 2-second request comes back 1 second long, trimmed to the last key');
}

// ---------------------------------------------------------------- what sliceClip does instead
{
  const c = sliceClip(mkClip(), 'Reload', 60, 120, 30);
  assert(c, 'a slice is produced');
  eq(c.name, 'Reload', 'named');
  eq(c.tracks.length, 2, 'BOTH tracks survive — the single-key bone is bracketed, not dropped');
  near(c.duration, 2, 1e-9, 'the duration is exactly the range asked for, 60..120 at 30fps = 2.0s');
  near(c.tracks[0].times[0], 0, 1e-9, 't=0 is exactly the in-point, not the first surviving key');
  near(c.tracks[0].times[c.tracks[0].times.length - 1], 2, 1e-9, 'and the last key is exactly the out-point');
  // the bracketing key is EVALUATED, so the pose at t=0 of the slice is the pose at frame 60 of the source
  eq(+c.tracks[0].values[0].toFixed(6), 2, 'x at the in-point is 2.0 — the source travels 0..5 over 5s');
  eq(+c.tracks[0].values[c.tracks[0].values.length - 3].toFixed(6), 4, '…and 4.0 at the out-point');
  assert(c.userData && c.userData._cut, 'a slice is marked, so a re-apply can remove its own work');
}

// ---------------------------------------------------------------- the awkward inputs
{
  eq(sliceClip(mkClip(), 'R', 120, 60, 30).duration.toFixed(4), '2.0000', 'reversed in/out is swapped, not negative');
  const z = sliceClip(mkClip(), 'R', 60, 60, 30);
  near(z.duration, 1 / 30, 1e-9, 'a zero-length slice becomes one frame — a clip of no duration is not a clip');
  near(sliceClip(mkClip(), 'R', 0, 60, 1e9).duration, 60 / 240, 1e-9, 'fps clamps at the max');
  near(sliceClip(mkClip(), 'R', 0, 60, 0).duration, 60 / 30, 1e-9, 'and a zero fps falls back to 30 rather than dividing by it');
  eq(sliceClip(null, 'R', 0, 1, 30), null, 'no source, no slice');
  // INCLUSIVE, which is what an animator means and what makes two adjacent slices share their boundary pose
  assert(/INCLUSIVE, in frames/.test(src), 'the range convention is stated…');
  assert(/the end pose\n\/\/ of one IS the start pose of the next/.test(src), '…with the reason it is inclusive');
}

// ---------------------------------------------------------------- the level data is bounded
{
  const san = new Function(`
    const ANIM_CUT_MAX = ${extractConst('ANIM_CUT_MAX')}, ANIM_CUT_URLS = ${extractConst('ANIM_CUT_URLS')};
    const ANIM_CUT_FPS_MIN = ${extractConst('ANIM_CUT_FPS_MIN')}, ANIM_CUT_FPS_MAX = ${extractConst('ANIM_CUT_FPS_MAX')};
    ${extractFunction('_sanAnimCuts')}
    return _sanAnimCuts;`)();
  eq(JSON.stringify(san(null)), '{}', 'null is an empty set, never a throw');
  eq(JSON.stringify(san({ u: 'not an array' })), '{}', 'a non-array is skipped');
  const one = san({ u: [{ n: 'A', s: 'src', a: '10', b: 20.7, f: '24' }] });
  eq(JSON.stringify(one.u), JSON.stringify([{ n: 'A', s: 'src', a: 10, b: 21, f: 24 }]), 'coerced and rounded');
  eq(san({ u: [{ n: '', a: 0, b: 1 }] }).u, undefined, 'an unnamed slice is nothing — it could never be selected');
  const wild = san({ u: [{ n: 'x'.repeat(200), a: -5, b: 1e12, f: 1e9 }] }).u[0];
  eq(wild.n.length, 48, 'the name is capped');
  eq(wild.a, 0, 'a negative in-point clamps');
  eq(wild.b, 1e6, 'and a huge out-point clamps');
  eq(wild.f, 240, 'as does the fps');
  eq(san({ u: Array.from({ length: 500 }, (_, i) => ({ n: 'n' + i, a: 0, b: 1 })) }).u.length, 40, 'slices per model are capped');
  const many = {}; for (let i = 0; i < 100; i++) many['u' + i] = [{ n: 'a', a: 0, b: 1 }];
  eq(Object.keys(san(many)).length, 24, 'and models carrying slices are capped');
}

// ---------------------------------------------------------------- injection is idempotent and edits in place
{
  const f = extractFunction('applyAnimCuts');
  assert(/gltf\.userData\._cutSig === sig\) return gltf;/.test(f), 'the same set is applied at most once…');
  assert(/filter\(c=>!\(c && c\.userData && c\.userData\._cut\)\)/.test(f),
    '…and a re-apply REMOVES its own previous work first, or editing a slice would stack a second clip beside it');
  assert(/never shadow a real clip/.test(f),
    'a slice can never take the name of a real clip — `find(by name)` would become ambiguous');
  assert(/const src = kept\.find\(x=>\(x\.name\|\|''\)===c\.s\) \|\| kept\[0\];/.test(f),
    'and a slice whose source clip has gone falls back to the first, rather than vanishing');
}

// ---------------------------------------------------------------- every consumer sees the same list
{
  // BOTH delivery points of loadGLTFCached — the cached fast path and the fresh one. One without the other
  // is the "fix applied to the wrong half" pattern (1158), and here it would mean the second level to use
  // a model got different animations from the first.
  assert(/cb\(applyAnimCuts\(gltfCache\[url\], url\)\)/.test(src), 'the cached path slices…');
  assert(/try\{ if\(g\) applyAnimCuts\(g, url\); \}catch\(e\)\{\}/.test(src), '…and so does the fresh one');
  eq((src.match(/applyAnimCuts\(/g) || []).length, 4,
    'exactly four mentions: the declaration, the two delivery points, and the one re-apply loop — a fifth would be a site to keep in step');
  // and the cache is shared, so a re-slice has to repair every consumer at once
  const r = extractFunction('refreshAnimCuts');
  assert(/for\(const k in gltfCache\)/.test(r), 'an edit re-slices the cache…');
  assert(/rebuildAvatars/.test(r) && /refreshPlayerClipOptions/.test(r) && /refreshEnemyClipOptions/.test(r),
    '…then rebuilds the avatars and the dropdowns that read from it');
}

// ---------------------------------------------------------------- it rides the level, in all three paths
{
  // Seeded at its DECLARATION, above the bare module-level loadHostedProps() that builds the saved level's
  // props at boot (1331) — seeded late, the first level of the session would load against an empty cut set
  // and the slices would only appear on the next level change. This is that lesson applied prospectively.
  assert(/let animCuts = _sanAnimCuts\(savedLevel && savedLevel\.animCuts\)/.test(src), 'boot loads it at the declaration');
  {
    const sv = src.indexOf('let savedLevel'), ac = src.indexOf('let animCuts = _sanAnimCuts'), lh = src.indexOf('\nloadHostedProps();');
    assert(sv > 0 && sv < ac, 'savedLevel is read before animCuts reads it');
    assert(ac > 0 && lh > 0 && ac < lh, 'and animCuts is seeded before the boot loader that consumes it');
  }
  assert(/animCuts = _sanAnimCuts\(level\.animCuts\); if\(typeof refreshAnimCuts==='function'\) refreshAnimCuts\(\);/.test(src),
    'restoreLevel loads it AND re-slices before the avatars rebuild from the cache');
  assert(/try\{ animCuts = _sanAnimCuts\(level\.animCuts\); if\(typeof refreshAnimCuts==='function'\) refreshAnimCuts\(\); \}catch\(e\)\{\}/.test(src),
    'and so does the multiplayer loader');
  assert(/animCuts: \(Object\.keys\(animCuts\)\.length \? _sanAnimCuts\(animCuts\) : undefined\)/.test(src),
    'serialized only when used, and sanitized on the way OUT as well as in');
}

// ---------------------------------------------------------------- the panel
{
  const f = extractFunction('showClipSlicer');
  assert(/position:fixed;left:0;right:0;bottom:0/.test(f),
    'it is anchored to the bottom, not centred — a slicer you cannot see the model through is two number fields');
  assert(/a slicer you cannot see the model through/.test(src), 'with the reason recorded');
  assert(/n\.textContent = c\.n;/.test(f), 'a slice name is level data, so it goes in as textContent (1325)');
  assert(!/innerHTML *= *[^'"]*\+/.test(f), 'nothing in the panel interpolates into innerHTML');
  assert(/toast\('The model already has a clip called/.test(f),
    'a colliding name is REFUSED with a reason, not silently dropped by applyAnimCuts');
  assert(/if\(ex >= 0\) cuts\[ex\] = entry; else cuts\.push\(entry\);/.test(f), 'adding an existing name EDITS it');
  assert(/pushUndoSnapshot/.test(f), 'and every mutation is undoable');

  const pose = extractFunction('_slicePose');
  assert(/a\.paused = true;/.test(pose) && /mixer\.update\(0\)/.test(pose),
    'the scrub pauses the action and evaluates at an explicit time — exact, rather than racing the frame loop');
  assert(/acts\[k\]\.setEffectiveWeight\(0\)/.test(pose), 'and silences the state machine, or it blends against the pose');
  const rel = extractFunction('_sliceRelease');
  assert(/setEnemyAnimState\(v, 'idle', true\)/.test(rel),
    'closing hands the rig back, or it stands frozen on the last scrubbed pose');
  assert(/clearInterval\(_sliceLoop\)/.test(rel), 'and the range-loop timer cannot outlive the panel');
}

done('build 1336: most .glb characters and weapons bake idle, fire and reload into one long take, and this engine maps a slot to a CLIP NAME — so such a model could only ever have one animation. Slices are injected into `gltf.animations` under their own names, which is why nothing downstream changed: every consumer already resolves by name, so a slice is reachable from the slot dropdowns, the per-weapon variants, clip:<name> direct play and the peer replay at once. three\'s AnimationUtils.subclip is deliberately not used, and both of its failure modes are executed here against the real r149 build because both are silent — on a sparsely-keyed take it DROPS every track with no key in range (measured: 0 tracks, duration 0, so the slice is empty and every bone freezes on whatever the previous animation left it), and even on a dense one it shifts by the first surviving key and trims to the last, so a 2-second request came back 1 second long. Bracketing fixes all three at once: each track is evaluated at exactly the in and out points through three\'s own interpolant (so a quaternion is slerped, not lerped) and those keys inserted, giving 2 tracks, duration exactly 2.000, t=0 exactly at the in-point. The panel is anchored to the bottom of the viewport rather than centred, because a slicer you cannot see the model through is a pair of number fields — scrubbing poses the live preview rig, verified at t 0/1.25/2.5/5 posing x 0/1.25/2.5/5. Slices ride the level keyed by MODEL URL rather than by role, since the same character used by the player and an enemy must slice the same way');
