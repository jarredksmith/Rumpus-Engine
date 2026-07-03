// (build 836) MULTIPLAYER RACING — humans race humans. Each peer detects its OWN line crossings and lap clock
// locally (zero-latency feel) and broadcasts progress ~3x/s ({t:'race', lap, f}); the HOST arbitrates the
// finish — the first {t:'raceFin'} (or the host's own final lap) wins, exactly once, and every peer is told
// ({t:'raceOver', w, wn}): the winner sees the results screen, the rest get RACE LOST. Standings (P n/N) count
// remote racers; AI rivals sit out MP; clients run their own race tick since objectiveTick is host-only.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- wiring pins ---
assert(/if\(typeof NET!=='undefined' && NET\.mode!=='off'\) return;\s*\/\/ build 836: in multiplayer the HUMANS are the field/.test(extractFunction('_raceSpawnBots')), 'AI rivals sit out multiplayer');
assert(/if\(_raceLap>=total\)\{ objectiveHUD\(\); _raceFinishLocal\(\); return; \}/.test(extractFunction('_raceTick')), 'the final lap goes through the arbitration path');
assert(/_raceNetTick\(dt\);/.test(extractFunction('_raceTick')), 'progress broadcasts ride the race tick');
assert(/else if\(msg\.t==='race'\)\{ _raceNet\[id\]=\{ lap:msg\.lap\|0, f:\+msg\.f\|\|0 \}; for\(const cid in NET\.conns\)\{ if\(\+cid!==id\)/.test(src), 'host stores + relays racer progress');
assert(/else if\(msg\.t==='raceFin'\)\{ _raceDeclareWinner\(id\); \}/.test(src), 'host arbitrates the finish');
assert(/else if\(msg\.t==='race'\)\{ _raceNet\[msg\.from\]=\{ lap:msg\.lap\|0, f:\+msg\.f\|\|0 \}; \}/.test(src), 'clients track the other racers');
assert(/else if\(msg\.t==='raceOver'\)\{ if\(msg\.w\)\{ if\(typeof gameWon==='function'\) gameWon\(\); \} else _raceLose\(msg\.wn\); \}/.test(src), 'clients act on the verdict');
assert(/if\(isClient && !duelMode && !editorOpen && typeof objectiveActive==='function' && objectiveActive\(\)==='race' && typeof _raceTick==='function'\) _raceTick\(dt\);/.test(src), 'clients run their own race tick');

// --- executable: arbitration + standings on a simulated 3-peer race ---
const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
const raceStart=src.indexOf('let _raceLap=0'), raceEnd=src.indexOf('function _raceSetup()');
const env=new Function(`"use strict";
  const RAD=Math.PI/180;
  const document={ getElementById:()=>null, createElement:()=>({style:{},textContent:"",appendChild(){}}), body:{appendChild(){}} };
  const SFX={}, scene={ remove(){}, add(){} }, colliders=[], propModels=[];
  const player={pos:{x:0,y:0,z:0}}, gameCfg={raceLaps:2, raceBots:3};
  const sent=[];   // every message the host pushes to clients
  const NET={ mode:'host', name:'Ace', conns:{ 1:{send:(m)=>sent.push({to:1,m})}, 2:{send:(m)=>sent.push({to:2,m})} }, players:{ 1:{name:'Blur'}, 2:{name:'Crash'} } };
  let won=0, lost=0; const toasts=[];
  const gameWon=()=>{ won++; }, endGame=()=>{ lost++; }, toast=(t)=>toasts.push(t), objectiveHUD=()=>{};
  const isModelSrc=()=>false, _modelRelease=()=>{}, _updateWheels=()=>{}, spawnProp=()=>{};
  const localStorage={ getItem:()=>null, setItem(){} }, drivingCar=null;
  const _carEuler={set(){}}, _carQuat={setFromEuler(){}}, _carModelQ={setFromAxisAngle(){}}, _UP_Y={};
  const THREE={ Box3:class{ setFromObject(){return this;} isEmpty(){return true;} }, Color:class{ constructor(){} lerp(){} } };
`+src.slice(defsStart, defsEnd)+'\n'+extractFunction('_trackExitPose')+'\n'+src.slice(raceStart, raceEnd)+`
  return {
    spawnBots:()=>{ _raceSpawnBots(); return _raceBots.length; },
    prog:(id, lap, f)=>{ _raceNet[id]={lap, f}; },
    setMe:(lap)=>{ _raceLap=lap; },
    place:()=>_racePlace(),
    declare:(id)=>_raceDeclareWinner(id),
    finishLocal:()=>_raceFinishLocal(),
    netTick:(dt)=>{ _raceNetTick(dt); },
    lose:(nm)=>_raceLose(nm),
    state:()=>({ won, lost, sent:sent.slice(), winner:_raceWinner, over:_raceOver, toasts:toasts.slice() }),
  };`)();

// 1. bots refuse to spawn in MP even with raceBots=3
eq(env.spawnBots(), 0, 'no AI rivals on a multiplayer grid');

// 2. standings merge remote racers: two rivals ahead of a fresh player
env.prog(1, 2, 0.5); env.prog(2, 1, 0.1); env.setMe(1);   // me: lap 1, f≈0 (no path)
{ const p=env.place(); eq(p.field, 3, 'field = me + two humans'); eq(p.place, 3, 'both rivals ahead of me'); }

// 3. progress broadcast: host pushes {t:'race', from:0} to every client at ~3 Hz
env.netTick(0.4);
{ const races=env.state().sent.filter(x=>x.m.t==='race'); assert(races.length===2 && races.every(x=>x.m.from===0), 'host broadcasts its own progress to both clients'); }

// 4. host finish arbitration: client 1 wins -> exactly one verdict per client, host LOSES
env.declare(1);
env.declare(2);   // a second finisher changes nothing
{
  const s=env.state();
  eq(s.winner, 1, 'first finisher takes it — later ones are ignored');
  const overs=s.sent.filter(x=>x.m.t==='raceOver');
  eq(overs.length, 2, 'every client gets exactly one verdict');
  assert(overs.find(x=>x.to===1).m.w===1 && overs.find(x=>x.to===2).m.w===0, 'the winner is told they won; the other is not');
  assert(overs.every(x=>x.m.wn==='Blur'), 'the winner name rides along');
  eq(s.lost, 1, 'the host (who did not win) goes to RACE LOST');
  eq(s.won, 0, 'no false win on the host');
  assert(s.over, 'the race is flagged over');
}

// 5. a host finishing first would win outright (fresh sandbox state via a lose-reset isn't needed — assert the path)
assert(/if\(NET\.mode==='host'\) _raceDeclareWinner\(0\);/.test(src), 'the host’s own final lap goes to the same arbiter (id 0)');
assert(/if\(id===0\)\{ if\(typeof gameWon==='function'\) gameWon\(\); \} else _raceLose\(nm\);/.test(src), 'the arbiter wins the host or fails them — never both');

done('build 836: multiplayer racing — local lap detection, 3 Hz progress sync, single host-arbitrated finish, MP standings');
