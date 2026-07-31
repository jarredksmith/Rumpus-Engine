import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 470: report the LARGEST connected walkable region anywhere (not just what's reachable from the player),
// so we can tell whether "2563 reachable" is the main play area or just a pocket the player is standing in.
// Also brighter/lifted overlay colours so green vs blue is readable against rock.

assert(/function navLargestComponent\(\)/.test(src), 'largest-component diagnostic exists');
const lc = extractFunction('navLargestComponent');
assert(/if\(!wAt\(s\)\|\|seen\[s\]\) continue;/.test(lc), 'floods each unvisited walkable NODE once (both layers since build 1200)');
assert(/if\(cnt>best\) best=cnt;/.test(lc), 'tracks the biggest region');
assert(/flashToast\('Nav: '\+cnt\+' walkable, '\+flood\.count\+' reachable from you, largest region '\+largest/.test(src), 'toast reports walkable / reachable / largest');

// --- executable: largest component over a grid with a big region and a small isolated pocket ---
const W=8,H=8; const walk=new Uint8Array(W*H).fill(0);
const idx=(x,y)=>x*H+y;
// big region: cols 0-4 fully walkable (40 cells)
for(let x=0;x<=4;x++) for(let y=0;y<H;y++) walk[idx(x,y)]=1;
// small pocket: a 2x2 block at cols 6-7 rows 0-1 (4 cells), separated by empty col 5
for(let x=6;x<=7;x++) for(let y=0;y<=1;y++) walk[idx(x,y)]=1;
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const link=new Uint8Array(W*H);
for(let x=0;x<W;x++)for(let y=0;y<H;y++){ const i=idx(x,y); if(!walk[i])continue; let m=0;
  for(let d=0;d<8;d++){ const ax=x+DIRS[d][0],ay=y+DIRS[d][1]; if(ax<0||ax>=W||ay<0||ay>=H)continue; if(!walk[idx(ax,ay)])continue;
    if(d>=4&&(!walk[idx(ax,y)]||!walk[idx(x,ay)]))continue; m|=(1<<d);} link[i]=m; }
function largest(){ const N=W*H, seen=new Uint8Array(N); let best=0;
  for(let s=0;s<N;s++){ if(!walk[s]||seen[s])continue; let cnt=0; const q=[s]; seen[s]=1; let h=0;
    while(h<q.length){ const cur=q[h++]; cnt++; const cx=Math.floor(cur/H),cy=cur%H,mask=link[cur];
      for(let d=0;d<8;d++){ if(!(mask&(1<<d)))continue; const ni=(cx+DIRS[d][0])*H+(cy+DIRS[d][1]); if(seen[ni])continue; seen[ni]=1; q.push(ni); } } if(cnt>best)best=cnt; }
  return best; }
function reachFrom(si){ const seen=new Uint8Array(W*H); const q=[si]; seen[si]=1; let h=0,c=0;
  while(h<q.length){ const cur=q[h++]; c++; const cx=Math.floor(cur/H),cy=cur%H,mask=link[cur]; for(let d=0;d<8;d++){ if(!(mask&(1<<d)))continue; const ni=(cx+DIRS[d][0])*H+(cy+DIRS[d][1]); if(seen[ni])continue; seen[ni]=1; q.push(ni);} } return c; }
assert(largest()===40, 'largest region is the big 40-cell area (got '+largest()+')');
// standing in the small pocket: reachable is only 4, but largest reports 40 -> "you are in a pocket"
assert(reachFrom(idx(7,0))===4, 'from the pocket you only reach 4 cells');
assert(largest() > reachFrom(idx(7,0)), 'largest >> reachable-from-pocket flags that the player is boxed in');
// standing in the big area: reachable equals largest -> "you are in the main area"
assert(reachFrom(idx(0,0))===largest(), 'from the main area reachable equals the largest region');
done();
