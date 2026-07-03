// (build 832) RACE-START CEREMONY — gridding up (entering a vehicle within 45 m of the start line before the
// race has begun) arms a standing start: a big 3-2-1 countdown with the THROTTLE LOCKED, then GO releases it
// (the GO second is live so a good reaction launches). Hopping out scrubs it; far from the line nothing arms
// (free practice keeps the flying start). Every lap's time is recorded and the win screen shows the breakdown
// with the best lap starred.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- wiring pins ---
assert(/if\(gameOn && typeof _raceMaybeCountdown==='function'\) _raceMaybeCountdown\(o\);/.test(extractFunction('enterCar')), 'entering a car arms the standing start');
assert(/if\(typeof _raceCountT!=='undefined' && _raceCountT>0\)\{ _raceCountT=0; _raceCountShown=''; _raceCountHide\(\); \}/.test(extractFunction('exitCar')), 'hopping out scrubs the countdown');
assert(/if\(typeof _raceCountT!=='undefined' && _raceCountT>1\) throttle=0;/.test(extractFunction('driveUpdate')), 'the grid holds the throttle until GO');
assert(/_raceCountTick\(dt\);/.test(extractFunction('_raceTick')), 'the race tick drives the countdown');
assert(/_raceTimes\.push\(_raceLapT\);/.test(extractFunction('_raceTick')), 'every completed lap time is recorded');
assert(/_raceTimes\.slice\(0,12\)\.map\(\(t,i\)=>'LAP '\+\(i\+1\)\+' — '\+_fmtRace\(t\)\+\(t===_raceBestT\?'  ★':''\)\)/.test(src), 'the win screen lists lap times with the best starred');

// --- run the countdown machine headless ---
const start=src.indexOf('let _raceLap=0'), end=src.indexOf('function _raceSetup()');
assert(start>0 && end>start, 'race state block found');
const env=new Function(`"use strict";
  const beeps=[];
  const document={ getElementById:()=>null, createElement:()=>{ const el={style:{},textContent:"",display:"",animate:null,appendChild(){}}; return el; }, body:{appendChild(){}} };
  const SFX={ coin:()=>beeps.push("beep"), wave:()=>beeps.push("GO") };
  const objectiveActive=()=>"race";
`+src.slice(start,end)+`
  _raceStartO={ position:{x:0,y:0,z:0} };
  return {
    arm:(x,z)=>{ _raceMaybeCountdown({position:{x, y:0, z}}); },
    tick:(dt)=>_raceCountTick(dt),
    locked:()=>_raceCountT>1,
    active:()=>_raceCountT>0,
    shown:()=>_raceCountShown,
    beeps,
    reset:()=>{ _raceCountT=0; _raceCountShown=''; },
    setLap:(n)=>{ _raceLap=n; },
  };`)();

// arming: near the line arms, far away doesn't, already-racing doesn't
env.arm(500, 500); assert(!env.active(), 'entering a car far from the line does NOT arm the grid');
env.arm(10, 10);   assert(env.active() && env.locked(), 'gridding up near the line arms 3-2-1 with the throttle locked');

// the sequence: 3 -> 2 -> 1 -> GO -> clear, with the throttle releasing AT the GO flash
env.tick(0.1); eq(env.shown(), '3', 'shows 3');
env.tick(1);   eq(env.shown(), '2', 'shows 2');
env.tick(1);   eq(env.shown(), '1', 'shows 1');
env.tick(1);   eq(env.shown(), 'GO!', 'flashes GO!');
assert(!env.locked(), 'throttle is LIVE during the GO flash (reaction launch)');
env.tick(1);   assert(!env.active() && env.shown()==='', 'the countdown clears after GO');
assert(env.beeps.filter(b=>b==='beep').length===3 && env.beeps.includes('GO'), 'three beeps + the GO sting');

// re-arming is blocked once the race is running
env.reset(); env.setLap(1); env.arm(10, 10);
assert(!env.active(), 'no countdown once the race has started (lap >= 1)');

done('build 832: standing start — arm near the line, 3-2-1 locked, GO releases, lap times recorded for the results');
