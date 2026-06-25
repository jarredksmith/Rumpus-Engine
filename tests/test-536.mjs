import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 690: a placed inventory item used its model's raw (often world-sized) scale. Now imported models are
// normalized to a sane size (PROP_FIT_TARGET), multiplied by the item's own scale; built-in shapes keep their scale.

const sp = extractFunction('spawnItemProp');
assert(/const isModel = \(typeof isModelSrc==='function'\) && isModelSrc\(it\.model\|\|''\);/.test(sp), 'detects an imported model vs a built-in shape');
assert(/const sc = isModel \? 1 : itScale;/.test(sp), 'a model spawns at unit scale (fit applies the real size); a shape uses its scale');
assert(/if\(isModel && typeof _fitPropToSize==='function'\) _fitPropToSize\(obj, PROP_FIT_TARGET \* itScale\);/.test(sp), 'imported models are fit to a normal size × the item scale');
// the fit must happen before the physics collider is captured
assert(/_fitPropToSize\(obj, PROP_FIT_TARGET \* itScale\);[\s\S]*?setPropDynamic\(obj, true\);/.test(sp), 'fit normalizes the model before setPropDynamic');

done('build 690: placed inventory items are scaled to a sane size');
