import { gameSource, extractFunction, extractConst, assert, done } from './harness.mjs';
const src = gameSource();
// build 398: (bug) pressing E on a trigger prop ignored the clip chosen in the editor and played all clips;
// playPropAnimationOnce now defaults to the prop's selected animClip. (feature) the signal "Play anim" action
// gets a clip dropdown of the prop's animations instead of an error-prone free-text box.

// --- bug fix: E-key falls back to the prop's chosen clip ---
const ppa = extractFunction('playPropAnimationOnce');
assert(/const want = clip \|\| obj\.userData\.animClip \|\| '';/.test(ppa), 'E-key activation falls back to the editor-chosen clip');
assert(/if\(want\)\{ const m = acts\.filter\(a=>\{ try\{ return a\.getClip\(\)\.name===want;/.test(ppa), 'it filters to that clip');

// the E-key handler still calls it with no explicit clip (so the fallback is what makes the choice work)
assert(/playPropAnimationOnce\(o\);\s*\n\s*const i = propModels\.indexOf\(o\); if\(i>=0\) broadcastAnim\(i\);/.test(src), 'E activation relies on the per-prop clip (no explicit arg)');

// --- signals can already target a specific clip (s.clip), now via a dropdown ---
// the data + dispatch path passes s.clip through
assert(/else if\(s\.do==='anim'\)\{ playPropAnimationOnce\(t, s\.clip\); broadcastAnim\(i, s\.clip\); \}/.test(src), 'a signal "Play anim" plays the named clip on the target');
// the editor offers a dropdown of the prop's clips for the signal action
assert(/o0\.textContent='\(all clips\)';/.test(src), 'signal anim action has an (all clips) option');
assert(/cs\.onchange=\(\)=>\{ pushUndoSnapshot\(\); if\(cs\.value\) s\.clip=cs\.value; else delete s\.clip; \};/.test(src), 'choosing a clip in the signal sets s.clip');
assert(/o\.textContent=s\.clip\+' \(other\)'/.test(src), 'a clip typed for a different target is preserved as an "(other)" option');
// free-text fallback remains when clip names are unknown
assert(/:'clip name \(blank = all clips\)'/.test(src), 'free-text fallback kept for props with unknown clips');

// signal clip is serialized both ways
/* build 1406: the clip's short key is now stated once in SIG_KEYS and both directions derive from it */
assert(/\bclip:'c'/.test(extractConst('SIG_KEYS')), 'signal clip saved under the short key c');
assert(/e\.sg=o\.userData\.signals\.map\(_sigPack\)/.test(src) && /p\.sg\.map\(_sigUnpack\)/.test(src),
  'signal clip restored — through the one pack/unpack pair, so it cannot be dropped on one side only');
done();
