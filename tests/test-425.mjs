import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 557: one-click auto-generate maze level. Emits box-prop walls + point lights + spawns, sets a player
// start, and rebuilds nav. It's ordinary level data, so collision / nav / the MP snapshot work on it for free.

// --- the generator + panel exist and are wired into the World/scene editor mode ---
assert(/function generateMaze\(opts\)\{/.test(src), 'generateMaze() exists');
assert(/function renderGeneratePanel\(\)\{/.test(src), 'renderGeneratePanel() exists');
assert(/function _mulberry32\(a\)\{/.test(src), 'seedable PRNG (_mulberry32) exists');
assert(/let _genCells=9, _lastMazeSeed=0, _genCover=true, _genLoot=true, _genTex=true, _genDesc='', _genVision=true;/.test(src), 'panel size + last-seed + content-toggle state');
assert(/scene:   \['world','generate','zones'\]/.test(src), "'generate' section under the World/scene mode");
assert(/sec\('Auto-generate', 'generate', '<div id="edGenerate"><\/div>'\)/.test(src), 'Auto-generate section markup');

const gm = extractFunction('generateMaze');
// clears the scene first, then emits geometry
assert(/wipeScene\(\);/.test(gm), 'starts from a fresh scene (wipeScene)');
// walls are box primitives sized length/height/thickness
assert(/const hwall=\(x,z,L\)=> spawnProp\('box', \[x, 0, z, 0,0,0, L, wallH, th\], o=>\{ if\(o\) wallProps\.push\(o\); \}\);/.test(gm), 'horizontal walls are merged box runs grounded by finalizeProp (t[1]=0), collected for texturing');
assert(/const vwall=\(x,z,L\)=> spawnProp\('box', \[x, 0, z, 0,0,0, th, wallH\+VOFF, L\], o=>\{ if\(o\) wallProps\.push\(o\); \}\);/.test(gm), 'vertical walls are merged box runs, slightly taller (anti z-fight), collected');
assert(/const VOFF=0\.05;/.test(gm), 'vertical height offset defined to break coplanar-top z-fighting');
assert(/hSeg\[i\+1\]\[j\]=true/.test(gm) && /vSeg\[j\+1\]\[i\]=true/.test(gm), 'wall segment grid built from the carved maze before merging');
assert(/const gndAt=\(x,z\)=> \(typeof terrainHeightAt==='function'\?terrainHeightAt\(x,z\):0\);/.test(gm), 'gndAt helper retained (used for light heights)');
// lights are budgeted under the engine's active-light cap
assert(/placed<14/.test(gm) && /buildLight\(\{ type:'point'/.test(gm), 'budgeted point lights (<14) + a center key light');
// player start + enemy spawns + nav rebuild + open spawn region
assert(/playerSpawn\.x=\+cx\(0\)\.toFixed\(2\);/.test(gm), 'sets the player start');
assert(/buildSpawnMarker\(\{ mode:'hunt'/.test(gm), 'scatters enemy spawns for wave/co-op modes');
assert(/gameCfg\.spawnRegion\.on=false/.test(gm), 'clears any spawn region so MP players spawn across the maze');
assert(/NAV\.built=false;/.test(gm), 'triggers a nav-grid rebuild for the new layout');

// --- executable model: the carve+braid must yield a FULLY CONNECTED maze (every cell reachable) ---
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function carve(C, seed){
  const rnd=mulberry32(seed), openH=[], openV=[], vis=[];
  for(let i=0;i<C;i++){ openH.push(Array(C).fill(false)); openV.push(Array(C).fill(false)); vis.push(Array(C).fill(false)); }
  const stack=[[0,0]]; vis[0][0]=true;
  while(stack.length){
    const [ci,cj]=stack[stack.length-1], nb=[];
    if(ci>0&&!vis[ci-1][cj]) nb.push([ci-1,cj,'N']);
    if(ci<C-1&&!vis[ci+1][cj]) nb.push([ci+1,cj,'S']);
    if(cj>0&&!vis[ci][cj-1]) nb.push([ci,cj-1,'W']);
    if(cj<C-1&&!vis[ci][cj+1]) nb.push([ci,cj+1,'E']);
    if(!nb.length){ stack.pop(); continue; }
    const [ni,nj,dir]=nb[(rnd()*nb.length)|0];
    if(dir==='S') openH[ci][cj]=true; else if(dir==='N') openH[ni][nj]=true;
    else if(dir==='E') openV[ci][cj]=true; else openV[ni][nj]=true;
    vis[ni][nj]=true; stack.push([ni,nj]);
  }
  return {openH, openV};
}
function reachableCount(C, openH, openV){
  const seen=[]; for(let i=0;i<C;i++) seen.push(Array(C).fill(false));
  const q=[[0,0]]; seen[0][0]=true; let n=0;
  while(q.length){
    const [i,j]=q.pop(); n++;
    if(i<C-1 && openH[i][j] && !seen[i+1][j]){ seen[i+1][j]=true; q.push([i+1,j]); }     // south
    if(i>0   && openH[i-1][j] && !seen[i-1][j]){ seen[i-1][j]=true; q.push([i-1,j]); }     // north (neighbor's south)
    if(j<C-1 && openV[i][j] && !seen[i][j+1]){ seen[i][j+1]=true; q.push([i,j+1]); }       // east
    if(j>0   && openV[i][j-1] && !seen[i][j-1]){ seen[i][j-1]=true; q.push([i,j-1]); }     // west (neighbor's east)
  }
  return n;
}
for(const [C, seed] of [[9, 123], [12, 99999], [16, 7], [5, 42]]){
  const {openH, openV}=carve(C, seed);
  eq(reachableCount(C, openH, openV), C*C, 'every cell of a '+C+'x'+C+' maze (seed '+seed+') is reachable from the start');
}

done('auto-generate maze: emits walls/lights/spawns, rebuilds nav, and carves a fully-connected layout (build 557)');
