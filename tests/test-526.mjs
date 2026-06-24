import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 679: a grabbable prop can carry a custom "grab label" that replaces the default "[G / MMB] Grab" prompt,
// so the author can tell the player what the prop is and how to use it. Saved with the prop; safe via textContent.

// --- the live prompt uses the prop's label, falling back to the default, both aiming AND carrying ---
const ug = extractFunction('updateGrabHint');
assert(/if\(heldProp\) txt = \(heldProp\.userData && heldProp\.userData\.grabLabel\) \|\| '\[G \/ MMB\] Drop (?:·|\\u00b7) Click Throw (?:·|\\u00b7) Scroll Distance';/.test(ug), 'while carrying, a custom label replaces the drop/throw/scroll controls (build 681)');
assert(/else if\(_grabAvail\) txt = _grabLabel \|\| '\[G \/ MMB\] Grab';/.test(ug), 'the grab prompt prefers a custom label');
assert(/el\.textContent=txt/.test(ug), 'the label is rendered as text (no markup injection)');
const tg = extractFunction('tickGrabHint');
assert(/const aimed = \(gameOn && !editorOpen && !shopOpen && !paused && !duelDead\) \? _aimedProp\(\) : null;/.test(tg), 'the aimed prop is tracked');
assert(/lbl = \(aimed && aimed\.userData\.grabLabel\) \|\| ''/.test(tg), 'its grabLabel feeds the prompt');
assert(/if\(avail!==_grabAvail \|\| lbl!==_grabLabel\)\{ _grabAvail=avail; _grabLabel=lbl;/.test(tg), 'prompt refreshes when the label changes');

// --- editor field (only when grabbable) writes userData.grabLabel ---
const panel = extractFunction('renderEditorFields');
assert(/if\(sel\.userData\.noGrab!==true\)\{[\s\S]*?<b>Grab label<\/b>/.test(panel), 'a Grab label field shows for grabbable props');
assert(/sel\.userData\.grabLabel = v \|\| undefined;/.test(panel), 'the field stores the label on the prop');
assert(/glIn\.maxLength=80/.test(panel), 'the label is length-capped');

// --- persistence: serialized with the prop + restored on spawn ---
const pe = extractFunction('propEntry');
assert(/if\(o\.userData\.grabLabel && o\.userData\.noGrab!==true\) e\.glbl = String\(o\.userData\.grabLabel\)\.slice\(0,80\);/.test(pe), 'the label serializes (grabbable only)');
const ap = extractFunction('applyPropDynState');
assert(/if\(p\.glbl\) obj\.userData\.grabLabel = String\(p\.glbl\)\.slice\(0,80\);/.test(ap), 'the label restores on spawn / sync');

done('build 679: custom grab-prompt label on grabbable props');
