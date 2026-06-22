import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// build 531 (AI parity, phase 1): solo/campaign enemies use the MP bots' nav-grid pathfinding to route
// around walls instead of beelining into them.
assert(/if\(!NAV\.built\)\{ if\(!NAV\.building && typeof navBuildBegin==='function'\) navBuildBegin\(\); if\(typeof navBuildStep==='function'\) navBuildStep\(5\); \}/.test(src), 'enemy tick builds the nav grid in solo');
assert(/_repathBudget = 3;   \/\/ cap A\* searches per tick/.test(src), 'enemy tick caps A* searches per frame');
assert(/_botFollowPath\(en\._nav\|\|\(en\._nav=\{ pos:en\.mesh\.position \}\), td\.tx, td\.tz, dt\)/.test(src), 'chasing enemies follow an A* path to the target');
assert(/let _mvx=dx\/d, _mvz=dz\/d;/.test(src), 'beeline direction is the fallback when no path');

// executable: the shared path-follow returns null (caller beelines) until the grid is built
const fp = new Function('NAV', 'return (' + extractFunction('_botFollowPath') + ')')({ built:false, walk:null });
assert(fp({ pos:{x:0,z:0,y:0} }, 5, 5, 0.016) === null, 'no path while the nav grid is unbuilt -> caller beelines');
done();
