// build 1200: two-layer nav — bots and enemies can finally path onto a roof or an upper storey.
//
// The nav grid stored ONE walkable Y per column, so any cell under a roof was either the floor or the
// roof, never both: multi-storey AI was structurally impossible (the multiplayer/feature critics' item).
// Now each column carries up to two floors (layer B = the highest surface, kept only when it clears the
// low floor by NAV_LAYER_SEP and passes the SAME clearAt authority), node id = cellIdx + N*layer, and the
// link mask is 16 bits — bit d is a link, bit d+8 says it lands on the target cell's LAYER B. Stairs fall
// out with no special case: a rising layer-A floor links into a neighbour's layer B the moment it is
// within jump reach. Dirty patches close the other old hole: prop verbs and shattered props mark their
// footprint, a budgeted re-sample re-runs navWalkable there, and one navBuildLinks() rebuild follows.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the harness: real functions, mock world
// World: open ground at y=0; a BUILDING over x>=0 (floor 0, roof 3.2 — two genuine layers); a LANDING
// platform 2.0 high at x in [-2,0), z in [-2,0) — the "stair". Ground -> landing is a 2.0 hop (within the
// 2.4 default NAV_UP), landing -> roof is 1.2. Remove the landing and the roof must become unreachable.
const world = { landGone: false };
const FNS = ['navIdx','navCellOf','navWalkable','navSampleCell','navBuildLinks','navFindPath',
  'navFloodReachable','navCellCenter','navNearestWalkable','navDirs','navDirCost','navDirtyRect','navDirtyStep'];
const body = `
  const NAV = { cell:2, ox:-8, oz:-8, nx:8, nz:8, built:false, building:false };
  let NAV_UP = 2.4; const NAV_DOWN = 8.0; const NAV_LAYER_SEP = 2.2;
  const player = { pos:{ x:-7, y:0, z:-7 } };
  function terrainHeightAt(x,z){ return 0; }
  function inBuilding(x,z){ return x>=0; }
  function inLanding(x,z){ return !world.landGone && x>=-2 && x<0 && z>=-2 && z<0; }
  function surfaceTopAt(x,z){ if(inBuilding(x,z)) return 3.2; if(inLanding(x,z)) return 2.0; return -Infinity; }
  function surfaceTopUnder(x,z,ceilY){ if(inBuilding(x,z)) return 0; if(inLanding(x,z)) return 2.0; return -Infinity; }
  function clearAt(x,z,feetY,surf){ return true; }
  ${FNS.map(f => extractFunction(f)).join('\n')}
  const N = NAV.nx*NAV.nz;
  NAV.walk=new Uint8Array(N); NAV.y=new Float32Array(N); NAV.walkB=new Uint8Array(N); NAV.yB=new Float32Array(N);
  for(let gx=0; gx<NAV.nx; gx++) for(let gz=0; gz<NAV.nz; gz++) navSampleCell(gx,gz);
  navBuildLinks(); NAV.built=true;
  return { NAV, navIdx, navCellOf, navFindPath, navCellCenter, navNearestWalkable, navFloodReachable,
    navDirtyRect, navDirtyStep, N };
`;
const api = new Function('world', body)(world);
const { NAV, N } = api;

// ---------------------------------------------------------------- two layers exist where they should
{
  const roofCell = api.navIdx(6, 6);                                  // world (5,5): inside the building
  eq(NAV.walk[roofCell], 1, 'a building cell keeps its FLOOR walkable (layer A — exactly the old behaviour)');
  eq(NAV.y[roofCell], 0, '...at the floor height');
  eq(NAV.walkB[roofCell], 1, '...and gains the ROOF as layer B');
  near(NAV.yB[roofCell], 3.2, 1e-6, '...at the roof height');
  const landCell = api.navIdx(3, 3);                                  // world (-1,-1): the landing
  eq(NAV.walk[landCell], 1, 'the landing is walkable');
  near(NAV.y[landCell], 2.0, 1e-6, '...on its top');
  eq(NAV.walkB[landCell], 0, '...with NO second layer (nothing above it) — layer B is earned, not automatic');
  const openCell = api.navIdx(0, 0);
  eq(NAV.walkB[openCell], 0, 'open ground has no phantom second layer');
}

