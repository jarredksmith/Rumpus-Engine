// build 1366: zeroed and out-of-range point/spot lights skip RE_Direct — the fade finally saves the BRDF.
//
// The performance critic's #1: updateLightBudget dims lights that still cost a full BRDF — r149's
// lights_fragment_begin calls RE_Direct UNGUARDED for every point and spot light, so all 29 of the stock
// level's point lights ran BRDF_GGX per fragment even when 13 of them were faded to intensity 0.
// getPointLightInfo/getSpotLightInfo already compute directLight.visible (verified below against the REAL
// vendored r149, not the critic's word); it was only ever read on the shadow lines. Build 1366 patches the
// chunk once at boot, wrapping each of the two RE_Direct calls in `if ( directLight.visible )`.
//
// This test (a) proves the needles exist in stock r149 and that visible is computed where claimed,
// (b) runs the ENGINE's patch function over the real chunk text and asserts both calls end up guarded
// while the directional one stays bare, (c) proves idempotence and the refuse-on-missing-needle path,
// (d) pins the boot order (patch before the 1181 ShaderLib walk, i.e. before any program compiles), and
// (e) proves the patched text still unrolls under the REAL WebGLProgram unrollLoopPattern — an inner
// brace pair breaking the lazy unroll match would silently kill every lit material. Plus a pin that
// updateLightBudget's fade semantics are untouched.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const src = gameSource();

const INFO_P = 'getPointLightInfo( pointLight, geometry, directLight );';
const INFO_S = 'getSpotLightInfo( spotLight, geometry, directLight );';
const INFO_D = 'getDirectionalLightInfo( directionalLight, geometry, directLight );';
const CALL = 'RE_Direct( directLight, geometry, material, reflectedLight );';
const PRE = 'if ( directLight.visible ) { ';
const GUARD = PRE + CALL + ' }';
const cnt = (s, sub) => s.split(sub).length - 1;

// ---------------------------------------------------------------- (a) the premises, against the REAL r149
const chunk = THREE.ShaderChunk.lights_fragment_begin;
{
  assert(chunk.includes(INFO_P), 'the point-loop needle is verbatim in stock r149');
  assert(chunk.includes(INFO_S), 'the spot-loop needle is verbatim in stock r149');
  assert(chunk.includes(INFO_D), 'the directional-loop anchor (1185\'s needle) is verbatim in stock r149');
  eq(cnt(chunk, CALL), 3, 'stock r149 has exactly three RE_Direct( directLight, ... ) calls — point, spot, directional');
  assert(!chunk.includes('if ( directLight.visible )'),
    'stock r149 never guards RE_Direct on visible — the fade paid a full BRDF, which is the defect');
  const pars = THREE.ShaderChunk.lights_pars_begin;
  eq(cnt(pars, 'light.visible = ( light.color != vec3( 0.0 ) );'), 2,
    'getPointLightInfo AND getSpotLightInfo compute visible from the attenuated colour — a zeroed or out-of-range light reads false');
  assert(pars.includes('light.visible = false;'), 'a spot fragment outside the cone is explicitly invisible');
  const di = pars.indexOf('getDirectionalLightInfo');
  const dirFn = pars.slice(di, pars.indexOf('#endif', di));
  assert(dirFn.includes('light.visible = true;'),
    'getDirectionalLightInfo sets visible UNCONDITIONALLY true — which is why the directional loop is deliberately not guarded');
}

// ---------------------------------------------------------------- (b) the engine's patch, on the real text
const fn = new Function('return ' + extractFunction('_lgbGuardVisible', src) + ';')();
const r = fn(chunk);
{
  eq(r.n, 2, 'both needles landed against the REAL vendored three text');
  eq(cnt(r.txt, GUARD), 2, 'exactly two RE_Direct calls are wrapped in if ( directLight.visible ) { ... }');
  eq(cnt(r.txt, CALL), 3, 'still exactly three RE_Direct calls — nothing duplicated, nothing lost');
  const pi = r.txt.indexOf(INFO_P), si = r.txt.indexOf(INFO_S), di = r.txt.indexOf(INFO_D);
  const g1 = r.txt.indexOf(GUARD), g2 = r.txt.indexOf(GUARD, g1 + 1);
  assert(pi < g1 && g1 < si, 'the first guard is inside the POINT loop (between the point and spot info calls)');
  assert(si < g2 && g2 < di, 'the second guard is inside the SPOT loop (between the spot and directional info calls)');
  const dRE = r.txt.indexOf(CALL, di);
  assert(dRE > 0, 'the directional RE_Direct survives');
  assert(r.txt.slice(dRE - PRE.length, dRE) !== PRE,
    'the DIRECTIONAL RE_Direct stays bare — visible is always true there, and 1185\'s cascade pick blackens its colour on purpose');
  eq(cnt(r.txt, '{'), cnt(chunk, '{') + 2, 'exactly two opening braces added');
  eq(cnt(r.txt, '}'), cnt(chunk, '}') + 2, 'exactly two closing braces added — GLSL stays balanced');
}

