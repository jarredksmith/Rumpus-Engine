import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 1095: 1.2 -> 0.6 — still big enough to clear acne banding on large planes at 2048px,
// small enough that contact shadows stop detaching (peter-panning) on generated levels.
// build 1125: that 0.6 is 7.7 texels of the +/-80 volume this line runs against, and normalBias is
// a texel quantity, so it is now derived rather than restated. See test-1125.
assert(/moon\.shadow\.normalBias\s*=\s*_sunNormalBias\(/.test(src), 'moon light has normalBias to clear shadow acne');
assert(/const SUN_NB_TEXELS = 7\.7;/.test(src), '...sized in texels, so it holds at any shadowDist');
assert(/moon\.shadow\.bias\s*=\s*-0\.0004/.test(src), 'moon light has a small negative depth bias');
done('shadow-bias');
