import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// build 528: discard spurious pointer-lock look spikes (Chrome movementX glitch) instead of clamping them.
assert(/let _lastLookDX = 0, _lastLookDY = 0;/.test(src), 'running reference for spike rejection exists');
assert(/lookFresh = true; _lastLookDX=0; _lastLookDY=0;/.test(src), 'reference resets when pointer re-locks');
assert(/const _spike = _adx > MAX_LOOK_DELTA \|\| _ady > MAX_LOOK_DELTA/.test(src), 'absolute spike test');
assert(/_adx > 120 && _adx > _lastLookDX\*5 \+ 40/.test(src), 'relative outlier test (x)');
assert(/_ady > 120 && _ady > _lastLookDY\*5 \+ 40/.test(src), 'relative outlier test (y)');
assert(/_lastLookDX = _adx; _lastLookDY = _ady;[\s\S]{0,140}if\(_spike\) return;/.test(src), 'reference updated BEFORE the drop, so a sustained flick is not repeatedly rejected');

// executable: an equivalent predicate behaves as intended
const MAX = 300;
const spike = (adx, ady, lx, ly) => adx > MAX || ady > MAX || (adx>120 && adx>lx*5+40) || (ady>120 && ady>ly*5+40);
assert(spike(800, 2, 10, 0) === true, 'huge absolute delta -> spike');
assert(spike(180, 2, 5, 0) === true, 'isolated moderate outlier from near-rest -> spike');
assert(spike(180, 2, 60, 0) === false, 'same 180px during a fast flick (high reference) -> NOT a spike');
assert(spike(40, 30, 0, 0) === false, 'normal small movement from rest -> NOT a spike');
assert(spike(110, 0, 0, 0) === false, 'a sub-120 move from rest is allowed (no false positive)');
done();
