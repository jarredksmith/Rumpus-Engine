import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1257: the audit's #1 PERFORMANCE ceiling, made visible and bounded. updateLightBudget fades
// intensity past the nearest 16/8, but the engine's own count rule (636/977/1153/1155) keeps every
// light in the scene — and r149's forward renderer has no clustering, so NUM_POINT_LIGHTS = every
// light present and each one is looped in every fragment of every material, dimmed or not. The
// census makes that cost visible (Level Check + perf HUD); the deploy cap bounds it.

// --- the census, executed over a stub scene -----------------------------------------------------------
function censusRig(lights, emitters = []) {
  const scene = { traverseVisible(fn){ for(const l of lights) fn(l); } };
  return new Function('scene', 'emitterLights',
    extractFunction('_lightCensus') + extractFunction('_lightLoad') +
    '; return { c:_lightCensus(), load:(x)=>_lightLoad(x) };')(scene, emitters);
}
const P = (n = 1, shadow = false) => Array.from({ length: n }, () => ({ isLight:true, isPointLight:true, castShadow:shadow }));
const S = (n = 1, shadow = false) => Array.from({ length: n }, () => ({ isLight:true, isSpotLight:true, castShadow:shadow }));
const D = (n = 1) => Array.from({ length: n }, () => ({ isLight:true, isDirectionalLight:true, castShadow:true }));
const H = (n = 1) => Array.from({ length: n }, () => ({ isLight:true, isHemisphereLight:true, castShadow:false }));
{
  const r = censusRig([...P(30), ...S(4, true), ...D(2), ...H(1), { isMesh:true }], [{}, {}, {}]);
  eq(r.c.point, 30, 'point lights counted');
  eq(r.c.spot, 4, 'spot lights counted');
  eq(r.c.dir, 2, 'directional counted separately');
  eq(r.c.hemi, 1, 'hemisphere counted separately');
  eq(r.c.total, 37, 'the total covers every light and nothing else (the mesh is skipped)');
  eq(r.c.shadow, 6, 'shadow casters counted across types');
  eq(r.c.emitters, 3, 'and the emitter registry is reported');
  eq(r.load(r.c), 34, 'the LOAD is point+spot only — the per-pixel loop, not the fixed sun/sky pair');
}
{ // an empty scene must not report noise, and a broken scene must not throw
  const r = censusRig([]);
  eq(r.c.total, 0); eq(r.load(r.c), 0, 'an empty scene reads zero');
  const bad = new Function('scene', 'emitterLights',
    extractFunction('_lightCensus') + '; return _lightCensus();')({ traverseVisible(){ throw new Error('boom'); } }, []);
  eq(bad.total, 0, 'a scene that throws mid-walk degrades to zero rather than breaking the panel');
}

// --- the deploy cap, executed ---------------------------------------------------------------------------
function capRig(n, coarse = false) {
  const removed = [];
  const list = Array.from({ length: n }, (_, i) => ({ light:{ intensity:5, parent:{ remove:(l)=>removed.push(l) }, id:i } }));
  const fn = new Function('emitterLights', 'IS_COARSE', 'console', 'list', 'removed',
    `let _emitterRefused = 0;
     ${extractFunction('_emitterCap')}
     ${extractFunction('enforceEmitterCap')}
     return { run:enforceEmitterCap, cap:_emitterCap(), refused:()=>_emitterRefused };`)(list, coarse, { warn(){} }, list, removed);
  return { ...fn, list, removed };
}
{
  const r = capRig(60);
  eq(r.cap, 48, 'desktop budget');
  eq(r.run(), 12, 'the surplus past the cap is refused');
  eq(r.list.length, 48, 'the registry lands exactly on the cap');
  eq(r.removed.length, 12, 'and each refused light leaves the SCENE GRAPH — hiding one would still be counted (build 977)');
  assert(r.list.every(e => e.light.intensity === 5), 'the lights that stayed are untouched');
  eq(r.refused(), 12, 'the count is remembered for the Level Check report');
}
{
  const r = capRig(60, true);
  eq(r.cap, 24, 'phones get a tighter budget');
  eq(r.run(), 36, 'and more is refused there');
}
{ // under the cap: a complete no-op, so ordinary levels are byte-identical
  const r = capRig(10);
  eq(r.run(), 0, 'nothing refused');
  eq(r.list.length, 10, 'nothing removed');
  eq(r.refused(), 0, 'and nothing reported');
  const empty = capRig(0);
  eq(empty.run(), 0, 'an empty registry is safe');
}

// --- wiring pins ------------------------------------------------------------------------------------------
assert(/if\(typeof enforceEmitterCap==='function'\) enforceEmitterCap\(\); warmFlipbookShaders\(\);/.test(src),
  'the cap runs at DEPLOY, before the shaders compile against the count — never mid-match (the recompile rule)');
{
  const li = extractFunction('levelIssues');
  assert(/Heavy lighting: '\+load\+' point\/spot lights/.test(li), 'Level Check reports the real number');
  assert(/there is no clustering/.test(li), '...and says WHY it costs (the fact a creator cannot discover)');
  assert(/turn "Light emitter" off on decorative props/.test(li), '...and what to do about it');
  assert(/_emitterRefused\+' emissive prop light/.test(li), 'refused lights are reported, not silent');
  assert(/those props still glow, they just do not cast light/.test(li), '...with the consequence stated honestly');
  assert(/c\.shadow > 4/.test(li), 'and shadow-casting lights get their own warning (each is an extra render)');
}
assert(/lights '\+\(\(typeof _lightCensus==='function'\)\?_lightLoad\(_lightCensus\(\)\):'\?'\)/.test(src),
  'the perf HUD shows the light load beside draws and triangles');
assert(/const LIGHT_SOFT_CAP = 40;/.test(src), 'the warning threshold is a named constant');

done('build 1257: the light census — counted by type over a stub scene (load = point+spot, throw-safe), the deploy cap executed on both budgets and proven a no-op under it, and every reporting surface pinned');
