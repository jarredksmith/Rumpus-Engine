// (build 944) JOINT-TWEAK SLIDERS — the X/Y/Z number fields became full-width range sliders with a
// live degree readout, so you drag and watch the preview move continuously. Undo is captured ONCE
// per drag (on the first input event, not per pixel), and the multiplayer character broadcast fires
// on release (change), not during the drag.
// Verified live: a simulated drag (input 20 -> 35 -> 50, then change) wrote jointFix
// {"L:forearm":[50,0,0]} with the readout showing 50°; switching bones reset the sliders, switching
// back reloaded 50, and Clear emptied the bone.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

assert(/rng\.type='range'; rng\.min='-180'; rng\.max='180'; rng\.step='1';/.test(src),
  'the axis controls are ±180° range sliders (step 1 for fine fixes)');
assert(/rng\.oninput=\(\)=>\{ if\(!_drag\)\{ pushUndoSnapshot\(\); _drag=true; \}/.test(src),
  'undo captures once per drag, not per pixel');
assert(/rng\.onchange=\(\)=>\{ _drag=false; if\(typeof _scheduleCharBroadcast==='function'\) _scheduleCharBroadcast\(\); \};/.test(src),
  'the MP character broadcast fires on release');
assert(/val\.textContent=a\[i\]\+'\\u00b0';/.test(src), 'each slider shows a live degree readout');
assert(!/inp\.type='number'; inp\.step='5'; inp\.min='-180'/.test(src), 'the old number fields are gone');

done('build 944: joint tweaks are draggable sliders — live preview follow, one undo per drag, broadcast on release');