// ---------------------------------------------------------------- the pathfinder climbs the stair
{
  const si = api.navNearestWalkable(-7, -7, 0);
  const giRoof = api.navNearestWalkable(5, 5, 3.2);
  const giFloor = api.navNearestWalkable(5, 5, 0);
  assert(si >= 0 && si < N, 'a ground actor starts on layer A');
  assert(giRoof >= N, 'asking near roof height picks the LAYER-B node of the same cell');
  assert(giFloor < N, '...and asking near floor height picks layer A — the y argument chooses the storey');
  eq(giRoof - N, giFloor, '...same cell, different layer');
  const up = api.navFindPath(si, giRoof);
  assert(up && up.length > 2, 'a path from open ground to the ROOF exists');
  eq(up[up.length-1], giRoof, '...ending on the layer-B node');
  const landCell = api.navIdx(3, 3);
  assert(up.includes(landCell) || up.includes(api.navIdx(3,2)) || up.includes(api.navIdx(2,3)) || up.includes(api.navIdx(2,2)),
    '...and it climbs via the landing — the only place the height chain fits inside NAV_UP');
  const yTrail = up.map(n => api.navCellCenter(n).y);
  for(let k=1;k<yTrail.length;k++) assert(yTrail[k]-yTrail[k-1] <= 2.4+1e-6, 'no single step exceeds the jump window (the roof is never reached by a 3.2m teleport)');
  const down = api.navFindPath(giRoof, si);
  assert(down && down[down.length-1]===si, 'the return trip also resolves (dropping down is within NAV_DOWN)');
  const indoor = api.navFindPath(si, giFloor);
  assert(indoor && indoor.every(n => n < N), 'a ground-floor goal paths entirely on layer A — nobody detours over the roof');
}

// ---------------------------------------------------------------- flood + centers agree with the layers
{
  const si = api.navNearestWalkable(-7, -7, 0);
  const flood = api.navFloodReachable(si);
  eq(flood.reach.length, 2*N, 'reachability covers both layers');
  eq(flood.reach[api.navIdx(6,6)+N], 1, 'the roof is REACHABLE from the ground (via the landing)');
  const c = api.navCellCenter(api.navIdx(6,6)+N);
  near(c.y, 3.2, 1e-6, 'a layer-B node decodes to the roof height');
  near(api.navCellCenter(api.navIdx(6,6)).y, 0, 1e-6, '...and the same cell as layer A decodes to the floor');
}

// ---------------------------------------------------------------- dirty patches: destroy the stair, lose the roof
{
  world.landGone = true;                                              // the landing prop is shattered
  api.navDirtyRect(-2, -2, 0, 0);                                     // its footprint is marked
  assert(NAV.dirty && NAV.dirty.length === 1, 'the footprint queues one dirty rect');
  api.navDirtyStep(1e9);                                              // budget large enough to drain in one call
  eq(NAV.dirty.length, 0, 'the queue drains');
  near(NAV.y[api.navIdx(3,3)], 0, 1e-6, 'the re-sample sees the landing gone — the cell drops to open ground');
  const si = api.navNearestWalkable(-7, -7, 0);
  const giRoof = api.navNearestWalkable(5, 5, 3.2);
  eq(api.navFindPath(si, giRoof), null, 'the roof is now UNREACHABLE — and the comp reject answers in O(1), links having been rebuilt');
  assert(api.navFindPath(si, api.navNearestWalkable(5, 5, 0)) !== null, '...while the ground floor still paths fine');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/NAV\.walkB = new Uint8Array\(N\); NAV\.yB = new Float32Array\(N\);/.test(src), 'navBuildAlloc allocates the second layer');
  assert(/function _botRepath\(b, destX, destZ, destY\)/.test(src) &&
    /navNearestWalkable\(b\.pos\.x, b\.pos\.z, b\.pos\.y\)/.test(src), 'repath starts from the actor\'s OWN storey');
  const pv = extractFunction('_pvApplyOne');
  eq((pv.match(/_navDirtyProp\(o\)/g)||[]).length, 4, 'hide, show and move (old + new footprint) all mark the grid; del rides shatterProp');
  assert(/navDirtyRect\(_shBox\.min\.x,_shBox\.min\.z,_shBox\.max\.x,_shBox\.max\.z\)/.test(src), 'a shattered prop (the del verb AND a shot barrel) marks its footprint');
  eq((src.match(/else if\(typeof navDirtyStep==='function'\) navDirtyStep\(3\);/g)||[]).length, 2, 'both AI frame loops step the dirty queue once the grid is built');
  assert(/if\(NAV\.dirty\.length>=64\)/.test(src), 'an edit storm collapses to one full re-sample instead of unbounded bookkeeping');
}

done('build 1200: two-layer nav — real navWalkable/links/A* driven over a mock two-storey world: the roof is a second layer with its own node, the path climbs it via a landing inside the jump window and returns, a floor goal never detours over the roof, navNearestWalkable picks the storey by height, and shattering the stair (dirty patch -> re-sample -> link rebuild) makes the roof unreachable in O(1) while the ground keeps pathing');
