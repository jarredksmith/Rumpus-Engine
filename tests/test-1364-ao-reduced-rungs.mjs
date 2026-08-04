// build 1364: reduced-cost AO on rungs 1-2 instead of shedding it on the first downshift.
//
// Rendering critic #3: SSAO measured as 100% of the frame's contact darkening at four wall feet
// (AO on = 13-15% darker at the foot, AO shed = 2-4% BRIGHTER) — and the adaptive ladder shed it on
// the FIRST downshift while bloom, god rays, fog and the grade all survive to lower rungs. The median
// player sits on rung 1 (85% resolution), so the one cue that seats objects on the floor was off for
// most players. Now the AO sample rides the same rungs as its G-buffer (0-2), at a uniform-bound tap
// count: 12 taps on rung 0 (today's exact look) and 6 on rungs 1-2 — a dynamic break bound inside the
// compile-time loop, so a rung change is a uniform write, never a recompile (the 636/977/1153 freeze
// class by another door).
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
const fx = extractFunction('_renderPostFX');

// --------------------------------------------- 1. the gates, executed from the REAL source lines
{
  const geoLine = fx.match(/const _geoWant = ([^;]+);/);
  const aoLine  = fx.match(/const _aoWant = ([^;]+);/);
  const ssrLine = fx.match(/const _ssrWant = ([^;]+);/);
  assert(geoLine && aoLine && ssrLine, 'all three gates exist in the post pipeline');
  const gates = new Function('_ssaoAmt','_postSSR','_prStepI','_AO_GEO_MAXSTEP','_aoGeoRT','cam','_ssrRT','_matSSR',
    `const _geoWant = ${geoLine[1]}; const _aoWant = ${aoLine[1]}; const _ssrWant = ${ssrLine[1]};
     return {geo:!!_geoWant, ao:!!_aoWant, ssr:!!_ssrWant};`);
  const CAM = { isPerspectiveCamera: true }, RT = {}, MAT = {};
  const at = (step) => gates(0.9, 0.35, step, 2, RT, CAM, RT, MAT);
  let g = at(0);
  assert(g.geo && g.ao && g.ssr, 'rung 0: prepass, AO sample and SSR all run — the full-quality frame');
  g = at(1);
  assert(g.geo && g.ao, 'rung 1 (85% — the median player): the AO sample now SURVIVES the first downshift');
  assert(!g.ssr, 'rung 1: SSR still sheds — its rung-0 gate is deliberately unchanged');
  g = at(2);
  assert(g.geo && g.ao && !g.ssr, 'rung 2 (72%): AO still lives wherever the G-buffer lives');
  g = at(3);
  assert(!g.geo && !g.ao && !g.ssr, 'rung 3: the sample dies WITH the G-buffer — no pass outlives its input');
  // the _ssaoAmt term in _aoWant is load-bearing: _geoWant can be true from SSR alone
  g = gates(0, 0.35, 1, 2, RT, CAM, RT, MAT);
  assert(g.geo && !g.ao, 'an SSR-only level on rung 1: the prepass runs for SSR but AO stays off (its own amount term)');
  g = gates(0, 0, 0, 2, RT, CAM, RT, MAT);
  assert(!g.geo && !g.ao && !g.ssr, 'both authored off: nothing runs');
  // the soft-particle feed is untouched by this build
  assert(/_SOFT_P\.value\.x = _geoWant \? 1 : 0;/.test(fx),
    'soft particles still ride the PREPASS gate, not the AO sample');
  assert(/const _ssrWant = _geoWant && _postSSR > 0\.001 && _prStepI === 0 && _ssrRT && _matSSR;/.test(fx),
    'the SSR gate is byte-identical — this build touched only the AO sample');
}

