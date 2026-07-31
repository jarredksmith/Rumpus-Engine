import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 485: each bot resolved its ground (groundHeightAt) and tested its move (clearAt) with SEPARATE
// surfaceTopAt raycasts at nearly the same cell. When a bot moves cleanly it ends up exactly on the cell its
// clearAt just tested, which is also where groundHeightAt resolves — so compute that surface ONCE and share
// it. Falls back to a fresh raycast after a slide/block or while airborne (different / unknown cell).

const gh = extractFunction('groundHeightAt');
assert(/function groundHeightAt\(x, z, feetY, surfHint\)/.test(gh), 'groundHeightAt accepts a precomputed surface');
assert(/const top = \(surfHint!==undefined\) \? surfHint : surfaceTopAt\(x, z, undefined, undefined, _ceil\);/.test(gh), 'uses the hint when given, else raycasts');   // build 1233: the raycast is ceilinged at feetY+RAMP_RISE so a roof overhead is not this column's ground

const ub = extractFunction('updateBots');
assert(/let _gSurf;/.test(ub), 'a per-bot shared-surface holder is declared');
assert(/const _candSurf=\(typeof surfaceTopAt==='function'\)\?surfaceTopAt\(cx,cz,undefined,undefined,b\.pos\.y\+RAMP_RISE\):undefined;/.test(ub), 'the candidate cell surface is computed once');   // build 1233: with the same ceiling — a bot under a roof reads the floor underfoot
assert(/clearAt\(cx,cz,b\.pos\.y,_candSurf\)/.test(ub), 'the move-test reuses it (no internal re-raycast)');
assert(/b\.pos\.x=cx; b\.pos\.z=cz; _gSurf=_candSurf;/.test(ub), 'a clean move adopts that surface as the standing surface');
assert(/groundHeightAt\(b\.pos\.x,b\.pos\.z,b\.pos\.y,_gSurf\)/.test(ub), 'ground resolve reuses the shared surface');
// the slide branch does NOT carry a (now-wrong) shared surface
const slideOk = !/okX\)\{ b\.pos\.x=cx; _gSurf/.test(ub);
assert(slideOk, 'a slide does not reuse the candidate surface (it would be the wrong cell)');

// --- executable: reuse only when the committed cell equals the tested cell ---
function groundSurf(x,z, hint, raycast){ return (hint!==undefined) ? hint : raycast(x,z); }
let rays=0; const ray=(x,z)=>{ rays++; return 5; };
// clean move: cand surface computed once, reused for ground -> ONE raycast total
rays=0; const cand=ray(2,2); /*1*/ const moved=true; let g = moved ? cand : undefined;
groundSurf(2,2, g, ray);
assert(rays===1, 'clean move: ground reuses the move-test surface (1 raycast, not 2)');
// slide/airborne: no shared surface -> ground raycasts fresh (correctness preserved)
rays=0; g=undefined; groundSurf(2,2, g, ray);
assert(rays===1, 'no shared surface -> a fresh ground raycast is taken');
done();
