import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 1095: 1.2 -> 0.6 — still big enough to clear acne banding on large planes at 2048px,
// small enough that contact shadows stop detaching (peter-panning) on generated levels.
// build 1125: that 0.6 is 7.7 texels of the +/-80 volume this line runs against, and normalBias is
// a texel quantity, so it is now derived rather than restated. See test-1125.
assert(/moon\.shadow\.normalBias\s*=\s*_sunNormalBias\(/.test(src), 'moon light has normalBias to clear shadow acne');
assert(/const SUN_NB_TEXELS = 7\.7;/.test(src), '...sized in texels, so it holds at any shadowDist');
// build 1345: this asserted a small NEGATIVE depth bias, and that is the thing the corner-leak report
// turned out to be — measured in a sealed room, -0.0004 leaked 354 pixels against 151 at zero, with the
// acne it exists to prevent showing no response at any value. The intent that survives is that the sun's
// depth bias is a DELIBERATE, single, named value rather than three literals nobody keeps in step.
assert(/moon\.shadow\.bias = SHADOW_DEPTH_BIAS;/.test(src), 'the moon light takes its depth bias from the one constant');
assert(/const SHADOW_DEPTH_BIAS = 0;/.test(src), '...which is zero: the normal offset does the acne work (build 1341)');
done('shadow-bias');
