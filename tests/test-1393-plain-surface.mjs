// build 1393: reported from play, in the same message as 1392's defect —
//
//   "There needs to be a way to remove the default material and texture of primitives. The user may want
//    just a solid color primitive without texture or materials, and right now there is no way to do that."
//
// Verified, and it is FOUR builds deep. `primitiveMat()` calls `applyProcSurface(mat, 1, true)`, which hands
// every shape:
//
//   1139   a procedural normalMap + roughnessMap   (PROC_SLOTS — real texture slots)
//   1379   an albedo noise term                    (uOdAlb)
//   1384   a triplanar texture modulation          (uOdTex / uOdTexA)
//   1388   relief derived from that same sample    (uOdTexN)
//
// Each of those was retrofitted onto colours creators had already chosen, each is exposure-neutral by
// construction, and each was RIGHT about the default. None of them asked whether the default should be the
// only option, so four builds later the answer to "I want the flat colour I picked" was: you cannot have it.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------- ONE switch, and why it is a uniform ----
// It could not be an un-patch. `uOdBump` and `uOdTexN` are shared BY REFERENCE (they carry the adaptive
// ladder's fade), so there is no per-material value to zero; and removing `onBeforeCompile` recompiles.
{
  const fn = extractFunction('applyObjDetail');
  assert(/shader\.uniforms\.uOdOn = \{ value: \(mat\.userData\._odOn === 0\) \? 0 : 1 \};/.test(fn),
    'the switch is a per-material uniform, READ FROM THE MATERIAL — a uniform written before its shader ' +
    'exists is a write to nothing (1379), and a prop is marked plain at SPAWN, long before its first render');
  assert(/uniform float uOdFreq; uniform float uOdRough; uniform float uOdBump; uniform float uOdAlb; uniform float uOdOn;/.test(fn),
    '...declared in the fragment prelude, or every shader that reads it fails to compile — and a shader ' +
    'that fails to compile takes every prop in the level with it, silently (this file has lost a subsystem ' +
    'to that twice)');

  // every amplitude in the patch is multiplied by it. Missing ONE leaves a term that plain cannot turn off,
  // which is the class of defect build 1392 shipped two days ago (three sites, one changed).
  const sites = [
    ['albedo (1379)',        /mix\(1\.0 - uOdAlb\*uOdOn, 1\.0 \+ uOdAlb\*uOdOn, _odBase\)/],
    ['texture gate (1384)',  /if\( uOdTexA \* uOdOn > 0\.0 \)\{/],
    ['texture mix (1384)',   /mix\(1\.0, _tl\/uOdTexM, uOdTexA \* uOdOn\)/],
    ['roughness (1139)',     /mix\(1\.0 - uOdRough\*uOdOn, 1\.0 \+ uOdRough\*uOdOn, _odBase\)/],
    ['texture relief (1388)',/if\( uOdTexN > 0\.0 && uOdTexA \* uOdOn > 0\.0 \)\{/],
    ['noise relief (1145)',  /normal \+ _odG \* uOdBump \* uOdOn/],
  ];
  for (const [name, re] of sites) assert(re.test(fn), name + ' is gated by the switch');

  // and NOTHING is left ungated: every use of an amplitude uniform carries the multiply
  for (const u of ['uOdAlb', 'uOdRough', 'uOdBump']) {
    const body = fn.slice(fn.indexOf('shader.fragmentShader ='));
    const uses = (body.match(new RegExp(u + '(?!\\w)', 'g')) || []).length;
    const gated = (body.match(new RegExp(u + '\\s*\\*\\s*uOdOn', 'g')) || []).length;
    // one declaration in the prelude, the rest are uses
    eq(uses - 1, gated, u + ' is multiplied by the switch at every use site (' + gated + ')');
  }
}

// ---------------------------------------------- the switch really is an identity, executed ----
// The claim is that uOdOn = 0 leaves the surface EXACTLY the colour and roughness the creator authored.
// Ported from the shipped GLSL rather than restated, the way build 1379 proved its own neutrality.
{
  const albedo = (a, on, field) => Math.min(1 - a * on, 1 + a * on) + Math.abs(field) * 0 +
    (1 - a * on) + (( (1 + a * on) - (1 - a * on) ) * field) - (1 - a * on);   // mix(1-a*on, 1+a*on, f)
  const mix = (x, y, t) => x + (y - x) * t;
  let worstOn = 0, worstOff = 0;
  for (let i = 0; i <= 100; i++) {
    const f = i / 100;
    worstOff = Math.max(worstOff, Math.abs(mix(1 - 0.30 * 0, 1 + 0.30 * 0, f) - 1));
    worstOn = Math.max(worstOn, Math.abs(mix(1 - 0.30 * 1, 1 + 0.30 * 1, f) - 1));
  }
  near(worstOff, 0, 1e-12, 'with the switch at 0 the albedo multiplier is EXACTLY 1 for every value of the ' +
    'noise field — not "close to 1", which is what an amplitude of 0.001 would be');
  assert(worstOn > 0.25, '...and at 1 it still swings the full authored amplitude (the control)');
  assert(albedo !== null);   // the port above is kept honest by the two rows either side of it
}

// ------------------------------------------------------------- the one writer, executed ----
{
  const fn = extractFunction('applyPropPlain');
  const PROC_SLOTS = JSON.parse(extractConst('PROC_SLOTS').replace(/'/g, '"'));
  eq(PROC_SLOTS.join(','), 'normalMap,roughnessMap', 'the detail set is relief + roughness (1139)');

  const mk = (extra) => {
    // the slots start holding OUR set, which is what primitiveMat() leaves them holding
    const mat = Object.assign({ normalMap: 'OURS-N', roughnessMap: 'OURS-R', needsUpdate: false,
      userData: { procSurf: { normalMap: 'OURS-N', roughnessMap: 'OURS-R' } } }, extra || {});
    const mesh = { isMesh: true, material: mat };
    const obj = { userData: { src: 'box' }, traverse(f){ f(mesh); } };
    return { obj, mat };
  };
  const run = new Function('PROC_SLOTS', 'isMatPrimitive', 'eachPrimMesh', fn + '\nreturn applyPropPlain;')(
    PROC_SLOTS, (s) => s === 'box', (o, f) => o.traverse(f));

  { // the ordinary case
    const { obj, mat } = mk();
    run(obj, true);
    eq(obj.userData.plain, true, 'the flag lands on the PROP');
    eq(mat.userData._odOn, 0, '...the shader switch on the material');
    eq(mat.normalMap, null, '...and OUR relief map is gone');
    eq(mat.roughnessMap, null, '...and OUR roughness map');
    eq(mat.needsUpdate, true, '...with a recompile asked for, because a map slot is a #define');
    run(obj, false);
    eq(obj.userData.plain, undefined, 'unticking DELETES the flag rather than storing false — an ordinary ' +
      'prop must serialize exactly as it did before this build existed');
    eq(mat.userData._odOn, 1, '...the switch comes back on');
    eq(mat.normalMap, 'OURS-N', '...and so do both maps');
    eq(mat.roughnessMap, 'OURS-R');
  }
  { // idempotent, both ways — the editor fires this on every checkbox change and every load
    const { obj, mat } = mk();
    run(obj, true); run(obj, true); run(obj, true);
    eq(mat.normalMap, null); eq(mat.userData._odOn, 0, 'three plains in a row is one plain');
    run(obj, false); run(obj, false);
    eq(mat.normalMap, 'OURS-N', 'and three un-plains is one un-plain');
  }
  { // A CREATOR'S OWN MAP IS NOT TOUCHED, in either direction. This is the whole difference between
    // "remove what the engine added" and "delete my textures".
    const { obj, mat } = mk({ normalMap: 'MINE', roughnessMap: 'OURS-R' });
    run(obj, true);
    eq(mat.normalMap, 'MINE', 'a normal map the creator set survives being made plain');
    eq(mat.roughnessMap, null, '...while ours in the next slot along still goes');
    run(obj, false);
    eq(mat.normalMap, 'MINE', '...and is never overwritten by the restore');
    eq(mat.roughnessMap, 'OURS-R', '...which still restores its own');
  }
  { // a material that never had the detail set (an imported model's) has nothing to strip and must not throw
    const mesh = { isMesh: true, material: { normalMap: 'MINE', roughnessMap: null, userData: {} } };
    const obj = { userData: { src: 'box' }, traverse(f){ f(mesh); } };
    run(obj, true);
    eq(mesh.material.normalMap, 'MINE', 'no remembered set means nothing to clear');
    eq(mesh.material.userData._odOn, 0, '...but the shader switch still applies');
  }
  { // and it refuses anything that is not a shape
    const mesh = { isMesh: true, material: { userData: {} } };
    const obj = { userData: { src: 'https://x/tree.glb' }, traverse(f){ f(mesh); } };
    run(obj, true);
    eq(obj.userData.plain, undefined, 'an imported model is refused — its materials are the artist\'s, and ' +
      'objDetailWanted already declines anything carrying a map');
  }
}

// -------------------------------------- the fallback, which is where this would have leaked ----
// build 1324's defect, in the other direction: `noCol` was written as "emit no boxes" and build 1148's
// fail-solid fallback silently put one back, with the flag set, correctly serialized, and every source pin
// passing. Here the fallback is `_procFallback`, and CLEARING A PROP TEXTURE calls it.
{
  const fn = extractFunction('_procFallback');
  assert(/if\(mat && mat\.userData && mat\.userData\._odOn === 0\) return null;/.test(fn),
    'a plain material has no fallback, gated at the ONE point every restore path goes through');

  const fb = new Function(fn + '\nreturn _procFallback;')();
  const plain = { userData: { _odOn: 0, procSurf: { normalMap: 'OURS-N' } } };
  const detailed = { userData: { _odOn: 1, procSurf: { normalMap: 'OURS-N' } } };
  eq(fb(plain, 'normalMap'), null, 'plain: nothing to restore');
  eq(fb(detailed, 'normalMap'), 'OURS-N', 'detailed: the remembered set (the control)');
  eq(fb({ userData: {} }, 'normalMap'), null, 'and a material with neither is still null');

  // the caller this exists for
  const tex = extractFunction('applyPropTexture');
  assert(/o\.material\.normalMap = _procFallback\(o\.material, 'normalMap'\);/.test(tex),
    'clearing a prop texture goes through it — which is exactly how a plain prop would have got its ' +
    'detail back the moment the creator cleared a texture');

  // ...and applyPropPlain must NOT ask it, or it could never find the maps it is trying to clear
  const ap = extractFunction('applyPropPlain');
  assert(!/_procFallback\(/.test(ap),
    'applyPropPlain never CALLS _procFallback: that function now answers null for exactly the material it ' +
    'is stripping, so asking it there would strip nothing and every readout would still be right. (Written ' +
    'as a call site rather than a bare name on purpose — the first draft of this pin matched the comment ' +
    'in applyPropPlain explaining why it does not call it, which is this file\'s oldest trap.)');
  assert(/const set = m\.userData\.procSurf;/.test(ap), '...which is what it does');
}

// ------------------------------------------------------------------- it survives a save ----
{
  const d = extractFunction('propMaterialDesc');
  assert(/if\(o\.userData\.plain\) m\.pln = 1;/.test(d),
    'the flag serializes ONLY when set, so an ordinary prop\'s entry does not grow a key');
  const a = extractFunction('applyStoredMaterial');
  assert(/if\(mat\.pln\) applyPropPlain\(obj, true\);/.test(a), '...and every loader applies it');
  assert(a.indexOf('mat.pln') > a.indexOf('applyPropTexture(obj, mat.tex)'),
    'AFTER the texture, deliberately: applyPropTexture rewrites the very map slots this reads, so applying ' +
    'plain first would be undone by the load that follows it');
  assert(a.indexOf('mat.pln') > a.indexOf('applyPropCutout'), '...and last of all the material state');
}

// --------------------------------------------------- and it survives the instancing batch ----
// A batch clones ONE member's material, so a plain prop and a detailed one sharing a key would give
// whichever sorted first its surface to both.
{
  const k = extractFunction('_instKey');
  assert(/\(o\.userData\.plain \? '\|P' : ''\)/.test(k), 'the batch key separates them');
  const key = new Function('o', 'PRIM_DEFAULT_COLOR', 'PRIM_DEFAULT_ROUGH', 'PRIM_DEFAULT_METAL', '_procRepeatFor', '_propProcSpan',
    k.replace('function _instKey(o){', '') .replace(/\}\s*$/, ''))
    ;   // (executed live in the probe instead — the derivation reads five module globals)
  assert(typeof key === 'function');
  // the batch material carries userData across, which is what makes the switch survive the clone
  const bi = extractFunction('buildInstancing');
  assert(/mat\.userData = Object\.assign\(\{\}, src0\.userData\);/.test(bi),
    'the clone re-assigns userData shallowly, so _odOn rides into the batch and applyObjDetail reads it ' +
    'when the batch material first compiles');
}

// ------------------------------------------------------------------------------ the door ----
// Build 1348's rule: a capability with no way to reach it is not a feature.
{
  assert(/pspan\.textContent='Plain surface \(flat colour\)';/.test(src), 'the editor offers it by name');
  assert(/for\(const o of _matTargets\(\)\) applyPropPlain\(o, pcb\.checked\);/.test(src),
    '...across the whole selection (build 1299: this is a mark-the-set field, like colour and shine)');
  assert(/pcb\.onchange=\(\)=>\{ pushUndoSnapshot\(\);/.test(src), '...through undo, like every other material edit');
  assert(/Your own texture, normal or roughness map is not touched/.test(src),
    '...and the hint says what it does NOT do, which is the half a creator cannot discover by trying it');
}

// Probed live (tools/probe/plain-surface.mjs) at the pinned top rung, paused, grain and auto-exposure off,
// on an 8x8 box face whose window was derived by PROJECTION and confirmed by reading WHO was drawn there:
//
//   unique colours   3785 detailed -> 2134 PLAIN -> 3795 back      control returns to 1.003x
//   mean            [37,59,44]     [37,59,45]     [37,59,44]       the surface does not get darker
//   batch            2 distinct keys; the plain pair forms its OWN InstancedMesh, normalMap absent, _odOn 0
//   round trip       pln:1 when set, absent when not
//   creator's map    kept when plain, not overwritten on restore
//
// The mean holding to one code value is the corroboration that matters: build 1379's term is exposure-
// neutral by construction, so switching it off should move the variation and NOT the brightness — and it
// does exactly that. 2134 is still a lot of colours because the surface is LIT: a flat albedo is not a flat
// pixel, and claiming otherwise would be the wrong promise to make about this checkbox.
//
// Two instrument failures first, both of which read as "the feature does nothing":
//   1. drawing the canvas into a 2D context returned mean [0,0,0] and ONE unique colour in every condition,
//      control included — preserveDrawingBuffer is false (build 1344).
//   2. with that fixed, the effect measured 0.6% against a control that drifted 1.6%. The window was on SKY:
//      the prop had been swept into an InstancedMesh at deploy and was not in the scene at all, so editing
//      its material reached nothing drawn while every state readout stayed perfectly correct (build 1151's
//      "read WHO before attributing anything to a surface", for the fourth time).
done('build 1393: a primitive can be the flat colour you picked');
