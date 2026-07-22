// (build 989) UN-BURY THE PROP INSPECTOR. The Animation sub-fold had quietly become home to NINE
// folds — Lock, Signals, Dialogue, Vehicle, Joint, Mechanism, Waypoint path, Physics & destruction
// all hid under a drop-down named "Animation". They now live in honestly-named Object sub-folds:
//   Animation            -> clip playback + add-time defaults only
//   Interaction & logic  -> Lock, Signals, Dialogue (responds to the player)
//   Motion & physics     -> Mechanism, Waypoint path, Vehicle, Joint, Physics & destruction
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// ---- the three sub-folds exist in the Object section, in this order ----
const mAnim = src.indexOf("subfold('Animation', 'o_anim', '<div id=\"edAnim\"></div>', false)");
const mLogic = src.indexOf("subfold('Interaction &amp; logic', 'o_logic', '<div id=\"edBehave\"></div>', false)");
const mMotion = src.indexOf("subfold('Motion &amp; physics', 'o_motion', '<div id=\"edMotion\"></div>', false)");
assert(mAnim > 0 && mLogic > mAnim && mMotion > mLogic, 'Animation, then Interaction & logic, then Motion & physics');

// ---- the renderer clears all three hosts (stale UI never lingers on reselect) ----
assert(/const behaveHost = editorEl\.querySelector\('#edBehave'\) \|\| animHost;/.test(src)
    && /const motionHost = editorEl\.querySelector\('#edMotion'\) \|\| animHost;/.test(src),
  'the new hosts resolve beside animHost (with a safe fallback)');
assert(/if\(behaveHost!==animHost\) behaveHost\.innerHTML='';/.test(src) && /if\(motionHost!==animHost\) motionHost\.innerHTML='';/.test(src),
  'both new hosts clear on every render');

// ---- every fold moved to its logical home (ids/titles/subtitles unchanged — saved fold state survives) ----
for(const [host, id] of [['behaveHost','lock'],['behaveHost','signals'],['behaveHost','dialogue'],
                         ['motionHost','vehicle'],['motionHost','joint'],['motionHost','mech'],
                         ['motionHost','waypath'],['motionHost','physdest']])
  assert(src.indexOf("edFold("+host+", '"+id+"'") >= 0, id+' fold lives in '+host);
assert(src.indexOf("edFold(animHost, 'anim'") >= 0, 'clip playback is the ONLY fold left under Animation');
assert(!/edFold\(animHost, '(lock|signals|dialogue|vehicle|joint|mech|waypath|physdest)'/.test(src),
  'nothing else still renders into the Animation fold');

// ---- the empty-fold hider knows the new hosts (gun/station selections leave them hidden, not blank) ----
assert(/object:\['edPropTag','edShapes','edModels','edUrl','edPicker','edAnim','edBehave','edMotion','edLibrary'\]/.test(src),
  'contextual hiding covers the two new hosts');

// ---- the no-animation notes point at the new address (textContent — plain text, no entities) ----
assert(/To move\/rotate it, open Motion & physics \\u2192 Mechanism below\./.test(src),
  'the primitive-shape note names the new home');
assert(/To move it, open Motion & physics \\u2192 Mechanism below/.test(src),
  'the clipless-model note names the new home');
assert(!/Use the Mechanism section below/.test(src), 'the old "section below" wording is gone');

done('build 989: inspector regroup — Interaction & logic + Motion & physics un-bury the Animation fold');
