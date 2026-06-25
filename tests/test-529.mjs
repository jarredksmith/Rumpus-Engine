import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 683: a per-prop grab distance. By default a grabbable prop can be picked up from the full reach
// (HOLD_GRAB_RANGE); an author can require the player to be much closer before the grab prompt / pickup works.

// --- _aimedProp gates the grab on the prop's own range ---
const ap = extractFunction('_aimedProp');
assert(/const range = \(node\.userData\.grabRange>0\) \? node\.userData\.grabRange : HOLD_GRAB_RANGE;/.test(ap), 'resolves a per-prop range, default = full reach');
assert(/if\(hits\[0\]\.distance > range\) return null;/.test(ap), 'too-far props are not grabbable (and show no prompt)');

// --- editor: a Grab distance slider on grabbable props ---
const panel = extractFunction('renderEditorFields');
assert(/<b>Grab distance<\/b>/.test(panel), 'a Grab distance control exists');
assert(/if\(m>=gdMax\) sel\.userData\.grabRange=undefined; else sel\.userData\.grabRange=m;/.test(panel), 'max = default (cleared); anything less is stored');
assert(/gdMax=\+HOLD_GRAB_RANGE/.test(panel), 'the slider caps at the engine reach');

// --- persistence: serialized (grabbable only) + restored ---
const pe = extractFunction('propEntry');
assert(/if\(o\.userData\.grabRange>0 && o\.userData\.noGrab!==true\) e\.grng = \+o\.userData\.grabRange;/.test(pe), 'grab range serializes (grabbable only)');
const dyn = extractFunction('applyPropDynState');
assert(/if\(p\.grng>0\) obj\.userData\.grabRange = \+p\.grng;/.test(dyn), 'grab range restores on spawn / sync');

done('build 683: per-prop grab distance');
