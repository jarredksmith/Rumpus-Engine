import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 400: when a selected prop has NO detected animations, the editor explains why the play/loop controls
// are absent (instead of silently showing nothing), and points to the Mechanism section / animated search.

assert(/else if\(sel\)\{/.test(src), 'there is an else-branch for props without animations');
assert(/This model has no animation clips yet/.test(src), 'explains a model with no clips (build 1064: and points at the Animation editor)');
assert(/This is a built-in shape \(no animation\)\. To move\/rotate it, open Motion & physics/.test(src), 'explains a primitive shape (pointing at the build-989 Motion & physics home)');
assert(/const isPrim = \(typeof isPrimitive==='function'\) && isPrimitive\(sel\.userData\.src\|\|''\);/.test(src), 'distinguishes primitives from models');
// the note points at the Sketchfab animated filter we added earlier
assert(/Animated only/.test(src), 'suggests the animated-only search');
done();
