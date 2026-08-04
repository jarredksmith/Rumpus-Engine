// build 1381: the PCSS chunk patches are VERIFIED TO LAND, all-or-nothing.
//
// Build 1380 shipped three `.replace` calls unguarded, and its test checked their anchors against PRISTINE
// three. By the time they run, `lights_fragment_begin` has already been rewritten TWICE — build 1364's
// visible-guard and build 1185's cascade select — so the test could pass while the engine's own replace
// missed. A missed replace here is silent in the worst way: every material compiles, the frame renders,
// and contact-hardening shadows simply never happen.
//
// HALF is worse than none, which is why the two chunks are committed together:
//   * function lands, call site misses  -> PCSS is dead code (silent)
//   * call site lands, function misses  -> `getShadowPCSS` is UNDEFINED and EVERY LIT MATERIAL IN THE
//                                          ENGINE fails to compile (a black scene)
//
// This is build 1364's own precedent applied to the build sitting directly beneath it.
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');

// ------------------------------------------------------------- one needle, not two ----
// A guard that checks a different string from the one the replace uses is not a guard.
const decl = src.match(/const _PCSS_CALL = '([^']+)';/);
assert(decl, 'the directional call site is named once, as _PCSS_CALL');
const CALL = decl[1];
eq(T.ShaderChunk.lights_fragment_begin.split(CALL).length - 1, 1,
  'and that exact string occurs exactly once in three ' + T.REVISION + "'s own chunk");
assert(/for\(const \[txt, needle\] of _need\)/.test(src), 'the guard walks the needles rather than restating them');
assert(/_need = \[\[_s0, '#ifdef USE_SHADOWMAP'\], \[_s0, '\\tvec2 cubeToUV'\], \[_l0, _PCSS_CALL\]\]/.test(src),
  'all THREE anchors are checked, and the call-site one is the named constant');
eq((src.match(/_PCSS_CALL/g) || []).length, 5,
  'declared once, checked once, and used three times by the replace (the needle plus both ternary ' +
  'branches) — never retyped, which is what stops the guard and the replace drifting apart');

// ------------------------------------------------------------------ all or nothing ----
{
  assert(/let _pcssOk = true;/.test(src), 'a single flag carries the verdict');
  assert(/_pcssOk = false;/.test(src), '...set when any anchor is missing');
  const i = src.indexOf('if(_pcssOk){');
  assert(i > 0, 'both chunk patches sit inside one gate');
  const gated = src.slice(i, src.indexOf('THREE.UniformsLib.lights.pcssP'));
  assert(/ShaderChunk\.shadowmap_pars_fragment =/.test(gated), '...the function patch is inside it');
  assert(/ShaderChunk\.lights_fragment_begin =/.test(gated), '...and so is the call-site patch');
  assert(src.indexOf('_pcssOk = false;') < i, 'the verdict is reached BEFORE the gate reads it');
  // and the runtime must not switch it on when the shader cannot answer
  assert(/const _on = _pcssOk &&/.test(src),
    'the shadow fit refuses to derive a scale when the patch did not land — otherwise pcssP.x would be ' +
    'non-zero for a shader that has no getShadowPCSS in it');
}

// ------------------------------------------------------- executed: the guard, both ways ----
{
  const guard = (s0, l0, call) => {
    const need = [[s0, '#ifdef USE_SHADOWMAP'], [s0, '\tvec2 cubeToUV'], [l0, call]];
    let miss = 0;
    for(const [txt, needle] of need) if(typeof txt !== 'string' || txt.split(needle).length - 1 !== 1) miss++;
    return miss;
  };
  eq(guard(T.ShaderChunk.shadowmap_pars_fragment, T.ShaderChunk.lights_fragment_begin, CALL), 0,
    'against the real three build, every anchor is present exactly once');
  eq(guard('nothing here', T.ShaderChunk.lights_fragment_begin, CALL), 2, 'a renamed shadow chunk is caught');
  eq(guard(T.ShaderChunk.shadowmap_pars_fragment, 'nothing here', CALL), 1, 'a moved call site is caught');
  eq(guard(T.ShaderChunk.shadowmap_pars_fragment, T.ShaderChunk.lights_fragment_begin + CALL, CALL), 1,
    'and so is an anchor that has become AMBIGUOUS — two matches would patch both and is not "landed"');
  eq(guard(null, undefined, CALL), 3, 'a stubbed THREE (the boot harness) refuses rather than throwing');
}

// ------------------------------------------- executed: the generated call is valid GLSL ----
// This is not hypothetical. The first draft sliced 10 characters instead of 9, which emitted
// `getShadowPCSS directionalShadowMap[ i ], ...` — a GLSL syntax error, on a chunk included by every lit
// material in the engine. It was caught by PRINTING the generated string rather than assuming it.
{
  const m = src.match(/'\( UNROLLED_LOOP_INDEX == 0 \? getShadowPCSS' \+ _PCSS_CALL\.slice\((\d+)\)/);
  assert(m, 'the PCSS call is built from the same constant');
  const n = +m[1];
  eq(n, 'getShadow'.length, "the slice keeps the '(' — one more drops it and the result is not a call at all");
  const out = '( UNROLLED_LOOP_INDEX == 0 ? getShadowPCSS' + CALL.slice(n) + ' : ' + CALL + ' )';
  assert(/getShadowPCSS\( directionalShadowMap/.test(out), 'the PCSS branch is a well-formed call');
  assert(/: getShadow\( directionalShadowMap/.test(out), '...and the fallback branch still is');
  // balanced parens is the cheapest proof that this compiles at all
  let d = 0; for(const ch of out){ if(ch === '(') d++; else if(ch === ')') d--; assert(d >= 0, 'parens never go negative'); }
  eq(d, 0, 'and the whole expression is balanced');
  eq(out.split('getShadowPCSS').length - 1, 1, 'exactly one PCSS call, exactly one fallback');
  eq(out.split('getShadow(').length - 1, 1, '...so the ternary cannot recurse into itself');
}

// the failure is LOUD, because a silent one is what this build exists to remove
assert(/console\.warn\('\[RUMPUS\] PCSS patch: '/.test(src), 'a missing anchor warns by name');
assert(/did a three upgrade move getShadow/.test(src), '...and says what to look for');

done('build 1381: the shadow chunk patches land, or nothing is patched and it says so');
