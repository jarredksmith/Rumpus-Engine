import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 619: the nav grid samples the floor UNDER head height (build 617's ceiling-aware surface) so a roof over
// a maze/building no longer hijacks the cell up onto the roof. Before this, surfaceTopAt returned the ROOF as the
// "surface", so every cell beneath it floated onto the roof and the real floor read as unwalkable — enemies could
// not path the play area and got funnelled single-file around the roof's footprint instead of roaming it freely.
// A raised platform (nothing standable below it) still resolves to its top, exactly as before.

const nwSrc = extractFunction('navWalkable');

// ---- source wiring ----
assert(/surfaceTopUnder\(x,z,ceilY\)/.test(nwSrc), 'navWalkable tries the ceiling-aware floor first');
assert(/const gy=surfaceTopAt\(x,z\)/.test(nwSrc), 'navWalkable falls back to the highest surface');
assert(/\+ 2\.5;/.test(nwSrc), 'ceiling is the player head height (+2.5)');

// ---- executable: run navWalkable against mocked geometry ----
function makeNav(o){
  const deps = `
    const player = { pos:{ y:${o.playerY!=null?o.playerY:0} } };
    function terrainHeightAt(x,z){ return ${o.terrain||0}; }
    function surfaceTopAt(x,z){ return ${o.surfTop}; }
    function surfaceTopUnder(x,z,ceilY){ return (${o.surfUnder.toString()})(ceilY); }
    function clearAt(x,z,feetY,surf){ return (${o.clear.toString()})(feetY); }
  `;
  return new Function(deps + '\n' + nwSrc + '\nreturn navWalkable(0,0);')();
}

// roof over a floor: surfaceTopAt=roof(6), but the floor under head height is 0 and it's clear -> stand on 0.
const roof = makeNav({ surfTop:6, surfUnder:()=>0, terrain:0, clear:(f)=>f<1, playerY:0 });
assert(roof.ok===true, 'roofed floor is walkable');
eq(roof.y, 0, 'roof case: nav stands on the floor (0), NOT the roof (6)');

// raised platform: nothing standable under head height; the slab blocks the low floor -> use the platform top (3).
const plat = makeNav({ surfTop:3, surfUnder:()=>-Infinity, terrain:0, clear:(f)=>f>2, playerY:0 });
assert(plat.ok===true, 'platform top is walkable');
eq(plat.y, 3, 'platform case: top (3) wins when the floor below is blocked');

// open ground: no surfaces; stand on terrain.
const open = makeNav({ surfTop:-Infinity, surfUnder:()=>-Infinity, terrain:0, clear:()=>true, playerY:0 });
assert(open.ok===true && open.y===0, 'open ground stands on terrain');

// solid wall column: blocked at both the low floor and the highest surface.
const wall = makeNav({ surfTop:-Infinity, surfUnder:()=>-Infinity, terrain:0, clear:()=>false, playerY:0 });
assert(wall.ok===false, 'a solid wall column is not walkable');

// the ceiling really is player.head+2.5: with the player on the floor (y=0) the floor wins over the roof.
const ceilCheck = makeNav({ surfTop:6, surfUnder:(c)=> c>=2.5?0:-Infinity, terrain:0, clear:(f)=>f<1, playerY:0 });
eq(ceilCheck.y, 0, 'ceiling = player head + 2.5 lets the floor under the roof win');

done('nav grid samples the floor under a roof (no more single-file enemies under ceilings) (build 619)');
