import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1292: the bloom prefilter thresholds the luminance of `_postRT`, which holds the scene AFTER three
// has applied `toneMappingExposure` and the ACES fit. Build 1180 then made that exposure MOVE at runtime by
// up to 1.5 stops. So the fixed threshold was not selecting highlights — it was selecting "whatever the eye
// has currently adapted to", and the amount of the frame that blooms breathed with the adaptation.
//
// Measured live, ONE pose, one level, exposure the only variable:
//   exposure     1.00    1.25    1.60    1.90
//   % blooming   0.02%   5.48%  20.23%  43.13%     <- fixed 0.62
//   % blooming   5.53%   5.49%   5.44%   5.43%     <- derived, this build
// A 2000x swing becomes flat to a tenth of a percentage point, and at the authored exposure the threshold
// is EXACTLY the authored number, so nothing is retuned and nothing needs migrating.

// ---------------------------------------------------------------- the fit is three's own, verified
{
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  assert(/RRTAndODTFit/.test(chunk), 'r' + THREE.REVISION + ' still has the fit this mirrors');
  // every constant in the JS copy must appear in the real GLSL — a three upgrade that retunes the curve
  // has to fail HERE, loudly, rather than silently detuning the threshold on every adapted frame
  for (const c of ['0.0245786', '0.000090537', '0.983729', '0.4329510', '0.238081'])
    assert(chunk.includes(c), 'constant ' + c + ' matches three’s RRTAndODTFit');
  const fit = extractFunction('_acesFit');
  for (const c of ['0.0245786', '0.000090537', '0.983729', '0.4329510', '0.238081'])
    assert(fit.includes(c), '...and the JS fit uses that same ' + c);
  assert(/ACESFilmicToneMapping/.test(chunk) && /ACESInputMat/.test(chunk),
    'the full path also applies colour matrices — which this deliberately ignores');
  assert(/near luminance-preserving \(each row sums to ~1/.test(src),
    '...and the source says so, with why that is inside what a luminance threshold needs');
}

const F = new Function(extractFunction('_acesFit') + '; return _acesFit;')();
const Fi = new Function(extractFunction('_acesFitInv') + '; return _acesFitInv;')();

// ---------------------------------------------------------------- the fit, executed
{
  // spot values computed straight from the published fit
  const ref = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  for (const v of [0.05, 0.2, 0.5, 1, 1.5, 2, 4]) near(F(v), ref(v), 1e-12, 'the fit at ' + v);
  eq(F(0), 0, 'zero in, zero out');
  eq(F(-3), 0, 'a negative radiance is zero, not a negative colour');
  eq(F(1e9), 1, 'the fit saturates rather than running away');
  assert(F(1) > F(0.5) && F(2) > F(1), 'monotone, which is what makes the inverse meaningful');
}
{ // THE INVERSE ROUND-TRIPS, which is the whole basis of the derivation
  for (const v of [0.02, 0.1, 0.3, 0.6191, 1, 1.5, 2.5, 5])
    near(Fi(F(v)), v, 1e-6, 'inv(fit(' + v + ')) is ' + v);
  for (const y of [0.05, 0.2, 0.4, 0.62, 0.75, 0.9])
    near(F(Fi(y)), y, 1e-6, 'fit(inv(' + y + ')) is ' + y);
  near(Fi(0.62), 1.00272, 1e-4, 'the shipped default threshold is scene luminance ~1.0 at exposure 1');
}
{ // the inverse is bounded — the fit asymptotes at 1/0.983729 and a naive solve divides by ~0 near it
  assert(isFinite(Fi(0.98)) && Fi(0.98) > 0, 'just under the asymptote is finite');
  assert(isFinite(Fi(1)), 'AT 1 it is still finite — clamped, not divided by zero');
  assert(isFinite(Fi(5)), '...and past it');
  // the fit's numerator carries a small negative offset, so F(0) is slightly BELOW zero and the true
  // inverse of 0 is the tiny root where it crosses — correct, and the reason _bloomThreshNow short-circuits
  // the ends of the slider rather than round-tripping them.
  assert(Fi(0) >= 0 && Fi(0) < 0.01, 'zero maps to ~zero, never negative and never NaN');
  near(F(Fi(0)), 0, 1e-9, '...and it really is the root of the fit');
  eq(Fi(-1), Fi(0), 'a negative is clamped to the same place, never a NaN threshold (which would bloom everything)');
  assert(Fi(0.7) > Fi(0.6), 'monotone too');
}

// ---------------------------------------------------------------- the per-frame threshold
const mk = (postThresh, expBase, expNow) => new Function('_postThresh', '_expBase', 'renderer',
  extractFunction('_acesFit') + '\n' + extractFunction('_acesFitInv') + '\n' +
  extractFunction('_bloomThreshNow') + '; return _bloomThreshNow();')(
  postThresh, expBase, { toneMappingExposure: expNow });
{
  // AT THE AUTHORED EXPOSURE, NOTHING CHANGES. This is the compatibility argument, and it is exact.
  eq(mk(0.62, 1.25, 1.25), 0.62, 'authored exposure -> the authored threshold, identically');
  eq(mk(0.4, 2, 2), 0.4, '...whatever the values');
  eq(mk(0.62, 1.25, 1.25000001), 0.62, 'and a floating-point hair off is still the authored number');
}
{ // THE MEASURED SWEEP. These four are the values the live probe used, and the coverage it got at each
  // was 5.53 / 5.49 / 5.44 / 5.43 percent — against 0.02 / 5.49 / 20.23 / 43.13 for the fixed 0.62.
  near(mk(0.62, 1.25, 1.0), 0.5442, 5e-4, 'exposure 1.00 -> 0.5442');
  near(mk(0.62, 1.25, 1.25), 0.62, 1e-9, 'exposure 1.25 -> 0.6200 (the authored value)');
  near(mk(0.62, 1.25, 1.6), 0.6954, 5e-4, 'exposure 1.60 -> 0.6954');
  near(mk(0.62, 1.25, 1.9), 0.7415, 5e-4, 'exposure 1.90 -> 0.7415');
  // the direction matters: a brighter frame needs a HIGHER bar, or everything blooms
  assert(mk(0.62, 1.25, 1.9) > mk(0.62, 1.25, 1.25), 'adapting brighter raises the bar');
  assert(mk(0.62, 1.25, 1.0) < mk(0.62, 1.25, 1.25), 'adapting darker lowers it');
  // ...and it stays a threshold: never 0 (everything blooms) and never 1 (nothing does)
  for (const e of [0.05, 0.3, 1, 2, 5, 40]) {
    const t = mk(0.62, 1.25, e);
    assert(t > 0 && t < 1, 'exposure ' + e + ' gives a usable threshold (' + t.toFixed(4) + ')');
  }
}
{ // build 1180's own bound: the multiplier is clamped to +-1.5 stops, so the real range is ~0.35x..2.83x
  const lo = mk(0.62, 1.25, 1.25 / Math.pow(2, 1.5)), hi = mk(0.62, 1.25, 1.25 * Math.pow(2, 1.5));
  assert(lo > 0 && lo < 0.62, 'the full downward adaptation still yields a threshold below the authored one');
  assert(hi > 0.62 && hi < 1, '...and the full upward one above it, still under saturation');
}
{ // A BAD NUMBER FALLS BACK TO THE AUTHORED THRESHOLD. A bloom pass that throws is a black frame;
  // a bloom pass at the old threshold is Tuesday.
  eq(mk(0.62, 0, 1.9), 0.62, 'no authored exposure -> the authored threshold');
  eq(mk(0.62, 1.25, 0), 0.62, 'no live exposure -> the same');
  eq(mk(0.62, NaN, 1.9), 0.62, 'NaN base');
  eq(mk(0.62, 1.25, NaN), 0.62, 'NaN live');
  eq(mk(0.62, -2, 1.9), 0.62, 'a negative base');
  eq(new Function('_postThresh', '_expBase', 'renderer',
    extractFunction('_acesFit') + '\n' + extractFunction('_acesFitInv') + '\n' +
    extractFunction('_bloomThreshNow') + '; return _bloomThreshNow();')(0.62, 1.25, null), 0.62,
    'no renderer at all — the fallback never touches it');
  eq(mk(0, 1.25, 1.9), 0, 'a threshold of 0 means "bloom everything" and is honoured EXACTLY, not 2.3e-4');
  eq(mk(1, 1.25, 1.9), 1, 'a threshold of 1 means "bloom nothing" and stays exactly 1, not 0.9926');
  eq(mk(-0.5, 1.25, 1.9), 0, '...and a nonsense value lands on an end rather than anywhere surprising');
}

// ---------------------------------------------------------------- wiring
{
  assert(/du\.uThresh\.value=_bloomThreshNow\(\);/.test(src),
    'the bloom prefilter asks for the threshold each frame rather than reading the raw setting');
  assert(!/du\.uThresh\.value=_postThresh;/.test(src), '...and the raw read is gone');
  // the threshold is applied ONCE, at the top of the pyramid — scaling it must not change that
  assert(/du\.uFirst\.value = \(i===0\) \? 1 : 0;/.test(src), 'still thresholded once, at the top mip');
  // _expBase must be the AUTHORED exposure, not the live one, or the ratio is always 1 and this is a no-op
  assert(/_expBase = worldCfg\.exposure \* \(\(\(worldCfg\.colorV\|0\) >= 2\) \? 1 : LEGACY_EXPOSURE\)/.test(src),
    '_expBase is the authored exposure including the colorV legacy factor (build 1180)');
  assert(/const k = en \/ eb;/.test(extractFunction('_bloomThreshNow')),
    '...and the ratio is live-over-authored, so an authored change moves both together and changes nothing');
}
{ // the measurement and the retracted hypothesis are both recorded
  assert(/exposure     1\.00    1\.25    1\.60    1\.90/.test(src), 'the sweep is recorded beside the code');
  assert(/At the authored default of 1\.25 the shipped threshold is CORRECT/.test(src),
    'and that this is NOT a retune — the threshold was right where it was tuned');
  assert(/My own first reading of the three-camera data was\n\/\/ "the threshold is too low, raise the default"; that was wrong/.test(src),
    'including the hypothesis that the A/B disproved, and why the first reading was confounded');
}

done('build 1292: the bloom threshold follows the exposure it is measured against — build 1180 made toneMappingExposure move at runtime, and the prefilter thresholds the post-exposure tone-mapped frame, so what bloomed was whatever the eye had adapted to (measured, one pose, exposure the only variable: 0.02% of the frame at exposure 1.0 against 43.13% at 1.9). The threshold is now stated in scene luminance and re-derived each frame through three’s own ACES fit and its exact inverse, which holds coverage at 5.4-5.5% across that whole range and returns the authored number exactly at the authored exposure — so no level is retuned and nothing needs migrating');
