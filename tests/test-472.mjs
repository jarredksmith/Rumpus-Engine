import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 618: inventory-item pickups use EACH item's own model, never the kind-wide pickupModels override.

const bm = extractFunction('buildPowerupMesh');
// the kind-wide override is skipped for item pads
assert(/if\(pm && pm\.url && kind!=='item'\)\{/.test(bm), 'kind-wide model override is bypassed for item pickups');
// the item branch reads the per-item model from invCatalog by the spot's itemId
assert(/const it=\(typeof invCatalog!=='undefined'\) \? invCatalog\[itemId\] : null;/.test(bm), 'item pads resolve the model from invCatalog[itemId]');
assert(/if\(it && it\.model && typeof loadGLTFCached==='function'\)\{ loadGLTFCached\(it\.model,/.test(bm), 'item pads load that item\u2019s own model');
assert(/\*\(it\.scale\|\|1\)/.test(bm), 'item pads honor the per-item scale');

// authoring stays per-item: each new item gets a unique id and its own model field
assert(/function _newInvId\(\)\{ let i=1; while\(invCatalog\['item_'\+i\]\) i\+\+; return 'item_'\+i; \}/.test(src), 'each new item gets a unique catalog id');
assert(/defineItem\(\{ id, name:'New Item', type:'object' \}\); _editInvId=id;/.test(src), 'New item creates a fresh catalog entry');
assert(/setB\.onclick=\(\)=>\{ pushUndoSnapshot\(\); it\.model=urlI\.value\.trim\(\); it\.thumb=''; renderInvItems\(host\); \}/.test(src), 'the model field writes only to the selected item');

// editor no longer shows the kind-wide model field for item pads
assert(/if\(newPickupKind!=='item'\)\{ const pm = pickupModels\[newPickupKind\]/.test(src), 'kind-wide model UI is hidden for item pickups');
assert(/Inventory-item pads use <b>each item\\u2019s own model<\/b>/.test(src), 'item pads point the author to per-item models');

done('per-item pickup models: item pads no longer share one kind-wide model (build 618)');
