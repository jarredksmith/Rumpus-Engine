// (build 831) RACE objective — laps around a track-builder course. The Start-line piece is the lap line;
// EVERY placed track piece is an implicit checkpoint, and a lap only counts with >=60% of pieces visited
// (no cutting the infield). Crossing the checkered band moving FORWARD starts the race; win at raceLaps.
// Per-lap clock with last/best in the HUD; races spawn no enemies (noEnemyMode); raceLaps is serialized and
// restored by both level loaders.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- wiring: 8th objective, clean grid, config plumbed everywhere ---
assert(/function noEnemyMode\(\)\{ return objectiveActive\(\)==='puzzle' \|\| objectiveActive\(\)==='race'; \}/.test(src), 'race spawns no enemies');
assert(/obBtn\('race',_icn\('route'\)\+'Race'\)/.test(src), 'the Rules tab has a Race objective button');
assert(/raceLaps: \(savedLevel && savedLevel\.game && savedLevel\.game\.raceLaps!=null\) \? savedLevel\.game\.raceLaps : 3,/.test(src), 'raceLaps boots from the saved level (default 3)');
assert(/surviveSecs: gameCfg\.surviveSecs, raceLaps: gameCfg\.raceLaps,/.test(src), 'raceLaps is serialized with the level');
{
  const m=src.match(/gameCfg\.raceLaps = level\.game\.raceLaps!=null \? level\.game\.raceLaps : 3;/g);
  assert(m && m.length===2, 'both level loaders restore raceLaps (found '+(m?m.length:0)+')');
}
assert(/if\(objectiveActive\(\)==='race'\) _raceSetup\(\); else _raceClear\(\);/.test(src), 'startObjective snapshots the course');
assert(/else if\(objectiveActive\(\)==='race'\)\{\s*\n\s*_raceTick\(dt\);/.test(src), 'objectiveTick drives the race');
assert(/gameCfg\.objective==='race' \? \(\(gameCfg\.raceLaps\|\|3\)\+' LAP'/.test(src), 'the win screen shows laps + best time');
assert(/'PLACE A START LINE'/.test(src) && /'CROSS THE START LINE'/.test(src), 'the HUD guides: no start piece / not started yet');

// --- run the real race machine: setup + tick against a simulated 4-curve circle course ---
const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
const raceStart=src.indexOf('let _raceLap=0'), raceEnd=src.indexOf('function startObjective()');
assert(raceStart>0 && raceEnd>raceStart, 'race state block found');
const env = new Function('"use strict";'+
  src.slice(defsStart, defsEnd)+'\n'+src.slice(raceStart, raceEnd)+'\n'+extractFunction('_trackExitPose')+`
  const propModels=[], player={pos:{x:0,y:0,z:0}}, gameCfg={raceLaps:2};
  let won=0; const toasts=[];
  const gameWon=()=>{ won++; }, toast=(t)=>toasts.push(t), objectiveHUD=()=>{};
  // build 832-834 additions touch the DOM / storage / the driven car — stub them for the headless sim
  const document={ getElementById:()=>null, createElement:()=>({style:{},textContent:'',appendChild(){}}), body:{appendChild(){}} };
  const SFX={}, drivingCar=null, localStorage={ getItem:()=>null, setItem(){} }, scene={ remove(){}, add(){} };
  const colliders=[], spawnProp=()=>{}, isModelSrc=()=>false, _modelRelease=()=>{};
  const _carEuler={set(){}}, _carQuat={setFromEuler(){}}, _carModelQ={setFromAxisAngle(){}}, _UP_Y={}, _updateWheels=()=>{};
  const THREE={ Box3:class{ setFromObject(){return this;} isEmpty(){return true;} }, Color:class{ constructor(){} lerp(){} } };
  const RAD=Math.PI/180;
  // build a closed 4x90-left circle: start line + 3 curves... the start piece must chain too, so:
  // start(12) -> short(8)? keep EXACT closure: 4 x curve_l alone closes; prepend a start line and close with
  // matching straights: start(12), curve, curve, straight(12)? 12+? Use: start(12) then 4 curves then... the
  // clean exact loop: [start? no] — simplest EXACT closed loop incl. a start piece:
  // start(12), curve_l, curve_l, straight(24), short(8)? Instead: place start + 4 curves and DON'T require
  // geometric closure (the race logic doesn't) — checkpoints + the lap plane are all that matter.
  let pose={x:0,y:0,z:0,yaw:0};
  const place=(k)=>{ const o={position:{x:pose.x,y:pose.y,z:pose.z}, rotation:{y:pose.yaw}, scale:{x:1,y:1,z:1}, userData:{src:k}}; propModels.push(o); pose=_trackExitPose(o); return o; };
  place('track_start'); place('track_curve_l'); place('track_curve_l'); place('track_curve_l'); place('track_curve_l');
  _raceSetup();
  return { _raceSetup, _raceTick, _raceCk, propModels, player, gameCfg,
    state:()=>({ lap:_raceLap, lapT:_raceLapT, last:_raceLastT, best:_raceBestT, visited:_raceVisited.size, start:!!_raceStartO, won, toasts }),
    drive:(pts, dt)=>{ for(const p of pts){ player.pos.x=p[0]; player.pos.y=p[1]||0; player.pos.z=p[2]; _raceTick(dt==null?0.1:dt); } },
    ck:_raceCk };
`)();

// setup: found the start piece + one checkpoint per placed piece
assert(env.state().start, 'the start-line piece was found');
eq(env.ck.length, 5, 'every track piece is a checkpoint');

// the lap plane on an unrotated start piece at origin: z = -16*0.18 = -2.88 (build 837: 16 m start), road half-width 7
const PLANE=-2.88;
// approach from behind the line (z>plane) and cross forward (z decreasing): the race starts
env.drive([[0,0,6],[0,0,3],[0,0,0],[0,0,-3]]);
eq(env.state().lap, 1, 'crossing the band forward starts lap 1');
near(env.state().lapT, 0.1, 0.2, 'the lap clock starts near zero');

// drive the course: hit every checkpoint (the 4 curve midpoints + the start piece's own mid)
for(const k of env.ck) env.drive([[k.x, 0, k.z]], 0.5);
assert(env.state().visited >= 4, 'driving the course visits the checkpoints');

// come around and cross again (a long settle tick clears the 3 s crossing cooldown): lap 2 begins
env.drive([[0,0,6]], 4);                        // behind the line, cooldown cleared
env.drive([[0,0,2],[0,0,-4]], 0.5);             // forward through the plane (z -2.16)
eq(env.state().lap, 2, 'a valid crossing closes lap 1 and starts lap 2');
assert(env.state().last > 0 && isFinite(env.state().best), 'last + best lap times recorded');

// shortcut attempt: cross again immediately WITHOUT revisiting checkpoints -> lap does not count
env.drive([[0,0,6]], 4);                        // clear the cooldown, back behind the line
env.drive([[0,0,2],[0,0,-4]], 0.5);
eq(env.state().lap, 2, 'cutting the course does not close a lap');
assert(env.state().toasts.some(t=>/not counted/i.test(t)), 'the player is told the lap was voided');

// now do it properly: visit the course, cross -> that was the final lap (raceLaps=2) -> WIN
for(const k of env.ck) env.drive([[k.x, 0, k.z]], 0.5);
env.drive([[0,0,6]], 4);
env.drive([[0,0,2],[0,0,-4]], 0.5);
eq(env.state().won, 1, 'completing the last lap wins the race');

// reverse crossings never trigger: settle behind the plane, then drive backwards over the line
{
  const before=env.state().lap;
  env.drive([[0,0,-6]], 4);
  env.drive([[0,0,-4],[0,0,2],[0,0,6]], 0.5);   // backwards (z increasing through the plane)
  eq(env.state().lap, before, 'crossing the line backwards does nothing');
}

done('build 831: race objective — lap line + per-piece checkpoints + lap clock, anti-shortcut, win at N laps');
