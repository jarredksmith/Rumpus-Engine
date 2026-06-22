import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 546: wave-framerate fixes — throttle the per-enemy raycasts that ran every frame, and drop the
// per-step clearAt that scanned every collider 1-3x per enemy.
assert(/if\(\(en\._losT==null \|\| now - en\._losT > \(en\._losIv\|\|110\)\) && \(typeof _losBudget==='undefined' \|\| _losBudget>0\)\)\{/.test(src), 'enemy LOS (segmentBlocked) is throttled ~9x/sec per enemy AND capped per frame by _losBudget (build 547)');
assert(/const sees = !!en\._seesC;/.test(src), 'detection reads the cached LOS result');
assert(/if\(en\._grT==null \|\| _enGMoved \|\| \(nowMs-en\._grT>\(en\._grIv\|\|100\) && \(typeof _groundBudget==='undefined' \|\| _groundBudget>0\)\)\)\{/.test(src), 'enemy ground raycast is throttled (time or cell-change) AND capped per frame by _groundBudget (build 547)');
assert(/en\._groundY = \(typeof groundHeightAt==='function'\)/.test(src), 'ground height is cached on the enemy');
assert(!/const _estep=spd\*dt, _efy=en\.mesh\.position\.y-1\.4, _ecx=/.test(src), 'the build-542 per-step clearAt wall-slide is gone');
assert(/if\(en\._stuckT>0\.2\)/.test(src), 'wall-follow nudge triggers faster (0.2s)');
done();
