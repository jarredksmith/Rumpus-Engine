// (build 805) In the editor free-fly camera, Ctrl must NOT sink the view. Ctrl was a descend key (alongside Q), so holding
// it for any shortcut (Ctrl+Z undo, Ctrl+S, Ctrl+G group, …) dragged the camera downward. Descend is now Q only.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// the free-fly ascend/descend lines
assert(/if\(keys\['Space'\] \|\| keys\['KeyE'\]\) flyPos\.y \+= spd;/.test(src), 'Space / E still ascend');
assert(/if\(keys\['KeyQ'\]\) flyPos\.y -= spd;/.test(src), 'descend is Q only');

// Ctrl is no longer wired into the descend
assert(!/keys\['KeyQ'\] \|\| \(ctrlHeld/.test(src), 'Ctrl is no longer part of the descend condition');
assert(!/const ctrlCombo = ctrlHeld/.test(src), 'the old ctrl-combo guard is gone (Ctrl simply does not descend now)');

done('build 805: free-fly camera descend is Q only — Ctrl no longer sinks the view');
