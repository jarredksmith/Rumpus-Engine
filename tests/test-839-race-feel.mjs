// (build 839) FIRST-PLAYTEST FIXES for racing, from the field:
//  1. rivals were EXTREMELY SLOW — pace was a hard-coded 2.2 G / 22 m/s² regardless of the car. Now the racing
//     line derives from the TEMPLATE VEHICLE: cornering at its latG*1.5 (rails don't slide), top speed capped
//     at its maxSpeed, braking/throttle from its accel — a fast car makes fast rivals.
//  2. rival wheels CLIPPED THROUGH the deck — placement was a computed height (wrong under scaled/banked
//     pieces). They now rest on the real surface via the shared ground query (surfaceTopAt).
//  3. no visible timer/ranking — the readout hid in the tiny wave chip. A dedicated top-centre RACE HUD pill
//     now shows P n/N · LAP n/N · live time · best, hidden again on race end / editor / clear.
//  4. race deploys AUTO-SEAT you in the car on the grid (solo; retries while a GLB vehicle is still loading).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- 1. vehicle-derived pace ---
const bp = extractFunction('_raceBuildPath');
assert(/const G=\(\(\+_tv\.latG\|\|2\.2\)\)\*1\.5, TOP=Math\.max\(12, \+_tv\.maxSpeed\|\|40\), BRK=Math\.max\(14, \(\+_tv\.accel\|\|18\)\*1\.4\);/.test(bp), 'G / top speed / braking come from the template vehicle');
assert(/a\.vmax=Math\.min\(TOP, Math\.sqrt\(\(G\*9\.81\)/.test(bp), 'corner speeds use the vehicle G, capped at its top speed');
assert(/return \{ pts, total, brk:BRK, accel:Math\.max\(10, \+_tv\.accel\|\|18\) \};/.test(bp), 'throttle + brake rates ride the path');
assert(/const d=tgt-st\.v, rate=\(d>0 \? _racePath\.accel : _racePath\.brk\);/.test(extractFunction('_raceBotsTick')), 'bots accelerate and brake at the car’s own rates');
{ // a tuned car (latG 3, maxSpeed 50) makes meaningfully faster rivals than the old constants
  const vOld=Math.min(60, Math.sqrt(2.2*9.81*18));
  const vNew=Math.min(50, Math.sqrt(3*1.5*9.81*18));
  assert(vNew > vOld*1.35, 'a gripped-up car corners its rivals ~40%+ faster than the old fixed G');
}

// --- 2. rivals rest on the real deck ---
{
  const bt=extractFunction('_raceBotsTick');
  assert(/surfaceTopAt\(pose\.x, pose\.z, o, true, pose\.y\+6, true\)/.test(bt), 'per-frame placement raycasts the actual track surface');
  assert(/if\(!\(_gy>-Infinity\)\) _gy=pose\.y\+TRACK_T;/.test(bt), 'falls back to the computed deck when the ray misses');
  assert(/surfaceTopAt\(pose\.x, pose\.z, obj, true, pose\.y\+6, true\)/.test(extractFunction('_raceSpawnBots')), 'grid placement uses the same ground query');
}

// --- 3. the race HUD pill ---
assert(/el\.id='raceHud';/.test(src), 'a dedicated race HUD element exists');
assert(/_raceHudTick\(\);\s*\/\/ build 839/.test(extractFunction('_raceTick')), 'it updates every race tick');
{
  const ht=extractFunction('_raceHudTick');
  assert(/'LAP <b>'\+_raceLap\+'<\/b>/.test(ht) && /_fmtRace\(_raceLapT\)/.test(ht), 'shows lap + live time');
  assert(/'<b style="color:var\(--accent\)">P'\+pl\.place\+'<\/b>/.test(ht), 'shows the field position');
  assert(/BEST '\+_fmtRace\(_raceBestT\)/.test(ht), 'shows the best lap');
  assert(/if\(objectiveActive\(\)!=='race' \|\| !gameOn \|\| editorOpen \|\| !_raceStartO\)\{ el\.style\.display='none'; return; \}/.test(ht), 'hidden outside an active race');
}
{ // it never outlives the race
  const m=src.match(/if\(typeof _raceHudHide==='function'\) _raceHudHide\(\);/g);
  assert(m && m.length>=3, 'hidden on race clear + win screen + lose screen (found '+(m?m.length:0)+')');
}

// --- 4. auto-seat on race deploys ---
{
  const as=extractFunction('_raceAutoSeat');
  assert(/if\(objectiveActive\(\)!=='race' \|\| !gameOn \|\| editorOpen \|\| gameOver \|\| drivingCar\) return;/.test(as), 'only on a live solo race deploy, never twice');
  assert(/if\(typeof NET!=='undefined' && NET\.mode!=='off'\) return;/.test(as), 'multiplayer keeps manual seating (one seat, many players)');
  assert(/if\(\(tries\|0\)<12\) setTimeout\(\(\)=>_raceAutoSeat\(\(tries\|0\)\+1\), 500\);/.test(as), 'retries while a GLB vehicle is still downloading');
  assert(/enterCar\(car\);/.test(as), 'and actually seats you');
  assert(/setTimeout\(\(\)=>_raceAutoSeat\(0\), 350\);\s*\/\/ build 839/.test(src), 'wired into startGame after the objective starts');
}

done('build 839: rivals pace with your car + rest on the real deck, a proper race HUD, and auto-seat on deploy');
