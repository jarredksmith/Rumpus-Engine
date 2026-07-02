// (build 827) BIGGER ARENAS for racing-scale courses. The playable half-size was clamped to 400 (an 800 m box); raised to
// 2000 (a 4 km course). The flat floor + boundary walls scale for free; three things are made safe for the new range:
//  - the bot nav grid grows its CELL so the whole course still fits inside the 160x160 cap (bounded memory) instead of
//    only covering the central ~320 m;
//  - the ground grid caps its line count so a huge map's grid stays light;
//  - the editor slider + clamp both go to 2000.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- the clamp on worldCfg.arena now allows up to 2000 ---
assert(/worldCfg\.arena = Math\.max\(15, Math\.min\(2000, worldCfg\.arena == null \? DEFAULT_WORLD\.arena : \+worldCfg\.arena\)\);/.test(src), 'arena clamps to [15, 2000]');

// --- the editor slider goes to 2000 ---
assert(/slider\(b,'Arena size','arena',15,2000,5\);/.test(src), 'the Arena size slider spans 15..2000');

// --- nav grid: cell grows so a big arena fits in <=160 cells and still covers the whole course ---
const al = extractFunction('navBuildAlloc');
assert(/NAV\.cell = Math\.max\(2\.0, \(2\*lim\)\/160\);/.test(al), 'the nav cell grows with the arena (bounded cell count, full coverage)');
assert(/Math\.min\(160,/.test(al), 'the 160x160 cap is still in force');
// executable: the alloc math stays bounded and covers the arena at any size
{
  const alloc=(ARENA)=>{ const lim=ARENA-1.5; const cell=Math.max(2.0,(2*lim)/160); const nx=Math.max(1,Math.min(160,Math.ceil((2*lim)/cell))); return { cell, nx, covers: nx*cell >= 2*lim - cell }; };
  const small=alloc(70), huge=alloc(2000);
  eq(small.cell, 2.0, 'a small arena keeps the fine 2 m cell');
  assert(huge.cell > 20, 'a 4 km arena uses a coarse cell (got '+huge.cell.toFixed(1)+' m)');
  assert(small.nx <= 160 && huge.nx <= 160, 'cell count never exceeds the cap at either size');
  assert(huge.covers, 'the coarse grid still spans the whole huge course');
}

// --- the ground grid caps its subdivisions so a huge arena stays light ---
const ra = extractFunction('rebuildArena');
assert(/const divs = Math\.max\(8, Math\.min\(400, Math\.round\(ARENA\*2\/2\.5\)\)\);/.test(ra), 'grid divisions are capped at 400 (cells just grow past ~1 km)');

// --- viewDist already reaches 2000 so you can see down a long track (unchanged, asserted for completeness) ---
assert(/worldCfg\.viewDist = Math\.max\(60, Math\.min\(2000,/.test(src), 'view distance can reach 2000 to see across a big course');

done('build 827: racing-scale arenas up to 4 km — bounded nav grid + capped grid, slider/clamp to 2000');
