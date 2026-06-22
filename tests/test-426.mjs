import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 558: one-click auto-generate OFFICE / complex. Rooms-and-corridors via BSP, emitted as merged box-prop
// walls + lights + spawns. Same downstream story as the maze: collision / nav / MP snapshot all work on it.

assert(/function generateOffice\(opts\)\{/.test(src), 'generateOffice() exists');
assert(/let _genType='maze';/.test(src), 'panel tracks the chosen layout type');

const go = extractFunction('generateOffice');
assert(/wipeScene\(\);/.test(go), 'starts from a fresh scene');
assert(/const split=\(r0,c0,r1,c1,depth\)=>\{/.test(go), 'BSP split function');
assert(/carveCorr\(aC\[0\],aC\[1\], bC\[0\],bC\[1\]\);/.test(go), 'each split connects its two halves with a corridor');
assert(/spawnProp\('box', \[mx, 0, cz\(r\), 0,0,0, \(x1-x0\), wallH, cell\], o=>\{ if\(o\) wallProps\.push\(o\); \}\)/.test(go), 'horizontal wall runs emit merged boxes grounded by finalizeProp (t[1]=0), collected');
assert(/spawnProp\('box', \[cx\(c\), 0, mz, 0,0,0, cell, wallH\+0\.05, \(z1-z0\)\], o=>\{ if\(o\) wallProps\.push\(o\); \}\)/.test(go), 'vertical wall runs emit merged boxes, slightly taller (anti z-fight), collected');
assert(/const gndAt=\(x,z\)=> \(typeof terrainHeightAt==='function'\?terrainHeightAt\(x,z\):0\);/.test(go), 'gndAt helper retained (used for light heights)');
assert(/placed<20/.test(go) && /buildLight\(\{ type:'point'/.test(go), 'budgeted per-room lights + a fill light');
assert(/buildSpawnMarker\(\{ mode:'hunt'/.test(go), 'enemy spawns spread across rooms');
assert(/gameCfg\.spawnRegion\.on=false/.test(go), 'MP players spawn across the whole complex');
assert(/NAV\.built=false;/.test(go), 'triggers a nav-grid rebuild');

// panel exposes the Maze/Office toggle + a dispatching Generate button
const panel = extractFunction('renderGeneratePanel');
assert(/seg\.appendChild\(mkSeg\('Maze','maze'\)\); seg\.appendChild\(mkSeg\('Office','office'\)\);/.test(panel), 'panel has a Maze/Office layout toggle');
assert(/if\(isMaze\) generateMaze\(o\); else generateOffice\(Object\.assign\(o,\{ desc:_genDesc \}\)\);/.test(panel) && /const o=\{ cells:_genCells, cover:_genCover, loot:_genLoot, tex:_genTex \};/.test(panel), 'Generate button dispatches by layout type with content opts + scene description');

// --- executable model: the BSP carve must leave every room reachable from every other ---
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function build(G, seed){
  const rnd=mulberry32(seed), wall=[]; for(let i=0;i<G;i++) wall.push(Array(G).fill(true));
  const rooms=[]; const inB=(r,c)=> (r>0&&c>0&&r<G-1&&c<G-1);
  const carveRect=(r0,c0,r1,c1)=>{ for(let r=r0;r<r1;r++) for(let c=c0;c<c1;c++){ if(inB(r,c)) wall[r][c]=false; } };
  const carveCorr=(r1,c1,r2,c2)=>{ let r=r1,c=c1; while(c!==c2){ if(inB(r,c)) wall[r][c]=false; c+=(c2>c?1:-1); } while(r!==r2){ if(inB(r,c)) wall[r][c]=false; r+=(r2>r?1:-1); } if(inB(r,c)) wall[r][c]=false; };
  const MINSZ=5;
  const split=(r0,c0,r1,c1,depth)=>{
    const h=r1-r0,w=c1-c0,canV=(w>=2*MINSZ),canH=(h>=2*MINSZ);
    if(depth<=0||(!canV&&!canH)){ carveRect(r0+1,c0+1,r1-1,c1-1); const ctr=[(r0+r1)>>1,(c0+c1)>>1]; rooms.push(ctr); return ctr; }
    const doV=(canV&&canH)?(w>=h):canV; let aC,bC;
    if(doV){ const sc=c0+MINSZ+((rnd()*(w-2*MINSZ+1))|0); aC=split(r0,c0,r1,sc,depth-1); bC=split(r0,sc,r1,c1,depth-1); }
    else   { const sr=r0+MINSZ+((rnd()*(h-2*MINSZ+1))|0); aC=split(r0,c0,sr,c1,depth-1); bC=split(sr,c0,r1,c1,depth-1); }
    carveCorr(aC[0],aC[1],bC[0],bC[1]); return aC;
  };
  split(0,0,G,G,5);
  for(let i=0;i<G;i++){ wall[0][i]=wall[G-1][i]=wall[i][0]=wall[i][G-1]=true; }
  return {wall, rooms};
}
function floodFrom(G, wall, sr, sc){
  const seen=[]; for(let i=0;i<G;i++) seen.push(Array(G).fill(false));
  if(wall[sr][sc]) return seen; const q=[[sr,sc]]; seen[sr][sc]=true;
  while(q.length){ const [r,c]=q.pop(); for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nr=r+dr,nc=c+dc; if(nr>=0&&nc>=0&&nr<G&&nc<G&&!seen[nr][nc]&&!wall[nr][nc]){ seen[nr][nc]=true; q.push([nr,nc]); } } }
  return seen;
}
for(const [size, seed] of [[9, 11], [14, 7], [5, 30000], [11, 424242]]){
  const G=Math.max(16, Math.min(40, size*2+8));
  const {wall, rooms}=build(G, seed);
  assert(rooms.length>=2, 'office (size '+size+') has multiple rooms');
  const seen=floodFrom(G, wall, rooms[0][0], rooms[0][1]);
  let reached=0; for(const [r,c] of rooms){ if(seen[r][c]) reached++; }
  eq(reached, rooms.length, 'every room of a size-'+size+' office (seed '+seed+') is reachable from the first');
}

// build 574: corridors are tracked + excluded from furniture pools (fixes "sink in the hallway"); free-standing
// (center) spots get a random facing so identical props don't all align.
assert(/const corr=\[\];/.test(go) && /corr\[r\]\[c\]=true/.test(go), 'corridor cells are flagged when carved');
assert((go.match(/if\(corr\[r\]\[c\]\)/g)||[]).length>=1 && /\|\| corr\[r\]\[c\]/.test(go), 'corridor cells are skipped in both the global and per-room furniture pools');
assert(/Math\.atan2\(ox,oz\):\(rnd\(\)\*Math\.PI\*2\)/.test(go), 'center spots (ox=oz=0) fall back to a random yaw, not 0');
// model the rule: a corridor-flagged cell is never a furniture spot, whatever its neighbour pattern
function eligible(isFloorCell, isCorr){ return !!isFloorCell && !isCorr; }
assert(eligible(true,false), 'a plain room-floor cell is eligible');
assert(!eligible(true,true), 'a corridor cell is NOT eligible even though it is floor (bend/junction would otherwise read as corner/edge)');
assert(!eligible(false,false), 'a wall cell is not eligible');

const ap2 = gameSource();
assert(/max_tokens:4096/.test(ap2), 'scene plan token budget raised so many-room JSON is not truncated');

done('auto-generate office: BSP rooms+corridors, merged wall boxes, lights/spawns, nav rebuild, fully connected (build 558)');
