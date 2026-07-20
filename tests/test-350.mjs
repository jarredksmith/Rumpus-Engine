import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 465: nav grid — STEP 1 of pathfinding. Sample the arena into walkable cells using the SAME collision
// helpers the player uses (surfaceTopAt + terrain + insideSolid + clearAt), and a green debug overlay (toggle N)
// so the grid can be eyeballed against the geometry before any pathfinding is built on it. No behaviour change.

// module + key wiring
assert(/const NAV = \{ cell:2\.0, nx:0, nz:0, ox:0, oz:0, walk:null, y:null, built:false, overlay:null, show:false \};/.test(src), 'NAV grid state exists');
assert(/function buildNavGrid\(\)/.test(src) && /function navBuildAlloc\(\)/.test(src) && /function navWalkable\(x,z\)/.test(src) && /function buildNavOverlay\(\)/.test(src) && /function navOverlayToggle\(\)/.test(src), 'grid build + alloc + walkable test + overlay + toggle all defined');
assert(!/e\.code==='KeyN'/.test(src), 'build 1020: the dev N-key overlay binding is REMOVED from live play (players fat-fingered it)');

// walkable definition uses the player's collision helpers (not a separate guess)
const nw = extractFunction('navWalkable');
assert(/const gy=surfaceTopAt\(x,z\)/.test(nw) && /terrainHeightAt\(x,z\)/.test(nw), 'standing height = max(surface, terrain) — same as the player');
assert(!/insideSolid\(x,z,standY\)\) return false/.test(nw), 'insideSolid is NOT used as a gate (its over-occupied boxes wrongly rejected rock tops)');
assert(/return \{ ok: clearAt\(x,z,standY,gy\), y: standY \};/.test(nw), 'final walkability is clearAt at the standing height (reusing the surface height to skip a duplicate raycast)');
// build 619: the floor UNDER head height is tried first so a roof doesn't hijack the cell; surfaceTopAt is the fallback.
assert(/surfaceTopUnder\(x,z,ceilY\)/.test(nw), 'nav samples the ceiling-aware floor (build 617 surface) before the highest surface');

// generation bounds + storage
const al = extractFunction('navBuildAlloc');
assert(/const lim = ARENA - 1\.5;/.test(al) && /NAV\.ox = -lim; NAV\.oz = -lim;/.test(al), 'grid covers the playable arena');
assert(/NAV\.walk = new Uint8Array\(N\); NAV\.y = new Float32Array\(N\);/.test(al), 'stores a walk flag + ground height per cell');
// build 472: the full build is alloc + sample-all-rows + links; an incremental builder shares the same pieces
assert(/function navBuildBegin\(\)/.test(src) && /function navBuildStep\(maxMs\)/.test(src) && /function navSampleRow\(gx\)/.test(src), 'incremental builder (begin/step/sample-row) exists for a freeze-free match start');
assert(/Math\.min\(160,/.test(al), 'cell count is capped (huge arenas stay bounded)');

// --- executable: index round-trip + walkable sampling on a mock arena ---
const NAV = { cell:1.5, nx:0, nz:0, ox:0, oz:0, walk:null, y:null };
function navIdx(gx,gz){ return gx*NAV.nz + gz; }
function navCellOf(x,z){ return { gx:Math.floor((x-NAV.ox)/NAV.cell), gz:Math.floor((z-NAV.oz)/NAV.cell) }; }
// a 10x10u arena, cell 1.5, with a solid pillar blocking a 3x3u patch in the middle
const ARENA_T = 6.5;                                  // -> lim 5
const lim = ARENA_T - 1.5;
NAV.ox=-lim; NAV.oz=-lim; NAV.nx=Math.max(1,Math.ceil((2*lim)/NAV.cell)); NAV.nz=NAV.nx;
const N=NAV.nx*NAV.nz; NAV.walk=new Uint8Array(N); NAV.y=new Float32Array(N);
const blocked=(x,z)=> (Math.abs(x)<1.5 && Math.abs(z)<1.5);   // the pillar footprint
function mockWalkable(x,z){ return blocked(x,z) ? false : { ok:true, y:0 }; }
let walkCnt=0, blockCnt=0;
for(let gx=0;gx<NAV.nx;gx++) for(let gz=0;gz<NAV.nz;gz++){
  const x=NAV.ox+(gx+0.5)*NAV.cell, z=NAV.oz+(gz+0.5)*NAV.cell;
  const w=mockWalkable(x,z); const idx=navIdx(gx,gz);
  if(w&&w.ok){ NAV.walk[idx]=1; walkCnt++; } else { NAV.walk[idx]=0; blockCnt++; }
}
assert(walkCnt>0 && blockCnt>0, 'the mock arena has both walkable and blocked cells');
// the centre cells (pillar) are blocked; a corner cell is walkable
const ctr=navCellOf(0,0); assert(NAV.walk[navIdx(ctr.gx,ctr.gz)]===0, 'a cell on the pillar is blocked');
const corner=navCellOf(-lim+0.75,-lim+0.75); assert(NAV.walk[navIdx(corner.gx,corner.gz)]===1, 'an open corner cell is walkable');
// index round-trips
for(const [gx,gz] of [[0,0],[2,3],[NAV.nx-1,NAV.nz-1]]){ const i=navIdx(gx,gz); assert(Math.floor(i/NAV.nz)===gx && i%NAV.nz===gz, 'navIdx round-trips ('+gx+','+gz+')'); }
done();
