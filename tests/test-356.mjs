import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 471: STEP 3a — bots APPROACH their target by following the A* path (waypoint to waypoint) instead of
// beelining, and JUMP when the next cell is a step up. Close-range combat orbit, separation, and the old
// safety nets are untouched (additive). Grid is built once at match start and invalidated on arena rebuild.

// NAV declared before rebuildArena (boot-order / TDZ fix)
const navPos = src.indexOf('const NAV = { cell:2.0');
const rebuildPos = src.indexOf('function rebuildArena(){');
assert(navPos>0 && navPos < rebuildPos, 'NAV is declared before rebuildArena (no temporal-dead-zone crash on boot)');
assert(/function rebuildArena\(\)\{\s*NAV\.built=false;/.test(src), 'rebuildArena invalidates the grid');

// path-follow helpers
assert(/function _botRepath\(b, destX, destZ, destY\)/.test(src) && /function _botFollowPath\(b, destX, destZ, dt, destY\)/.test(src), 'path helpers exist (with the optional goal height since build 1200)');
const fp = extractFunction('_botFollowPath');
assert(/const goalMoved = !b\.path \|\| Math\.hypot\(\(b\.pathGoalX\|\|0\)-destX, \(b\.pathGoalZ\|\|0\)-destZ\) > 3\.0;/.test(fp), 'repaths when the goal drifts >3m');
assert(/while\(b\.pathI < b\.path\.length-1 && Math\.hypot\(wp\.x-b\.pos\.x, wp\.z-b\.pos\.z\) < NAV\.cell\*0\.9/.test(fp), 'advances past reached waypoints');
assert(/jump:\(wp\.y - b\.pos\.y\) > \(STEP\+0\.1\)/.test(fp), 'flags a jump when the next cell is a hop up');

// integration in updateBots: approach uses the path, falls back to beeline, jumps with forward carry
const ub = extractFunction('updateBots');
assert(/const wp = _botFollowPath\(b, destX, destZ, dt, destY\);/.test(ub), 'approach steers toward the path waypoint');
// build 475: jump is gated by a cooldown and tags the carry as a path-hop so it's collision-checked
assert(/if\(wp\.jump && b\.grounded!==false && \(b\._jumpCd\|\|0\)<=0\)\{ b\.vy=JUMP; b\.grounded=false; b\.evx=mvx\*spd; b\.evz=mvz\*spd; b\._jumpCarry=true; b\._jumpCd=0\.7; \}/.test(ub), 'jump sets vy + forward carry, tags it a path-hop, and arms a cooldown');
assert(/if\(b\._jumpCarry && typeof clearAt==='function'\)\{/.test(ub), 'a path-hop carry is collision-checked (no tunnelling through rock)');
assert(/\} else \{ b\.pos\.x=ncx; b\.pos\.z=ncz; \}   \/\/ trebuchet \/ platform: free flight/.test(ub), 'trebuchet/platform launches still fly free (arc over walls)');
assert(/b\.grounded=true; b\._jumpCarry=false;/.test(ub), 'landing clears the path-hop tag');
assert(/else \{ mvx=dx\/dist; mvz=dz\/dist; \}   \/\/ no nav path available -> beeline fallback/.test(ub), 'beeline fallback when no path');
assert(/if\(!NAV\.built\)\{ if\(!NAV\.building && typeof navBuildBegin==='function'\) navBuildBegin\(\); if\(typeof navBuildStep==='function'\) navBuildStep\(5\); \}/.test(ub), 'grid built incrementally while bots run (no match-start freeze)');
// the close-range orbit branch is still present (combat unchanged)
assert(/b\.aiState==='engage' && tgt && hasLOS && dist<Math\.max\(9,b\.prefRange\+3\)/.test(ub), 'close-range combat orbit retained');

// --- executable: waypoint advance + jump-trigger logic ---
const CELL=1.5, STEP=0.6;
function follow(botX, botZ, botY, cells, pathI){
  let wp=cells[pathI], guard=0;
  while(pathI < cells.length-1 && Math.hypot(wp.x-botX, wp.z-botZ) < CELL*0.9 && guard++<64){ pathI++; wp=cells[pathI]; }
  return { pathI, wp, jump:(wp.y-botY) > (STEP+0.1) };
}
const cells=[{x:0,y:0,z:0},{x:1.5,y:0,z:0},{x:3,y:0,z:0},{x:4.5,y:2.0,z:0}];
// bot sitting basically on cell 1 -> should advance to cell 2
let r=follow(1.5,0,0, cells, 1); assert(r.pathI===2, 'advances off a reached waypoint');
// approaching the raised final cell -> jump flagged
r=follow(3,0,0, cells, 2); assert(r.pathI===3 && r.jump===true, 'jumps toward a +2m step-up waypoint');
// a flat next waypoint -> no jump
const flat=[{x:0,y:0,z:0},{x:1.5,y:0.2,z:0}]; r=follow(0,0,0, flat, 1); assert(r.jump===false, 'no jump for a small flat step');
// --- executable: a path-hop carry slides along walls instead of tunnelling through them ---
function carry(px,pz,evx,evz, clearAt){
  const ncx=px+evx, ncz=pz+evz;   // (dt folded into evx/evz for the test)
  if(clearAt(ncx,ncz)) return {x:ncx,z:ncz,evx,evz};
  if(clearAt(ncx,pz))  return {x:ncx,z:pz, evx, evz:0};
  if(clearAt(px,ncz))  return {x:px, z:ncz,evx:0,evz};
  return {x:px,z:pz,evx:0,evz:0};
}
const wall=(x,z)=> x<2;   // a tall rock face occupying x>=2; clear only where x<2
let cr=carry(1.5,0, 1.0, 1.0, wall);
assert(Math.abs(cr.x-1.5)<1e-9 && cr.z===1.0, 'blocked X axis is killed, Z slide continues (no tunnelling into the rock)');
assert(cr.evx===0 && cr.evz===1.0, 'the into-wall momentum component is zeroed');
cr=carry(1.5,0, 1.0,1.0, ()=>false);
assert(cr.x===1.5 && cr.z===0 && cr.evx===0 && cr.evz===0, 'fully boxed -> no movement, momentum cleared');
cr=carry(0,0, 1.0,0, ()=>true);
assert(cr.x===1.0, 'open ground -> carry moves freely');
done();
