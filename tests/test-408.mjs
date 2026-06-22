import { gameSource, assert, near, done } from './harness.mjs';
const src = gameSource();

// build 533: enemy line-of-sight no longer hardcodes world-Y 1.4. Build 529 grounded enemies onto the real
// (possibly elevated / mesh) floor, so a fixed 1.4 sightline ran below the floor and broke detection + firing.
assert(!/segmentBlocked\(en\.mesh\.position\.x, en\.mesh\.position\.z, [^;]*, 1\.4\)/.test(src), 'no enemy LOS still hardcodes height 1.4');
assert(/segmentBlocked\(en\.mesh\.position\.x, en\.mesh\.position\.z, px, pz, \(eY \+ pEyeY\) \* 0\.5\)/.test(src), 'detection LOS casts at the surface eye-level');
assert(/segmentBlocked\(en\.mesh\.position\.x, en\.mesh\.position\.z, tg\.pos\.x, tg\.pos\.z, \(en\.mesh\.position\.y \+ \(tg\.pos\.y!=null\?tg\.pos\.y:en\.mesh\.position\.y\)\) \* 0\.5\)/.test(src), 'burst-fire LOS casts at the surface eye-level');
assert(/segmentBlocked\(en\.mesh\.position\.x, en\.mesh\.position\.z, near\.pos\.x, near\.pos\.z, \(en\.mesh\.position\.y \+ \(near\.pos\.y!=null\?near\.pos\.y:en\.mesh\.position\.y\)\) \* 0\.5\)/.test(src), 'round-1 fire LOS casts at the surface eye-level');

// the LOS height tracks the play surface instead of a fixed world height
const losY = (eY, pEyeY) => (eY + pEyeY) * 0.5;
near(losY(1.4, 1.6), 1.5, 1e-9, 'flat arena (surface ~0): ~1.5, same as the old fixed height');
near(losY(6.4, 6.6), 6.5, 1e-9, 'elevated arena (surface ~5): tracks up to the play level');
done();
