// build 1125: the sun's normal bias is expressed in TEXELS, so it survives a change of shadowDist.
//
// normalBias offsets the shadow lookup along the surface normal, in WORLD units. The right size for
// it is a small multiple of the shadow map's world texel — which is 2*extent/mapSize, and therefore
// changes whenever either does. The engine had it as the constant 0.6, tuned in build 1095 against
// the fixed +/-80 volume on a 2048 map: a 7.8 cm texel, so 7.7 texels of offset.
//
// Build 1120 then shrank the volume to shadowDist (30 by default, 2.9 cm a texel) and left the
// constant alone. The same 0.6 silently became ~20 texels — and, more to the point, 0.6 of a WORLD
// UNIT, which is longer than the entire ground shadow a 1.7 m crate casts under a 72-degree noon
// sun (0.55). Every contact shadow in a generated arena slid out from under the thing casting it.
//
// Measured on KILN RUN (seed 4242, desert, medium), the ground strip at the foot of a cover block,
// same camera, before and after: luminance 131/122/118/121/119/116 -> 108/97/93/96/94/91 across the
// contact band, while the frame's overall mean moved 142.23 -> 141.25. Local, not a global dimming.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- one expression, run for real
const nb = src.match(/const SUN_NB_TEXELS = ([\d.]+);\nconst _sunNormalBias = [^\n]*\n/);
assert(nb, 'the bias is a named texel count with a single derivation');
const fn = new Function('Math', nb[0] + '; return _sunNormalBias;')(Math);
{
  // the build-1095 tuning point, restated: the constant it replaces IS this expression
  near(fn(80, 2048), 0.6, 1e-6, 'at the old fixed +/-80 volume on a 2048 map it reproduces the tuned 0.6');
  // ...and the build-1120 default, which is what shipped wrong
  const now = fn(30, 2048);
  near(now, 0.2256, 1e-3, 'at the default shadowDist of 30 it is ' + now.toFixed(3) + ', not 0.6');
  assert(now < 0.6 * 0.5, 'less than half what builds 1120-1124 used at this extent');
  // the failure this fixes, in the units that matter: a 1.7 m crate under a 72-degree sun casts
  // 1.7 / tan(72) = 0.55 of ground shadow. An offset longer than that erases it completely.
  const reach = 1.7 / Math.tan(72 * Math.PI / 180);
  assert(0.6 > reach, 'the old constant (0.6) was longer than the whole shadow it had to bias (' + reach.toFixed(2) + ')');
  assert(now < reach * 0.5, '...the new one is under half of it, so the shadow survives');
}
{
  // it is a texel quantity: halve the map and it doubles; halve the extent and it halves
  near(fn(30, 1024), fn(30, 2048) * 2, 1e-9, 'a 1024 map (IS_COARSE) needs twice the world offset for the same texel count');
  near(fn(30, 2048), fn(15, 2048) * 2, 1e-9, 'halving the extent halves the offset');
  let prev = 0;
  for (const E of [8, 15, 30, 50, 80, 120]) { const v = fn(E, 2048); assert(v >= prev, 'monotonic in extent'); prev = v; }
  // the clamps: a huge shadowDist must not offset shadows off the map, a tiny one must not hit zero
  eq(fn(400, 2048), 0.6, 'the widest authorable volume is capped at the value that was actually tuned');
  assert(fn(8, 2048) >= 0.02, 'the tightest volume keeps a floor, or grazing faces band');
  assert(fn(1, 2048) === 0.02, '...an exact floor, not an accidental zero');
}

// ---------------------------------------------------------------- wired in both places
{
  const fit = extractFunction('_fitSunShadow');
  assert(/moon\.shadow\.normalBias = _sunNormalBias\(E, moon\.shadow\.mapSize\.x\);/.test(fit),
    'the fit re-derives the bias whenever it resizes the volume — the one place E can change');
  // and the boot value, which the very first shadow map renders with, comes from the same helper
  assert(/moon\.shadow\.normalBias = _sunNormalBias\(moon\.shadow\.camera\.right, moon\.shadow\.mapSize\.x\);/.test(src),
    'the boot value is the same expression, not a restated literal that can drift');
  assert(!/moon\.shadow\.normalBias = 0\.6;/.test(src), 'the bare constant is gone');
  // the DEPTH bias is a different quantity against an unchanged near/far, so it must NOT be scaled
  assert(/moon\.shadow\.bias = -0\.0004;/.test(src), 'the depth bias stays as tuned — 1120 did not change the depth range');
  assert(!/moon\.shadow\.bias = [^-\n]*_sunNormalBias/.test(src), '...and is not swept along with the normal bias');
}
// the helper must be declared before _fitSunShadow uses it (a const is in TDZ until its line runs)
assert(src.indexOf('const _sunNormalBias') < src.indexOf('function _fitSunShadow'),
  'the helper is declared above the function that calls it');

done('build 1125: normal bias scales with the shadow texel, so contact shadows stay attached at any shadowDist');
