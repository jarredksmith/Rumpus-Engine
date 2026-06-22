import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 553: chasing enemies beeline straight at the target from whatever angle they started, and only route
// through the nav grid when the straight WALKING path is blocked. Build 542 had them ALWAYS path, which traced
// the nav-grid edges in toward the player on an open arena instead of charging.

// --- the decision is gated on a cached "direct path blocked" flag, not unconditional ---
assert(/if\(td\.chase && en\._pathBlk && typeof _botFollowPath==='function'\)/.test(src), 'pathfinding engages only when en._pathBlk is set');
assert(/let _mvx=dx\/d, _mvz=dz\/d;/.test(src), 'the base movement is a straight beeline at the target');

// --- the gate ray is low (knee height), throttled + jittered, and per-frame budgeted ---
assert(/const _kneeY=\(en\._groundY!=null\?en\._groundY:0\)\+0\.4;/.test(src), 'the walkability test is a knee-height ray (catches walls you can see over but not walk through)');
assert(/en\._pbIv=130\+Math\.random\(\)\*60;/.test(src), 'the test interval is jittered so a wave de-clusters');
assert(/\(typeof _pathBudget==='undefined' \|\| _pathBudget>0\)/.test(src), 'the test draws from a per-frame budget');
assert(/if\(typeof _pathBudget!=='undefined'\) _pathBudget--;/.test(src), 'a refresh decrements the path budget');
assert(/let _pathBudget = 0;/.test(src), 'the path-raycast budget is declared');
assert(/_losBudget = 5; _groundBudget = 5; _pathBudget = 5;/.test(src), 'the enemy tick resets the path budget each frame');

// --- executable: the gate logic. clear direct line -> beeline; blocked -> follow the path waypoint ---
function chooseMove(dx, dz, pathBlocked, waypoint){
  const d = Math.hypot(dx, dz) || 1;
  let mvx = dx/d, mvz = dz/d;   // beeline base
  if(pathBlocked && waypoint){
    const pdx = waypoint.x, pdz = waypoint.z, pl = Math.hypot(pdx, pdz);
    if(pl > 0.5){ mvx = pdx/pl; mvz = pdz/pl; }
  }
  return { mvx, mvz };
}
// open arena: target straight ahead (+x), path NOT blocked -> beelines east regardless of any waypoint
let open = chooseMove(10, 0, false, { x:-3, z:5 });
near(open.mvx, 1, 1e-9); near(open.mvz, 0, 1e-9);
// blocked: same target, but a wall in the way -> follows the waypoint (which veers north to go around)
let blocked = chooseMove(10, 0, true, { x:0, z:4 });
near(blocked.mvx, 0, 1e-9); near(blocked.mvz, 1, 1e-9);
// blocked but the waypoint is within 0.5u (self-cell) -> keep the beeline, don't zero the step
let selfcell = chooseMove(0, 10, true, { x:0.2, z:0.1 });
near(selfcell.mvx, 0, 1e-9); near(selfcell.mvz, 1, 1e-9);

function near(a,b,e){ assert(Math.abs(a-b)<=e, 'expected '+b+' got '+a); }

done('open-arena enemies beeline from any angle; route only around real walls (build 553)');
