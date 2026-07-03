// (build 834) GHOST LAP — while racing, the driven car's pose is sampled at 10 Hz; a lap that sets a NEW BEST
// is saved to localStorage keyed by a FINGERPRINT of the track layout (edit the course -> old ghosts retire).
// A translucent copy of the vehicle replays the saved lap in real time against the live lap clock, vanishing
// when it finishes. It's a pure runtime actor: never in colliders/propModels, cleared with the rivals.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- wiring pins ---
assert(/_ghostRecordTick\(dt\); _ghostPlayTick\(\);/.test(extractFunction('_raceTick')), 'the race tick records + replays');
assert(/if\(_raceLapT===_raceBestT\) _ghostSave\(_raceLapT\);/.test(extractFunction('_raceTick')), 'only a NEW BEST lap becomes the ghost');
assert(/_ghostLoad\(\); if\(_ghostBest\) _ghostEnsureObj\(\);/.test(extractFunction('_raceSetup')), 'deploy restores this track’s ghost');
assert(/m\.material\.transparent=true; m\.material\.opacity=0\.3; m\.material\.depthWrite=false;/.test(extractFunction('_ghostEnsureObj')), 'the ghost is translucent');
assert(/_ghostRec\.length=0; _ghostAcc=0;\s*\n\}/.test(extractFunction('_raceClearBots')), 'clearing the field clears the recording too');

// --- executable: record -> save -> reload -> replay round trip ---
const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
const raceStart=src.indexOf('let _raceLap=0'), raceEnd=src.indexOf('function _racePlace()');
const env=new Function(`"use strict";
  const RAD=Math.PI/180;
  const store={};   // localStorage stand-in
  const localStorage={ getItem:(k)=>store[k]==null?null:store[k], setItem:(k,v)=>{ store[k]=String(v); } };
  const document={ getElementById:()=>null, createElement:()=>({style:{},textContent:"",appendChild(){}}), body:{appendChild(){}} };
  const SFX={}, scene={ remove(){}, add(){} }, colliders=[], propModels=[];
  const player={pos:{x:0,y:0,z:0}}, gameCfg={raceLaps:3};
  const toasts=[]; const toast=(t)=>toasts.push(t), objectiveHUD=()=>{}, gameWon=()=>{}, endGame=()=>{};
  const isModelSrc=()=>false, _modelRelease=()=>{}, _updateWheels=()=>{};
  let euler=null; const _carEuler={set(p,y,r){euler=[p,y,r];}}, _carQuat={setFromEuler(){}}, _carModelQ={setFromAxisAngle(){}}, _UP_Y={};
  const THREE={ Box3:class{ setFromObject(){return this;} isEmpty(){return true;} }, Color:class{ constructor(){} lerp(){} } };
  const ghostMeshes=[];
  const _mkObj=()=>({ position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}}, rotation:{y:0,set(){}},
    quaternion:{copy(){return this;},multiply(){return this;}}, scale:{x:1,y:1,z:1}, userData:{}, visible:true,
    updateMatrixWorld(){}, traverse(){} });
  const spawnProp=(s,t,cb)=>{ const o=_mkObj(); o.userData.src=s; colliders.push(o); propModels.push(o); ghostMeshes.push(o); cb(o); };
  let drivingCar=_mkObj(); drivingCar.userData={carYaw:0,carPitch:0,carRoll:0,leanPitch:0,leanRoll:0};
`+src.slice(defsStart, defsEnd)+'\n'+extractFunction('_trackExitPose')+'\n'+src.slice(raceStart, raceEnd)+`
  // a two-piece "track" for the fingerprint (start + one curve)
  const place=(k,x,z,ry)=>{ const o=_mkObj(); o.userData.src=k; o.position.x=x; o.position.z=z; o.rotation.y=ry; propModels.push(o); return o; };
  place('track_start',0,0,0); place('track_curve_l',0,-12,0);
  propModels.push({ userData:{ vehicle:{ modelYaw:0 } }, scale:{x:1,y:1,z:1} });
  return {
    key:()=>_ghostKey(),
    move:(x,z,yaw)=>{ drivingCar.position.x=x; drivingCar.position.z=z; drivingCar.userData.carYaw=yaw; },
    startLap:()=>{ _raceLap=1; _raceLapT=0; _ghostRec.length=0; _ghostAcc=0; },
    rec:(dt)=>{ _ghostRecordTick(dt); },
    setLapT:(t)=>{ _raceLapT=t; },
    save:(t)=>{ _raceBestT=t; _raceLapT=t; _ghostSave(t); },
    load:()=>{ _ghostBest=null; _ghostLoad(); return _ghostBest; },
    ensure:()=>{ _ghostEnsureObj(); return _ghostObj && _ghostObj.obj; },
    play:()=>{ _ghostPlayTick(); return { vis:_ghostObj.obj.visible, x:_ghostObj.obj.position.x, z:_ghostObj.obj.position.z, euler }; },
    recLen:()=>_ghostRec.length, toasts,
    retrack:()=>{ propModels[1].position.x=50; return _ghostKey(); } };
`)();

// 1. fingerprint: stable for the same layout, different when a piece moves
const k1=env.key(); eq(k1, env.key(), 'the track fingerprint is deterministic');
assert(/^breachGhost_/.test(k1), 'namespaced storage key');

// 2. record at 10 Hz while racing: 1 second of 60 fps ticks -> ~10-11 samples (first lands AT the line)
env.startLap();
for(let i=0;i<60;i++){ env.move(i*0.5, 0, 0.1); env.rec(1/60); }
near(env.recLen(), 10.5, 1.2, 'samples land at ~10 Hz regardless of frame rate');

// 3. a best lap saves; reloading round-trips it
env.save(42.3);
assert(env.toasts.some(t=>/NEW BEST/i.test(t)), 'the new best is announced');
const loaded=env.load();
assert(loaded && loaded.samples.length>=9 && loaded.lapT===42.3, 'the ghost persists and reloads');

// 4. playback: the translucent clone follows the recorded positions against the lap clock
assert(env.ensure(), 'the ghost mesh spawns from the level vehicle');
env.setLapT(0.05);
{ const p=env.play(); assert(p.vis, 'ghost visible mid-replay'); near(p.x, 1.5, 0.9, 'interpolates between the line sample (x=0) and the next (~x=3)'); }
env.setLapT(0.45);
{ const p=env.play(); assert(p.x>11 && p.x<16, 'follows the recorded path as the clock advances (x='+p.x.toFixed(2)+')'); }
env.setLapT(999);
{ const p=env.play(); assert(!p.vis, 'the ghost vanishes once its lap is over'); }

// 5. editing the track retires the old ghost (different fingerprint)
assert(env.retrack()!==k1, 'moving a piece changes the fingerprint — stale ghosts never replay');

done('build 834: ghost lap — 10 Hz recording, best-lap persistence keyed to the course, translucent real-time replay');
