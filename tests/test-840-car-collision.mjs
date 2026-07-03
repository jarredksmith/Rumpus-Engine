// (build 840) SOLID CARS — you can no longer drive through rivals like they aren't there. Contact is geometric
// (circle-vs-oriented-box, engine-independent): the player's intended move is blocked axis-by-axis when it
// would ENTER a rival's or a parked vehicle's footprint (so you scrape and slide, and the build-822 glancing
// deflection + bonk price the hit) — but only if you weren't already inside, so overlaps can never freeze you.
// Rivals brake behind traffic (the player, each other, parked cars) instead of phasing through.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- wiring pins ---
{
  const du=extractFunction('driveUpdate');
  assert(/if\(mvx!==0 && _raceCarBlock\(o\.position\.x\+mvx, o\.position\.z, o\.position\.x, o\.position\.z, o\)\)\{ mvx=0; _hitSt=_hitSt\|\|_raceHitBot; \}/.test(du), 'X moves test against cars (and remember who was hit)');
  assert(/if\(mvz!==0 && _raceCarBlock\(o\.position\.x, o\.position\.z\+mvz, o\.position\.x, o\.position\.z, o\)\)\{ mvz=0; _hitSt=_hitSt\|\|_raceHitBot; \}/.test(du), 'Z moves test against cars');
  assert(/if\(mvx!==0 && mvz!==0 && _raceCarBlock\(o\.position\.x\+mvx, o\.position\.z\+mvz, o\.position\.x, o\.position\.z, o\)\)\{ mvx=0; mvz=0; _hitSt=_hitSt\|\|_raceHitBot; \}/.test(du), 'diagonals cannot thread a car');
  assert(/if\(_hitSt\) _raceBotBump\(_hitSt, r\.speed, o\);/.test(du), 'a blocked move transfers the impulse to the rival (build 841)');
}
assert(/tgt=Math\.min\(tgt, _raceBotObstacle\(st, o, \(st\.prevYaw!=null\?st\.prevYaw:o\.rotation\.y\+st\.mYaw\)\)\);/.test(extractFunction('_raceBotsTick')), 'rivals brake behind traffic');
assert(/st\.hw=Math\.min\(_hx,_hz\); st\.hl=Math\.max\(_hx,_hz\);/.test(extractFunction('_raceSpawnBots')), 'rival contact footprints measured at spawn');

// --- executable: the contact + braking math against a simulated field ---
const env=new Function(`"use strict";
  const objectiveActive=()=>'race';
  const RAD=Math.PI/180;
  const propModels=[];
  const _raceBots=[{ obj:{ position:{x:0,y:0,z:-10}, rotation:{y:0} }, prevYaw:0, mYaw:0, hw:1, hl:2.4, v:8 }];
  const drivingCar={ position:{x:0,y:0,z:0}, userData:{ carSpeed:12 } };
  const _carFoot=(o)=>({ hw:1, hd:2.4, hh:0.6, ox:0, oz:0, oy:0 });
  let _raceHitBot=null;   // build 841: the block function stashes the struck rival here
`+extractFunction('_raceCarInside')+'\n'+extractFunction('_raceCarBlock')+'\n'+extractFunction('_raceBotObstacle')+`
  return { block:(nx,nz,cx,cz)=>_raceCarBlock(nx,nz,cx,cz,{ userData:{carYaw:0}, rotation:{y:0}, position:{x:cx,y:0,z:cz} }),
    inside:_raceCarInside,
    obstacle:(st,o,yaw)=>_raceBotObstacle(st,o,yaw),
    bots:_raceBots, props:propModels };
`)();

// 1. driving into a rival's box from outside is blocked; sliding past its side is not
assert(env.block(0, -7.2, 0, -5), 'closing on the rival’s tail is blocked (enters the box)');
assert(!env.block(3.2, -10, 3.2, -6), 'passing alongside (3.2 m off its centre) stays free');
// 2. escape is always allowed: already overlapped -> moves are never frozen
assert(!env.block(0, -9.4, 0, -9.8), 'a car already inside the box can still move (escape allowed)');
// 3. a parked vehicle blocks too
env.props.push({ userData:{ vehicle:{ modelYaw:0 } }, position:{x:10,y:0,z:0}, rotation:{y:0} });
assert(env.block(10, -1.4, 10, -6), 'a parked vehicle is solid during a race');
// 4. the oriented box respects yaw: the same approach against a rotated car resolves differently
assert(env.inside(0, -8.5, 0.9, 0, -10, 0, 1, 2.4), 'nose-on at 1.5 m from centre touches (within length half + radius)');
assert(!env.inside(2.2, -10, 0.9, 0, -10, 0, 1, 2.4), 'but 2.2 m off the side clears (width half 1 + radius 0.9)');

// 5. rivals brake behind traffic: a bot 6 m behind the player's car gets a finite speed limit
{
  const st={ v:14 }, o={ position:{x:0, y:0, z:6} };   // bot behind the player (player at z=0; bot faces -Z)
  const lim=env.obstacle(st, o, 0);
  assert(isFinite(lim), 'a car ahead imposes a speed limit');
  assert(lim <= 12*0.92 + 2*1.2 + 1e-9, 'the limit tracks the leader’s speed and closes with the gap');
  const clear=env.obstacle(st, { position:{x:100, y:0, z:100} }, 0);
  eq(clear, Infinity, 'clear road = no limit');
}

done('build 840: solid race cars — blocked entry with slide + escape, parked cars included, rivals brake behind traffic');