// --------------------------------------------- 2. the tap count: a uniform, executed
{
  eq(+extractConst('_AO_TAPS_LITE'), 6, 'the reduced tap count is 6');
  const m = fx.match(/au\.uSamples\.value = ([^;]+);/);
  assert(m, 'the AO pass sets uSamples per frame beside its other uniforms');
  const pick = new Function('_prStepI', '_AO_TAPS_LITE', 'return ' + m[1] + ';');
  eq(pick(0, 6), 12, 'rung 0 sets 12 taps — today\'s exact look, unchanged');
  eq(pick(1, 6), 6, 'rung 1 sets 6');
  eq(pick(2, 6), 6, 'rung 2 sets 6');
  // and it is written INSIDE the _aoWant block, before the kernel pass renders with it
  const aoBlock = fx.indexOf('if(_aoWant){');
  const setAt = fx.indexOf('au.uSamples.value');
  const kernel = fx.indexOf('_postQuad.material=_matAO;');
  assert(aoBlock >= 0 && setAt > aoBlock && kernel > setAt,
    'uSamples is written inside the AO block, before the kernel renders');
}

// --------------------------------------------- 3. the shader: a dynamic bound inside the FIXED loop
{
  const ep = extractFunction('ensurePost');
  assert(ep.includes("'uniform mat4 uProj; uniform vec3 uKern[12]; uniform int uSamples;',"),
    'uSamples is declared an int uniform beside the 12-wide kernel');
  const loop = ep.indexOf("'  for(int i=0;i<12;i++){',");
  const brk  = ep.indexOf("'    if(i>=uSamples) break;',");
  const tap  = ep.indexOf("'    vec3 k = uKern[i];',");
  assert(loop >= 0, 'the compile-time loop bound is UNCHANGED at 12 — the tap count is data, not a program variant');
  assert(brk > loop && tap > brk, 'the dynamic break sits FIRST in the loop body, before any tap work');
  assert(ep.includes('uSamples:{value:12}'), 'the uniform defaults to the full 12');
  // normalisation follows the LIVE count — dividing by the compile-time 12 would silently halve
  // the AO strength at 6 taps, which would read as "the setting got weaker on my machine"
  assert(ep.includes('clamp(1.0 - occ/float(uSamples), 0.0, 1.0)'),
    'occlusion normalises by the live tap count (identical to occ/12.0 at rung 0)');
  assert(!ep.includes('occ/12.0'), 'the fixed normaliser is gone — 6 taps must not mean half-strength AO');
}

// --------------------------------------------- 4. the kernel front-loads the near field, executed
// The reduced mode takes the FIRST 6 taps of the fixed kernel. The kernel packs w = 0.25 + 0.75*t^2
// with t growing over i, so the first half is the NEAR half — exactly the contact-darkening term the
// reduced mode exists to keep. Executed against the real kernel IIFE so a reordering fails here.
{
  const kSrc = src.match(/const _AO_KERNEL = \(\(\)=>\{[\s\S]*?return k; \}\)\(\);/);
  assert(kSrc, 'the kernel IIFE is where it was');
  const V3 = function (x, y, z) { this.x = x; this.y = y; this.z = z; };
  const kern = new Function('THREE', 'return ' + kSrc[0].replace(/^const _AO_KERNEL = /, '').replace(/;$/, ''))({ Vector3: V3 });
  eq(kern.length, 12, 'the kernel still carries 12 taps');
  const len = (v) => Math.hypot(v.x, v.y, v.z);
  const near6 = kern.slice(0, 6).reduce((s, v) => s + len(v), 0) / 6;
  const far6  = kern.slice(6).reduce((s, v) => s + len(v), 0) / 6;
  assert(near6 < far6, 'the first 6 taps are the NEAR half of the kernel — the reduced mode keeps the contact field');
}

done('build 1364: the AO sample rides the G-buffer rungs (0-2) instead of shedding on the first downshift — gates executed from the real source lines across every rung (AO survives rungs 1-2, dies with the prepass on rung 3, SSR and soft particles untouched, the SSR-only case still runs no AO), the tap count is a uniform bound (12 on rung 0 for today\'s exact look, 6 below, set inside the AO block before the kernel renders), the shader keeps its compile-time bound of 12 with a leading dynamic break and normalises by the live count, and the fixed kernel provably front-loads its near taps so the 6-tap mode keeps the contact term');
