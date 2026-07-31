import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 467: nav grid STEP 2 — 8-neighbour connectivity + A* pathfinding over the walkable cells, with a
// magenta debug path (player -> farthest reachable cell) drawn on the overlay. No bot behaviour change yet.

// connectivity rules
const bl = extractFunction('navBuildLinks');
assert(/NAV\.link = new Uint16Array\(2\*N\);/.test(bl), 'a connectivity mask is built per NODE (16 bits since build 1200: bit d = link, bit d+8 = the link lands on the target cell\'s layer B)');
assert(/const dy=yAt\(q,nidx\)-cy; if\(dy>NAV_UP \|\| dy<-NAV_DOWN\) continue;/.test(bl), 'links only when the height change is climbable up / droppable down (checked per candidate LAYER since build 1200)');
assert(/if\(d>=4 && \(!nearOk\(navIdx\(ax,gz\),cy\) \|\| !nearOk\(navIdx\(gx,az\),cy\)\)\) continue;/.test(bl), 'diagonals cannot cut a wall corner (nearOk = some layer of the orthogonal cell within the vertical window)');

// A* structure
const fp = extractFunction('navFindPath');
assert(/if\(!wAt\(si\) \|\| !wAt\(gi\)\) return null;/.test(fp), 'rejects unwalkable endpoints (wAt reads the right layer for the node id)');
assert(/\(dx\+dz\+\(Math\.SQRT2-2\)\*Math\.min\(dx,dz\)\)\*cell/.test(fp), 'octile heuristic (admissible on an 8-grid)');
assert(/seen\[ni\]!==gen \|\| ng<g\[ni\]/.test(fp), 'relaxes neighbours via a generation stamp (no per-call clears)');

// --- executable: A* over a mock 7x7 grid with a wall that forces a detour ---
const W=7, H=7; const walk=new Uint8Array(W*H).fill(1);
// vertical wall at column 3, rows 0..4 (leaves a gap at rows 5,6 to go around the bottom)
for(let r=0;r<5;r++) walk[3*H+r]=0;
const idx=(x,y)=>x*H+y;
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]], DC=[1,1,1,1,Math.SQRT2,Math.SQRT2,Math.SQRT2,Math.SQRT2];
const link=new Uint8Array(W*H);
for(let x=0;x<W;x++)for(let y=0;y<H;y++){ const i=idx(x,y); if(!walk[i])continue; let m=0;
  for(let d=0;d<8;d++){ const ax=x+DIRS[d][0], ay=y+DIRS[d][1]; if(ax<0||ax>=W||ay<0||ay>=H)continue; if(!walk[idx(ax,ay)])continue;
    if(d>=4 && (!walk[idx(ax,y)]||!walk[idx(x,ay)]))continue; m|=(1<<d); } link[i]=m; }
function astar(si,gi){ const N=W*H, g=new Float32Array(N).fill(Infinity), from=new Int32Array(N).fill(-1), open=[si]; g[si]=0;
  const gX=Math.floor(gi/H), gY=gi%H; const h=i=>{const dx=Math.abs(Math.floor(i/H)-gX),dy=Math.abs(i%H-gY);return dx+dy+(Math.SQRT2-2)*Math.min(dx,dy);};
  const seen=new Set([si]);
  while(open.length){ open.sort((a,b)=>(g[a]+h(a))-(g[b]+h(b))); const cur=open.shift(); if(cur===gi)break;
    const cx=Math.floor(cur/H), cy=cur%H, mask=link[cur];
    for(let d=0;d<8;d++){ if(!(mask&(1<<d)))continue; const ni=(cx+DIRS[d][0])*H+(cy+DIRS[d][1]); const ng=g[cur]+DC[d];
      if(ng<g[ni]){ g[ni]=ng; from[ni]=cur; if(!seen.has(ni)){seen.add(ni);open.push(ni);} else open.push(ni); } } }
  if(!isFinite(g[gi])) return null; const p=[]; let c=gi; while(c!==-1){p.push(c);c=from[c];} return p.reverse();
}
const start=idx(1,2), goal=idx(5,2);            // opposite sides of the wall
const path=astar(start,goal);
assert(path!==null, 'a path exists around the wall');
assert(path[0]===start && path[path.length-1]===goal, 'path runs start..goal');
// the path must dip to a row >=5 (around the wall gap) — it cannot go straight through column 3 rows 0..4
const wentThroughGap = path.some(i=> (i%H)>=5);
assert(wentThroughGap, 'the route detours around the wall (through the open gap), not through it');
// every step is an allowed link (no teleporting / corner-cut)
for(let k=0;k<path.length-1;k++){ const a=path[k], b=path[k+1]; const ax=Math.floor(a/H),ay=a%H,bx=Math.floor(b/H),by=b%H; const dd=DIRS.findIndex(v=>v[0]===bx-ax&&v[1]===by-ay); assert(dd>=0 && (link[a]&(1<<dd)), 'step '+k+' follows a real link'); }
// fully walled-off goal -> null
const w2=new Uint8Array(W*H).fill(1); for(let y=0;y<H;y++) w2[idx(3,y)]=0;   // full wall, no gap
const link2=new Uint8Array(W*H);
for(let x=0;x<W;x++)for(let y=0;y<H;y++){ const i=idx(x,y); if(!w2[i])continue; let m=0; for(let d=0;d<8;d++){ const ax=x+DIRS[d][0],ay=y+DIRS[d][1]; if(ax<0||ax>=W||ay<0||ay>=H)continue; if(!w2[idx(ax,ay)])continue; if(d>=4&&(!w2[idx(ax,y)]||!w2[idx(x,ay)]))continue; m|=(1<<d);} link2[i]=m; }
function astar2(si,gi){ const N=W*H,g=new Float32Array(N).fill(Infinity),open=[si];g[si]=0;const seen=new Set([si]);
  while(open.length){ const cur=open.shift(); if(cur===gi)return true; const cx=Math.floor(cur/H),cy=cur%H,mask=link2[cur];
    for(let d=0;d<8;d++){ if(!(mask&(1<<d)))continue; const ni=(cx+DIRS[d][0])*H+(cy+DIRS[d][1]); const ng=g[cur]+DC[d]; if(ng<g[ni]){g[ni]=ng;if(!seen.has(ni)){seen.add(ni);open.push(ni);}} } } return false; }
assert(astar2(idx(1,2), idx(5,2))===false, 'a fully walled-off goal is correctly unreachable');
done();
