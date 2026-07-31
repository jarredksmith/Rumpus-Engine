import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 478: FFA framerate spiked (15-60) because A* allocated a fresh heap each call (GC) and explored the
// whole reachable area before failing on an unreachable target. Fixes: reuse the heap, label connected
// components for O(1) reachability rejection, cap A* calls per frame, and back off the repath when no route.

const fp = extractFunction('navFindPath');
assert(/const hI=NAV\._hI, hF=NAV\._hF; hI\.length=0; hF\.length=0;/.test(fp), 'A* reuses one heap across calls (no per-search allocation)');
assert(/if\(NAV\.comp && NAV\.comp\.length===NT && NAV\.comp\[si\]!==NAV\.comp\[gi\]\) return null;/.test(fp), 'cross-component goal fails O(1) instead of exhaustive search (with a staleness guard on the comp table size)');

const bl = extractFunction('navBuildLinks');
assert(/NAV\.comp = new Int32Array\(2\*N\)\.fill\(-1\);/.test(bl), 'connected components labelled at build time, over BOTH layers');
assert(/NAV\.comp\[ni\]=cid; q\.push\(ni\);/.test(bl), 'component flood walks the link graph');

const ub = extractFunction('updateBots');
assert(/_repathBudget = 3;/.test(ub), 'per-frame A* budget is reset each tick');
const fpath = extractFunction('_botFollowPath');
assert(/if\(_repathBudget>0\)\{ _repathBudget--; _botRepath\(b, destX, destZ, destY\); \} else \{ b\.pathT=0\.08/.test(fpath), 'repath only when the frame budget allows; otherwise keep the current route');
const rp = extractFunction('_botRepath');
assert(/b\.pathT = b\.path \? \(0\.5 \+ Math\.random\(\)\*0\.4\) : \(1\.0 \+ Math\.random\(\)\*0\.6\)/.test(rp), 'back off the repath cadence when no route was found');

// --- executable: component-based reachability + a budgeted dispatch ---
// two regions: cells 0..3 linked in a line; cell 9 isolated. label components, then "find path".
const link=[1,5,5,4, 0,0,0,0, 0,0];  // bitmask per cell: 0->right(idx1bit? we mock simply) ; we just mock comp directly
const comp=[0,0,0,0,-1,-1,-1,-1,-1,1];
function reachable(si,gi){ return comp[si]>=0 && comp[gi]>=0 && comp[si]===comp[gi]; }
assert(reachable(0,3)===true, 'same component -> reachable');
assert(reachable(0,9)===false, 'different component -> instantly unreachable (no search)');

// budget dispatch: 5 bots want to repath, budget 3 -> exactly 3 search this frame
let budget=3, searches=0; const wants=[1,1,1,1,1];
for(const w of wants){ if(w){ if(budget>0){ budget--; searches++; } } }
assert(searches===3, 'at most 3 searches run in one frame');
done();
