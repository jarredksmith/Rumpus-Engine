import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 691: placed inventory-item props are never destructible, and the item's "Model scale" sets the placed
// in-world size (≈ 2m × scale), with a hint making that discoverable.

// --- a placed item is not breakable ---
const sp = extractFunction('spawnItemProp');
assert(/obj\.userData\.breakable = false;/.test(sp), 'a placed inventory item is non-breakable');
// it still becomes dynamic + carried
assert(/setPropDynamic\(obj, true\);[\s\S]*?obj\.userData\.breakable = false;[\s\S]*?grabSpecificProp\(obj\)/.test(sp), 'breakable=false is applied after it goes dynamic, before carry');

// --- the size is author-settable via Model scale, fed into the fit ---
assert(/_fitPropToSize\(obj, PROP_FIT_TARGET \* itScale\)/.test(sp), 'the item scale drives the placed size');
const inv = extractFunction('renderInvItems');
assert(/it\.scale=Math\.max\(0\.05,Math\.min\(20,parseFloat\(scI\.value\)\|\|1\)\); \}; field\('Model scale', scI\);/.test(inv), 'a Model scale field exists');
assert(/Sets the in-world size when a .* item is dropped/.test(inv), 'a hint explains Model scale sets the placed size');

done('build 691: placed items are non-breakable + author-set size');
