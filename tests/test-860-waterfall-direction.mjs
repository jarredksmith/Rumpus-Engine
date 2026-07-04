// (build 860) WATERFALLS FALL DOWN — the sheet's phase terms subtracted time from vUv.y, so a feature
// at constant phase satisfied vUv.y = C + t: the pattern CLIMBED. Time is now ADDED to vUv.y
// (vUv.y = C - t → features descend), in both the band and the streak wobble. The dead `drop`
// term (multiplied by 0.0) is gone too.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
const sheet = src.match(/const _FALL_FSH = \[[\s\S]{0,1800}?\]\.join/)[0];
assert(/sin\(\(vUv\.y \+ uTime\*uSpd\)\*46\.0\)/.test(sheet), 'band phase descends (time ADDED to vUv.y)');
assert(/sin\(vUv\.y\*9\.0 \+ uTime\*uSpd\*6\.0\)/.test(sheet), 'streak wobble descends too');
assert(!/vUv\.y - uTime/.test(sheet) && !/vUv\.y\*9\.0 - uTime/.test(sheet), 'no upward (subtracted-time) phase remains');
assert(!/float drop = /.test(sheet) && !/\*drop\*/.test(sheet), 'the dead drop term is gone');
done('build 860: the waterfall sheet scrolls downward');
