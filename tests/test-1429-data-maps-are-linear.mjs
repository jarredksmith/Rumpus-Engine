// build 1429 — an imported model's DATA maps must reach the shader LINEAR, whatever the file said.
//
// Reported from use: a KTX2 barrel renders with shattered, faceted, blue-green shading in Rumpus while
// every preview tool shows it correctly. The chain, verified in this file's own inlined GLTFLoader and in
// the r149 KTX2Loader, and then measured:
//   KTX2Loader   texture.encoding = dfdTransferFn === KHR_DF_TRANSFER_SRGB ? sRGBEncoding : LinearEncoding
//   GLTFLoader   if ( encoding !== undefined ) texture.encoding = encoding;      <- ASSIGNS, never CLEARS
// GLTFLoader passes an encoding for `map` and `emissiveMap` alone, so every other slot keeps whatever the
// container declared — and the KTX2 encoders creators actually use mark all four images sRGB.
import { gameSource, html, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();
// The vendored GLTFLoader is its own script block, not the game's — so the premise pins read the whole
// file. (gameSource() is the LARGEST block, which is the engine.)
const lib = html;

/* ---- the premise, in this file's own vendored loader ------------------------------------------- */
// If a three upgrade ever makes assignTexture clear the slot itself, this repair becomes redundant and
// this pin is how we find out — rather than carrying a second correction forever.
const at = lib.match(/assignTexture\( materialParams, mapName, mapDef, encoding \)[\s\S]*?\n\t\}/);
assert(at, 'assignTexture found in the inlined GLTFLoader');
assert(/if \( encoding !== undefined \) \{[\s\S]*?texture\.encoding = encoding;/.test(at[0]),
  'PREMISE: assignTexture only ASSIGNS an encoding, it never clears one to linear');
assert(!/LinearEncoding/.test(at[0]), 'PREMISE: assignTexture never sets LinearEncoding itself');

// and that it is called WITH sRGB for the colour slots and WITHOUT for the data slots
for (const colour of ['map', 'emissiveMap'])
  assert(new RegExp("assignTexture\\( materialParams, '" + colour + "'[^)]*sRGBEncoding \\)").test(lib),
    'PREMISE: ' + colour + ' is assigned sRGBEncoding');
for (const data of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'])
  assert(new RegExp("assignTexture\\( materialParams, '" + data + "', [A-Za-z.]+ \\)").test(lib),
    'PREMISE: ' + data + ' is assigned NO encoding, so the file’s own wins');

/* ---- the slot list ------------------------------------------------------------------------------ */
// extractConst returns the literal's SOURCE TEXT, so evaluate it to get the real list the engine uses —
// never a copy retyped here, which is the drift this list exists to prevent.
const SLOTS = new Function('return ' + extractConst('DATA_MAP_SLOTS'))();
assert(Array.isArray(SLOTS), 'DATA_MAP_SLOTS is a list');
for (const k of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'])
  assert(SLOTS.includes(k), k + ' is data and must be forced linear');
// The other direction is the one that would silently wash out a level: a colour map dragged to linear
// renders washed and pale, so these must NEVER appear here.
for (const k of ['map', 'emissiveMap', 'lightMap', 'sheenColorMap', 'specularColorMap'])
  assert(!SLOTS.includes(k), k + ' carries COLOUR and must keep its sRGB decode');
eq(new Set(SLOTS).size, SLOTS.length, 'no duplicate slots');

/* ---- the repair, executed --------------------------------------------------------------------- */
const loop = src.match(/for\(const k of DATA_MAP_SLOTS\)\{[\s\S]*?\n        \}/);
assert(loop, 'the repair loop is in the imported-material pass');

const run = (mat, THREE) => {
  new Function('m', 'DATA_MAP_SLOTS', 'THREE', loop[0])(mat, SLOTS, THREE);
  return mat;
};
const tex = (enc) => ({ encoding: enc, needsUpdate: false });
const R149 = { NoColorSpace: undefined };   // r149 has no colorSpace property at all

// the barrel, as it actually arrived: every map sRGB
let m = { map: tex(3001), normalMap: tex(3001), roughnessMap: tex(3001), metalnessMap: tex(3001),
          emissiveMap: tex(3001), needsUpdate: false };
run(m, R149);
eq(m.normalMap.encoding, 3000, 'normal map forced linear');
eq(m.roughnessMap.encoding, 3000, 'roughness map forced linear');
eq(m.metalnessMap.encoding, 3000, 'metalness map forced linear');
eq(m.map.encoding, 3001, 'the ALBEDO is untouched — it really is sRGB');
eq(m.emissiveMap.encoding, 3001, 'the emissive map is untouched');
assert(m.needsUpdate, 'the material is recompiled — encoding is a program define, not a uniform');
assert(m.normalMap.needsUpdate, 'the texture is re-uploaded');

// a correctly-authored model: every data map already linear -> a complete no-op, nothing recompiled
m = { map: tex(3001), normalMap: tex(3000), roughnessMap: tex(3000), needsUpdate: false };
run(m, R149);
eq(m.normalMap.encoding, 3000, 'an already-linear map stays linear');
assert(!m.needsUpdate, 'a correct model triggers NO recompile — this is free for everyone else');
assert(!m.normalMap.needsUpdate, 'and no re-upload');

// empty slots must not throw
m = { map: null, normalMap: null, needsUpdate: false };
run(m, R149);
assert(!m.needsUpdate, 'a material with no maps is untouched');

// forward compatibility: a three that has colorSpace takes that branch instead
m = { normalMap: { colorSpace: 'srgb', needsUpdate: false }, needsUpdate: false };
run(m, { NoColorSpace: '' });
eq(m.normalMap.colorSpace, '', 'a colorSpace-era three is corrected through colorSpace, not encoding');
assert(m.needsUpdate, 'and still recompiles');

/* ---- ordering ---------------------------------------------------------------------------------- */
// build 1331: loadHostedProps() runs at module level and builds a saved level's props during boot, so
// anything finalizeProp reads must be DECLARED above it or the first level of a session throws a TDZ.
const iSlots = src.indexOf('const DATA_MAP_SLOTS');
const iFinal = src.indexOf('function finalizeProp(');
const iBoot = src.indexOf('\nloadHostedProps();');
assert(iSlots > 0 && iFinal > iSlots, 'DATA_MAP_SLOTS is declared ABOVE finalizeProp');
assert(iBoot > iSlots, 'and above the module-level loadHostedProps() call');

// The repair must run BEFORE build 1095's lightmap adoption: that moves aoMap into lightMap and sets it
// sRGB deliberately (the bake IS sRGB-authored). Repairing afterwards would drag the bake to linear and
// wash out every generated level's interior lighting.
const pass = src.slice(iFinal, iFinal + 12000);
const iRepair = pass.indexOf('for(const k of DATA_MAP_SLOTS)');
const iAdopt = pass.indexOf('m.userData.rumpusLightmap');
assert(iRepair > 0 && iAdopt > iRepair, 'the linear repair runs BEFORE the lightmap adoption');

// and the adoption still sets the lightmap sRGB on the way past
assert(/m\.lightMap = m\.aoMap; m\.aoMap = null;/.test(src), 'the bake still moves aoMap -> lightMap');
assert(/lightMap\.encoding = 3001/.test(src), 'and the bake is still decoded as sRGB');

done();
