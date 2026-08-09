import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 688: inventory items gain a "place" use action — using the item puts its model in the player's hands (like a
// radial-deploy prop) to drop/place; the placed prop carries the item's tag + signals. The Signals editor is now a
// shared function used by both props and items.

// --- a reusable signals editor, used by props and items ---
// build 1438: the signature gained an OPTIONAL `opts` carrying the prop selection. Absent — which is how
// the inventory-item caller below asks — every path in it behaves exactly as it did, which is what makes
// it still shared rather than two editors wearing one name.
assert(/function buildSignalsUI\(sgBody, store, rerender, opts\)\{/.test(src), 'buildSignalsUI is a shared editor over a {tag,sigNeed,signals} store');
assert(/buildSignalsUI\(sgBody, sel\.userData, renderEditorFields,/.test(src), 'the prop inspector uses it');
const panel = extractFunction('renderEditorFields');   // item authoring lives here (renderInvItems is nested-rendered, but the call site is in the inv panel)
const inv = extractFunction('renderInvItems');
assert(/buildSignalsUI\(sgWrap, it, \(\)=>renderInvItems\(host\)\);/.test(inv), 'the item authoring uses it on the item def');
assert(/\['place','Place in the world \(hold & drop\)'\]/.test(inv), 'the use-action dropdown offers Place');
assert(/if\(\(it\.useType\|\|'none'\)==='place'\)\{/.test(inv), 'place items show the carry label + signals');

// --- using a "place" item spawns its model into the player's hands ---
const ui = extractFunction('useItem');
assert(/else if\(t==='place'\)\{ did = spawnItemProp\(id, it\);/.test(ui), 'use -> spawnItemProp');
const sp = extractFunction('spawnItemProp');
assert(/obj\.userData\.runtime = true;/.test(sp), 'the placed prop is session-only (like a radial deploy)');
assert(/if\(it\.tag\) obj\.userData\.tag = it\.tag;/.test(sp), 'the item tag rides onto the placed prop');
assert(/if\(Array\.isArray\(it\.signals\) && it\.signals\.length\) obj\.userData\.signals = it\.signals\.map\(s=>Object\.assign\(\{\}, s\)\);/.test(sp), 'the item signals ride onto the placed prop');
assert(/grabSpecificProp\(obj\)/.test(sp), 'it goes straight into the hands to place');

// --- the carry uses the shared grab helper ---
assert(/function grabSpecificProp\(obj\)\{/.test(src) && /const obj=_aimedProp\(\); if\(!obj\) return false;\s*\n?\s*return grabSpecificProp\(obj\);/.test(src), 'tryGrabProp delegates to grabSpecificProp');

// --- the inspect Use button labels the place action ---
assert(/it\.useType==='place' \? 'Use (?:—|\\u2014) hold & place'/.test(src), 'the inventory Use button labels Place');

done('build 688: inventory items — use to hold & place, with signals');
