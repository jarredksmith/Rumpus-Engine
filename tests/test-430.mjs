import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 564: material-panel edits (color/texture/tiling/rotation/emissive/finish) apply to EVERY selected
// primitive via _matTargets(), not just the primary. Pairs with the build-563 marquee (box-select, then restyle).

// helper exists + filters to shape primitives, falling back to the primary props target
const mt = extractFunction('_matTargets');
assert(/selProps && selProps\.length/.test(mt), 'uses the multi-selection when present');
assert(/editorTargets\.props\.obj\(\)/.test(mt), 'falls back to the primary props target');
assert(/\.filter\(o=>o && isMatPrimitive\(o\.userData\.src\)\)/.test(mt), 'restricts to material-editable primitives (build 871: incl. ramp/stairs/dome/tube/torus)');

// every material handler loops over _matTargets()
assert(/for\(const o of _matTargets\(\)\) applyPropColor\(o, hex\);/.test(src), 'color is bulk');
assert(/for\(const o of _matTargets\(\)\)\{ o\.userData\.texN=''; o\.userData\.texR=''; applyPropTexture\(o, url\); \}/.test(src), 'apply-texture is bulk (and clears PBR maps per prop)');
assert(/for\(const o of _matTargets\(\)\) applyPropTexture\(o, ''\);/.test(src), 'clear-texture is bulk');
assert(/for\(const o of _matTargets\(\)\) applyPropTexRepeat\(o, u, v\);/.test(src), 'tiling repeat is bulk');
assert(/for\(const o of _matTargets\(\)\) applyPropTexRebind\(o\);/.test(src), 'tiling rebind is bulk');
assert(/for\(const o of _matTargets\(\)\) applyPropTexRot\(o, d\);/.test(src), 'rotation is bulk');
assert(/for\(const o of _matTargets\(\)\) applyPropEmissive\(o, c, iv\);/.test(src), 'emissive set is bulk');
assert(/for\(const o of _matTargets\(\)\)\{ if\(ecb\.checked\) applyPropEmissive\(o, c, iv\); else clearPropEmissive\(o\); \}/.test(src), 'emissive on/off is bulk');
assert(/for\(const o of _matTargets\(\)\)\{ const cur=o\.userData\.shine.*applyPropShine\(o, 1 - v, cur\.m\); \}/.test(src), 'shininess is bulk');
assert(/for\(const o of _matTargets\(\)\)\{ const cur=o\.userData\.shine.*applyPropShine\(o, cur\.r, v\); \}/.test(src), 'metalness is bulk');
// texture-search pick (Poly Haven) also fans out to the whole selection
assert(/const tg=_matTargets\(\); if\(!tg\.length\) return false; pushUndoSnapshot\(\); for\(const o of tg\) applyPropTexturePBR\(o, maps\);/.test(src), 'texture-search pick is bulk');

// the panel tells the user when it is editing more than one prop
assert(/Editing '\+_matN\+' selected props/.test(src), 'panel shows a multi-edit count note');

// --- executable model: _matTargets selection (multi -> primitives only; empty -> primary; primary non-prim -> none) ---
const PRIMS = new Set(['box','sphere','cylinder','cone','pillar']);
const isShapePrim = s => PRIMS.has(s);
function matTargets(selProps, primary){
  const list = (selProps && selProps.length) ? selProps : [primary];
  return list.filter(o=>o && isShapePrim(o.userData.src));
}
const box={userData:{src:'box'}}, sph={userData:{src:'sphere'}}, glb={userData:{src:'https://x/y.glb'}};
eq(matTargets([box,sph,glb,null], null).length, 2, 'multi-selection keeps only the 2 primitives (drops glb + null)');
eq(matTargets([], box).length, 1, 'empty selection falls back to the primary primitive');
eq(matTargets([], glb).length, 0, 'a non-primitive primary yields no material targets');
eq(matTargets([glb], box).length, 0, 'a selection of only a non-primitive yields nothing (no accidental primary edit)');

done('bulk material: color/texture/tiling/rotation/emissive/finish apply across every selected primitive (build 564)');
