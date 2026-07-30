// build 1150: a generated level's radiance bake is adopted on every device, not only ones with
// anisotropic filtering.
//
// Build 1095 added two unrelated things to the imported-material pass in one statement:
//
//     if(MAX_ANISO > 1){ for(const m of ms){ ...anisotropy...
//       if(m.userData.rumpusLightmap && m.aoMap && !m.lightMap){ ...adopt as lightMap... } } }
//
// MAX_ANISO is `Math.min(8, renderer.capabilities.getMaxAnisotropy())`, which is 1 on a driver that
// reports no anisotropic filtering — common on low-end Android and on software rasterisers. On any such
// device the whole block was skipped, so a generated level's bake stayed in the `aoMap` slot. That is not
// a cosmetic difference: aoMap MULTIPLIES the ambient (it can only darken) while lightMap ADDS coloured
// indirect light, and the bake carries the interior lamps — the only thing lighting a generated
// building's inside. The device that could least afford it lost its interior lighting and got a dirty
// AO wash instead.
//
// Sharpening a texture and adopting a bake have nothing to do with each other. Only the first depends on
// the capability.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed, at both capabilities
// The pass lives inside the model-load path, so the block is lifted out and driven directly with a fake
// mesh at MAX_ANISO 1 and at 8. A source pin cannot tell you which branch a nested `if` guards.
const BLOCK = (() => {
  const m = src.match(/\{ const ms = Array\.isArray\(o\.material\) \? o\.material : \[o\.material\];[\s\S]*?\n      \} \}/);
  assert(m, 'the imported-material pass is one readable block');
  return m[0];
})();

function run(maxAniso){
  const tex = (name) => ({ name, anisotropy: 1, colorSpace: null, encoding: null });
  const mat = { userData: { rumpusLightmap: 0.8 }, aoMap: tex('bake'), lightMap: null,
    map: tex('albedo'), normalMap: tex('nrm'), lightMapIntensity: 1, needsUpdate: false };
  const o = { material: mat };
  new Function('o', 'MAX_ANISO', 'THREE', BLOCK)(o, maxAniso, { SRGBColorSpace: 'srgb' });
  return mat;
}

{
  // the case that was broken: no anisotropic filtering available
  const m = run(1);
  eq(m.lightMap && m.lightMap.name, 'bake', 'the bake is adopted as a lightMap even when the driver reports no anisotropy');
  eq(m.aoMap, null, '...and vacates the aoMap slot, so it is not applied twice');
  eq(m.lightMapIntensity, 0.8, '...at the intensity the generator recorded');
  eq(m.needsUpdate, true, '...and the material is flagged for a recompile');
  eq(m.map.anisotropy, 1, 'while the textures are left at 1, which is all the device can do');
}
{
  // the case that always worked, unchanged
  const m = run(8);
  eq(m.lightMap && m.lightMap.name, 'bake', 'a capable device still adopts the bake');
  eq(m.map.anisotropy, 8, '...and still sharpens every texture slot');
  eq(m.normalMap.anisotropy, 8, '...including the normal map');
}
{
  // a model with no bake is untouched in that slot — an ordinary creator import must not gain a lightMap
  const plain = { userData: {}, aoMap: { name: 'ao', anisotropy: 1 }, lightMap: null, lightMapIntensity: 1, needsUpdate: false };
  new Function('o', 'MAX_ANISO', 'THREE', BLOCK)({ material: plain }, 8, { SRGBColorSpace: 'srgb' });
  eq(plain.lightMap, null, 'a plain import keeps its aoMap as an aoMap');
  eq(plain.aoMap && plain.aoMap.name, 'ao', '...and does not lose it');
}
{
  // an already-adopted bake is not adopted twice (re-entry through a reload or a material swap)
  const again = { userData: { rumpusLightmap: 1 }, aoMap: { name: 'ao2', anisotropy: 1 }, lightMap: { name: 'already' },
    lightMapIntensity: 0.5, needsUpdate: false };
  new Function('o', 'MAX_ANISO', 'THREE', BLOCK)({ material: again }, 8, { SRGBColorSpace: 'srgb' });
  eq(again.lightMap.name, 'already', 'an existing lightMap is left alone');
  eq(again.lightMapIntensity, 0.5, '...at its existing intensity');
}
{
  // multi-material meshes: every material in the array, not just the first
  const mk = () => ({ userData: { rumpusLightmap: 1 }, aoMap: { name: 'b', anisotropy: 1 }, lightMap: null, lightMapIntensity: 1, needsUpdate: false });
  const a = mk(), b = mk();
  new Function('o', 'MAX_ANISO', 'THREE', BLOCK)({ material: [a, b] }, 8, { SRGBColorSpace: 'srgb' });
  assert(a.lightMap && b.lightMap, 'both materials of a multi-material mesh adopt their bake');
}
{
  // a hole in the material array must not throw the whole load
  const ok = mkSafe();
  function mkSafe(){
    const good = { userData: { rumpusLightmap: 1 }, aoMap: { name: 'b', anisotropy: 1 }, lightMap: null, lightMapIntensity: 1, needsUpdate: false };
    new Function('o', 'MAX_ANISO', 'THREE', BLOCK)({ material: [null, good, undefined] }, 8, { SRGBColorSpace: 'srgb' });
    return good;
  }
  assert(ok.lightMap, 'a null entry beside a real material is skipped rather than thrown on');
}

// ---------------------------------------------------------------- the shape, pinned
{
  assert(/if\(typeof MAX_ANISO !== 'undefined' && MAX_ANISO > 1\)\n\s*for\(const k of \['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'\]\)/.test(src),
    'the capability gate now covers ONLY the texture sharpening');
  // and the adoption sits outside it, at the same nesting level
  const blk = BLOCK;
  const gate = blk.indexOf("MAX_ANISO > 1");
  const adopt = blk.indexOf("m.userData.rumpusLightmap");
  assert(gate >= 0 && adopt > gate, 'the adoption comes after the gate...');
  assert(!/MAX_ANISO > 1\)\{[\s\S]*rumpusLightmap/.test(blk), '...and is not inside its body');
  // build 1115's warning must survive: r149 already multiplies by PI on upload
  assert(/do NOT scale this by PI/.test(blk), 'the PI warning stays where the intensity is set');
  assert(/m\.lightMapIntensity = \+m\.userData\.rumpusLightmap \|\| 1;/.test(blk), '...and the intensity is still the recorded value, unscaled');
}

done('build 1150: a generated level\'s radiance bake is adopted as a lightMap on every device — build 1095 nested it inside the anisotropic-filtering gate, so the phones that needed the interior lighting most were the ones that lost it');
