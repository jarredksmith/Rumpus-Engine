import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1286: the rendering audit's second CRITICAL, half of it. The per-vertex sky-visibility bake wrote
// into the `color` attribute and set vertexColors=true — so `diffuseColor.rgb *= vColor` ran BEFORE any
// lighting and the occlusion term attenuated DIRECT SUNLIGHT as well as indirect.
//
// Wrong three times over: the shadow map already answers direct occlusion, SSAO applies a contact term
// again at composite, and a vertex at 50% sky visibility additionally lost 32% of its direct sun.

// --- the premise, against the REAL three build ------------------------------------------------------
const FS = THREE.ShaderLib.physical.fragmentShader;
{
  const c = FS.indexOf('#include <color_fragment>');
  const lb = FS.indexOf('#include <lights_fragment_begin>');
  const ao = FS.indexOf('#include <aomap_fragment>');
  const le = FS.indexOf('#include <lights_fragment_end>');
  assert(c >= 0 && lb >= 0 && ao >= 0 && le >= 0, 'all four chunks are present in r' + THREE.REVISION);
  assert(c < lb, 'THE BUG: color_fragment runs BEFORE lighting, so vColor multiplied albedo');
  assert(/diffuseColor\.rgb \*= vColor/.test(THREE.ShaderChunk.color_fragment),
    '...and what it does is multiply the albedo');
  assert(le < ao, 'aomap_fragment runs AFTER all lighting');
  assert(/reflectedLight\.indirectDiffuse \*= ambientOcclusion/.test(THREE.ShaderChunk.aomap_fragment),
    '...and touches only the INDIRECT terms — which is the semantics occlusion actually has');
  // NB: "indirectDiffuse" contains "directDiffuse" as a substring — match the full property path
  assert(!/reflectedLight\.directDiffuse/.test(THREE.ShaderChunk.aomap_fragment),
    '...never the direct ones, which is the whole point');
}

// --- the patch, applied to the real shader source ----------------------------------------------------
// the WeakSet guard lives beside the function; the rig declares it the same way the engine does
const patch = new Function([
  'const _bakeOccPatched = new WeakSet();',
  extractFunction('_bakeOccludeIndirect'),
  'return { fn:_bakeOccludeIndirect, seen:_bakeOccPatched };',
].join('\n'))();
function compile(mat) {
  const sh = { fragmentShader: FS, vertexShader: THREE.ShaderLib.physical.vertexShader };
  mat.onBeforeCompile(sh, null);
  return sh.fragmentShader;
}
{
  const m = {};
  patch.fn(m);
  const out = compile(m);
  // BOTH replaces must actually land — a replace that silently misses is how this file has lost a
  // subsystem before, and it fails as a plausible-looking frame rather than an error.
  assert(!out.includes('#include <color_fragment>'), 'the albedo multiply is removed');
  assert(out.includes('build 1286: vColor is the sky-visibility BAKE'), '...and says why, in the shader');
  assert(out.includes('#include <aomap_fragment>'), 'aomap_fragment is kept, not replaced');
  assert(/reflectedLight\.indirectDiffuse \*= vColor;/.test(out), 'the bake now multiplies indirect diffuse');
  assert(/reflectedLight\.indirectSpecular \*= vColor;/.test(out), '...and indirect specular');
  assert(!/reflectedLight\.directDiffuse \*= vColor/.test(out), '...and NOTHING direct');
  // ordering: the new lines must come after the lighting, or they multiply a value not yet computed
  assert(out.indexOf('reflectedLight.indirectDiffuse *= vColor') > out.indexOf('#include <lights_fragment_end>'),
    'the multiply lands after lights_fragment_end, so indirectDiffuse exists by then');
  assert(/#ifdef USE_COLOR/.test(out),
    'guarded on USE_COLOR — a material without the attribute has no vColor and would fail to compile');
}
{ // IT CHAINS. Build 1145's object detail and floorMat's paint splat both use onBeforeCompile; replacing
  // one silently removes a whole subsystem, which is a failure mode this file has already paid for twice.
  let ranPrev = 0;
  const m = { onBeforeCompile: (sh) => { ranPrev++; sh.fragmentShader = '/*PREV*/' + sh.fragmentShader; } };
  patch.fn(m);
  const out = compile(m);
  eq(ranPrev, 1, 'the pre-existing hook still runs');
  assert(out.startsWith('/*PREV*/'), '...and its edit survives');
  assert(/reflectedLight\.indirectDiffuse \*= vColor;/.test(out), '...alongside ours');
}
{ // applied ONCE per material, or the replace would stack
  const m = {};
  patch.fn(m); const first = m.onBeforeCompile;
  patch.fn(m); patch.fn(m);
  assert(m.onBeforeCompile === first, 're-patching the same material is a no-op');
  const out = compile(m);
  eq((out.match(/reflectedLight\.indirectDiffuse \*= vColor;/g) || []).length, 1, '...so the multiply appears once');
}
{ // the program cache key composes rather than clobbering
  const m = {};
  patch.fn(m);
  assert(/^bakeOcc\|/.test(m.customProgramCacheKey()), 'the key marks the patch');
  const m2 = { customProgramCacheKey: () => 'objDetail' };
  patch.fn(m2);
  eq(m2.customProgramCacheKey(), 'bakeOcc|objDetail',
    '...and keeps an existing key, so a material carrying both patches is still one program per combination');
}
{ // nothing throws on a missing or odd material
  patch.fn(null); patch.fn(undefined);
  const m = {}; patch.fn(m);
  const bad = { onBeforeCompile: () => { throw new Error('boom'); } };
  patch.fn(bad);
  const sh = { fragmentShader: FS };
  bad.onBeforeCompile(sh, null);
  assert(/reflectedLight\.indirectDiffuse \*= vColor;/.test(sh.fragmentShader),
    'a throwing pre-existing hook does not stop our patch — the bake must not depend on someone else’s code');
}

// --- wiring ------------------------------------------------------------------------------------------
{
  assert(/m\.vertexColors = true; _bakeOccludeIndirect\(m\); m\.needsUpdate = true;/.test(src),
    'every material the bake touches is patched at the moment vertexColors is enabled');
  assert(/Occlusion is an INDIRECT-ONLY term/.test(src), 'the reasoning is recorded beside the fix');
  assert(/needs a uv2 an arbitrary\n\/\/ GLB does not have/.test(src),
    '...including why aoMap itself could not be used, which is the question the next reader will have');
}

done('build 1286: the sky-visibility bake is occlusion rather than albedo — verified against the real r149 shader that color_fragment precedes lighting (so it was attenuating direct sunlight on top of the shadow map and SSAO), the term now rides where three puts its own aoMap, after all lighting and on the indirect reflections only; both replaces are proven to land, the hook chains rather than clobbering build 1145\'s, and the cache key composes');
