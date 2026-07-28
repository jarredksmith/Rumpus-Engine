import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 1095: 1.2 -> 0.6 — still big enough to clear acne banding on large planes at 2048px,
// small enough that contact shadows stop detaching (peter-panning) on generated levels.
assert(/moon\.shadow\.normalBias\s*=\s*0\.6/.test(src), 'moon light has normalBias to clear shadow acne');
assert(/moon\.shadow\.bias\s*=\s*-0\.0004/.test(src), 'moon light has a small negative depth bias');
done('shadow-bias');
