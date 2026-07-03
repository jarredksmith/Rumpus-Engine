// (build 833) AI RIVALS — bot drivers on the track-builder course. The ordered chain is rebuilt by walking
// exit->entry socket matches from the start line; a CLOSED loop's centreline becomes the racing line (per-point
// tangent/slope + corner speeds from the same 2.2-G lateral model as the player car, smoothed backwards so
// rivals brake BEFORE corners). Bots are kinematic clones of the level's vehicle — tinted, spliced out of
// colliders/propModels (never block, never serialize, can't be entered) — that hold the grid until GO, race
// the line with per-bot pace, and END THE RACE if they finish first (RACE LOST screen). HUD shows P n/N.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- wiring pins ---
assert(/raceBots: gameCfg\.raceBots, raceBotSkill: gameCfg\.raceBotSkill,/.test(src), 'rival count + pace serialized with the level');
{ const m=src.match(/gameCfg\.raceBots = level\.game\.raceBots!=null \? level\.game\.raceBots : 3; gameCfg\.raceBotSkill = level\.game\.raceBotSkill!=null \? level\.game\.raceBotSkill : 0\.85;/g);
  assert(m && m.length===2, 'both loaders restore rival config (found '+(m?m.length:0)+')'); }
assert(/rrow\('AI rivals','0','6','1'/.test(src) && /rrow\('Rival pace','0\.4','1\.3','0\.05'/.test(src), 'Rules tab has rival count + pace rows');
assert(/_raceBotsTick\(dt\);/.test(extractFunction('_raceTick')), 'the race tick drives the rivals');
assert(/_racePath=_raceBuildPath\(\);/.test(extractFunction('_raceSetup')) && /if\(\(gameCfg\.raceBots\|0\)>0\) _raceSpawnBots\(\);/.test(extractFunction('_raceSetup')), 'deploy builds the line + grids the field');
assert(/if\(typeof _raceClearBots==='function'\) _raceClearBots\(\);\s*\/\/ build 833: rivals are runtime-only/.test(extractFunction('toggleEditor')), 'opening the editor removes the rivals');
assert(/'RACE LOST' : 'TERMINATED'/.test(src) && /'A RIVAL FINISHED FIRST'/.test(src), 'losing the race gets its own end screen');
assert(/\(_pl\?\('P'\+_pl\.place\+'\/'\+_pl\.field\+' · '\):''\)/.test(src), 'the HUD shows the live position in the field');
{ const sb=extractFunction('_raceSpawnBots');
  assert(/const ci=colliders\.indexOf\(obj\); if\(ci>=0\) colliders\.splice\(ci,1\);/.test(sb), 'rivals never block rays/physics');
  assert(/const pi=propModels\.indexOf\(obj\); if\(pi>=0\) propModels\.splice\(pi,1\);/.test(sb), 'rivals never serialize or get picked'); }

// --- executable: run the real path builder + bot physics on a closed stadium course ---
const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
const raceStart=src.indexOf('let _raceLap=0'), raceEnd=src.indexOf('function startObjective()');
const env=new Function(`"use strict";
  const RAD=Math.PI/180;
  const document={ getElementById:()=>null, createElement:()=>({style:{},textContent:"",appendChild(){}}), body:{appendChild(){}} };
  const SFX={}, scene={ remove(){}, add(){} };
  const colliders=[], propModels=[];
  const player={pos:{x:0,y:0,z:0}};
  const gameCfg={raceLaps:1, raceBots:2, raceBotSkill:0.9};
  let ended=0; const toasts=[];
  const endGame=()=>{ ended++; }, gameWon=()=>{}, toast=(t)=>toasts.push(t), objectiveHUD=()=>{};
  const isModelSrc=()=>false, _modelRelease=()=>{};
  const _carEuler={set(){}}, _carQuat={setFromEuler(){}}, _carModelQ={setFromAxisAngle(){}}, _UP_Y={};
  const _updateWheels=()=>{};
  const THREE={ Box3:class{ setFromObject(){ return this; } isEmpty(){ return true; } },
                Color:class{ constructor(){} lerp(){} } };
  const _mkObj=()=>({ position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
    rotation:{y:0,set(x,y,z){this.y=y;}},
    quaternion:{ copy(){ return this; }, multiply(){ return this; } },
    scale:{x:1,y:1,z:1}, userData:{}, updateMatrixWorld(){}, traverse(){} });
  const spawnProp=(s,t,cb)=>{ const o=_mkObj(); o.userData.src=s; colliders.push(o); propModels.push(o); cb(o); };
`
+src.slice(defsStart, defsEnd)+'\n'+extractFunction('_trackExitPose')+'\n'+src.slice(raceStart, raceEnd)+`
  // closed stadium: start(12) -> 2x90L -> straight scaled to 12 m -> 2x90L, closing exactly on the start entry
  let pose={x:0,y:0,z:0,yaw:0};
  const place=(k,sz)=>{ const o=_mkObj(); o.userData.src=k; o.position.x=pose.x; o.position.y=pose.y; o.position.z=pose.z; o.rotation.y=pose.yaw; if(sz) o.scale.z=sz; propModels.push(o); pose=_trackExitPose(o); return o; };
  place('track_start'); place('track_curve_l'); place('track_curve_l'); place('track_straight', 16/24); place('track_curve_l'); place('track_curve_l');   // build 837: the start line is 16 m, so the back straight scales to match
  // the vehicle the rivals clone
  propModels.push({ userData:{ vehicle:{ modelYaw:0, wheels:'' } }, scale:{x:1,y:1,z:1}, position:{x:0,y:0,z:0}, rotation:{y:0} });
  _raceSetup();
  return { path:()=>_racePath, bots:_raceBots, inProps:(o)=>propModels.includes(o),
    tick:(dt)=>_raceBotsTick(dt),
    setCount:(t)=>{ _raceCountT=t; },
    over:()=>_raceOver, ended:()=>ended,
    place:()=>_racePlace(),
    breakLoop:()=>{ propModels.splice(3,1); _raceSetup(); return _racePath; } };
`)();

// 1. the loop closes: a racing line exists with the right length (12+12 straights + 4 quarter-circles of r18)
const P=env.path();
assert(P, 'the closed course yields a racing line');
near(P.total, 32 + 4*(Math.PI/2*18), 1.5, 'path length = both 16 m straights + four quarter-circle arcs');

// 2. corner speeds are lower than straight speeds, and braking zones ramp down before corners
{
  const vs=P.pts.map(p=>p.vmax);
  const vMin=Math.min(...vs), vMaxv=Math.max(...vs);
  near(vMin, Math.sqrt(2.2*9.81*18), 1.2, 'corner speed matches lateral-G theory: sqrt(latG*g*R) for the 18 m curve');
  // this stadium's straights are only 16 m, so the brake-zone smoothing caps them at sqrt(vCorner^2 + 2*22*16)
  assert(vMaxv > vMin+8 && vMaxv <= Math.sqrt(vMin*vMin + 2*22*17)+1, 'straights are faster, but capped by the braking zone into the next corner');
  for(let i=0;i<P.pts.length;i++){ const a=P.pts[i], b=P.pts[(i+1)%P.pts.length];
    assert(a.vmax <= Math.sqrt(b.vmax*b.vmax + 2*22*a.len) + 1e-6, 'no point demands an impossible brake (entry <= sqrt(exit^2+2ad))'); }
}

// 3. two rivals gridded behind the line, spliced out of colliders/propModels
eq(env.bots.length, 2, 'two rivals on the grid');
assert(env.bots.every(st=>st.obj && !env.inProps(st.obj)), 'rival meshes are not in propModels');

// 4. grid hold: with the countdown running they do not move
env.setCount(3); env.tick(0.5);
assert(env.bots.every(st=>st.v===0), 'rivals hold at v=0 until GO');

// 5. GO: they accelerate, lap, and the first to finish ends the race exactly once
env.setCount(0);
let guard=0;
while(!env.over() && guard++<20000) env.tick(1/30);
assert(env.over(), 'a rival eventually finishes the race');
eq(env.ended(), 1, 'the race ends exactly once (RACE LOST path)');
assert(env.bots.some(st=>st.laps>=2), 'the winner wrapped the line laps+1 times (grid -> lap 1 -> finish)');

// 6. standings: the player (still parked at the start) is behind both rivals
{ const pl=env.place(); eq(pl.field, 3, 'field = player + rivals'); eq(pl.place, 3, 'parked player runs last'); }

// 7. an OPEN chain refuses to build a line (no rivals on broken tracks)
eq(env.breakLoop(), null, 'an open chain yields no racing line');

done('build 833: AI rivals — closed-loop racing line with real braking zones, gridded bots, race-lost path, standings');