// ---------------------------------------------------------------- (c) idempotent, and refuses on a miss
{
  const r2 = fn(r.txt);
  eq(r2.n, 2, 'a second application still reports both landings');
  assert(r2.txt === r.txt, '...and is byte-identical — idempotent, a double apply can never double-wrap');
  const miss = fn('no such chunk text');
  eq(miss.n, 0, 'a chunk with no needles reports zero landings');
  eq(miss.txt, 'no such chunk text', '...and is returned untouched');
  // the ENGINE only installs the result on exactly two landings; anything else warns and leaves the chunk
  assert(src.includes('if(_lgbR.n === 2) THREE.ShaderChunk.lights_fragment_begin = _lgbR.txt;'),
    'the chunk assignment is gated on BOTH needles landing');
  assert(src.includes('left UNTOUCHED'),
    'a missed needle warns loudly instead of shipping a half-guarded loop — the 1181/1183 silently-missed-replace rule');
  eq(cnt(src, '_lgbGuardVisible'), 2,
    'one definition + one call site — a second, ungated application path is the only way a double wrap comes back');
}

// ---------------------------------------------------------------- (d) boot order
{
  const applyAt = src.indexOf('_lgbGuardVisible(_lgbChunk0)');
  const walkAt = src.indexOf('for(const _slk in THREE.ShaderLib)');
  assert(applyAt > 0 && walkAt > 0 && applyAt < walkAt,
    'the guard patch runs before the 1181 fog ShaderLib walk — boot order, ahead of every program compile');
  const cascadeAt = src.indexOf("'getDirectionalLightInfo( directionalLight, geometry, directLight );'");
  assert(cascadeAt > applyAt,
    '1185\'s cascade edit applies AFTER, on top of the guarded text — its needle (the directional info call) is untouched by this patch');
}

// ---------------------------------------------------------------- (e) the REAL unroller still unrolls it
// Three's unrollLoopPattern ends its lazy body match on `}` + whitespace + `#pragma unroll_loop_end`.
// An added brace pair inside the loop body is safe ONLY because the inner `}` is not followed by the end
// pragma — this section proves that against the real pattern rather than asserting it, because if a three
// upgrade tightens the regex the loops silently stop unrolling and every lit material fails to compile.
{
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const wp = fs.readFileSync(path.join(dir, 'node_modules', 'three', 'src', 'renderers', 'webgl', 'WebGLProgram.js'), 'utf8');
  const m = wp.match(/const unrollLoopPattern = (\/[^\n]+\/g);/);
  assert(m, 'the unroll pattern is findable in the real WebGLProgram source');
  const unrollPattern = new Function('return ' + m[1] + ';')();
  // replaceLightNums substitutes the defines BEFORE unrollLoops runs — mimic with a 2-point/1-spot/1-dir scene
  let sub = r.txt;
  for (const [k, v] of [
    ['NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS', 0], ['NUM_SPOT_LIGHT_SHADOWS', 0], ['NUM_SPOT_LIGHT_MAPS', 0],
    ['NUM_SPOT_LIGHTS', 1], ['NUM_POINT_LIGHT_SHADOWS', 0], ['NUM_POINT_LIGHTS', 2],
    ['NUM_DIR_LIGHT_SHADOWS', 0], ['NUM_DIR_LIGHTS', 1], ['NUM_RECT_AREA_LIGHTS', 0], ['NUM_HEMI_LIGHTS', 0],
  ]) sub = sub.split(k).join(String(v));
  // three's loopReplacer, mimicked (the load-bearing part — the PATTERN — is lifted from the real build)
  const unrolled = sub.replace(unrollPattern, (mm, start, end, snippet) => {
    let out = '';
    for (let i = parseInt(start); i < parseInt(end); i++)
      out += snippet.replace(/\[\s*i\s*\]/g, '[ ' + i + ' ]').replace(/UNROLLED_LOOP_INDEX/g, i);
    return out;
  });
  assert(!unrolled.includes('unroll_loop_start'),
    'every loop matched the real unroller despite the added braces — the lazy match still ends on the loop\'s own closing brace');
  eq(cnt(unrolled, 'if ( directLight.visible ) {'), 3, 'unrolled: 2 point guards + 1 spot guard');
  assert(unrolled.includes('pointLights[ 1 ]'), 'the second point light unrolled with its own index');
}

// ---------------------------------------------------------------- (f) updateLightBudget is untouched
{
  const ulb = extractFunction('updateLightBudget', src);
  assert(ulb.includes('e.light.intensity = e.baseIntensity'), 'under budget every emitter keeps its base intensity');
  assert(ulb.includes('const FADE = 5'), 'the 5-rank easing band is unchanged');
  assert(ulb.includes('1 - over/FADE'), 'the fade curve is unchanged');
  assert(ulb.includes('.baseIntensity * f'),
    'the write is still base x factor — the fade SEMANTICS are untouched; what changed is that a zeroed light now also skips its BRDF');
  // and the patch block touches none of the recompile levers
  const block = src.slice(src.indexOf('function _lgbGuardVisible'), src.indexOf('for(const _slk in THREE.ShaderLib)'));
  assert(!/\.castShadow/.test(block) && !/\.visible\s*=/.test(block),
    'the patch never writes castShadow or .visible — the 977/1348 recompile traps stay closed');
}

done('build 1366: zeroed and out-of-range point/spot lights skip RE_Direct — the light-budget fade finally saves the BRDF');
