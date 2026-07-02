// (build 825) REALISTIC BRAKING — the old model treated S-while-moving-forward as "accelerate toward reverse" at a hard
// 1.6x accel, so a tap of the brake slammed the car to a dead stop and then shot it backwards. Now braking is its OWN
// force: pressing against your direction of travel decelerates you to a stop (with real distance, tapering off the last
// ~2 m/s so it settles instead of jerking) and NEVER overshoots into reverse — reverse only engages once you've stopped.
// Per-vehicle Braking tunable (0.2..3, default 1) wired app -> drive -> serialize -> editor.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const ds = extractFunction('driveStep');

// --- the new braking branch exists and is gated on the input opposing travel ---
assert(/const braking = \(throttle > 0\.01 && sp < -0\.2\) \|\| \(throttle < -0\.01 && sp > 0\.2\);/.test(ds), 'braking = input opposes the current direction of travel');
assert(/const _bm=\(cfg\.brake==null\?1:cfg\.brake\);/.test(ds), 'driveStep reads the per-vehicle Braking multiplier (default 1)');
assert(/Math\.max\(0\.28, Math\.min\(1, Math\.abs\(sp\)\/2\)\)/.test(ds), 'the last ~2 m/s taper (ABS-like settle) is present');

// --- executable: run the real driveStep and check the FEEL ---
const fn = new Function('speed','throttle','steer','cfg','dt', 'Math', '"use strict";' +
  ds.replace(/^function driveStep\([^)]*\)\s*\{/, '').replace(/\}\s*$/, '') + '\n;return driveStep(speed,throttle,steer,cfg,dt);');
const step = (speed, throttle, cfg, dt=1/60) => fn(speed, throttle, 0, cfg, dt, Math).speed;
const cfg = { maxSpeed:40, accel:20, reverse:8, turn:120 };

// 1. braking from forward motion NEVER crosses into reverse in a single frame — it clamps at 0
{
  let sp = 3;                    // rolling forward slowly
  sp = step(sp, -1, cfg);       // full brake
  assert(sp >= 0, 'braking cannot shove the car backwards — it stops at 0, never overshoots into reverse (sp='+sp.toFixed(3)+')');
}

// 2. braking has DISTANCE: from 30 m/s a hard brake takes clearly longer than the old accel*1.6 instant stop
{
  let sp = 30, frames = 0;
  while(sp > 0.1 && frames < 600){ sp = step(sp, -1, cfg); frames++; }
  const secs = frames/60;
  // old model: 30 / (20*1.6) ≈ 0.94s. New default (~1x accel + taper) is meaningfully longer.
  assert(secs > 1.4, 'a 30 m/s stop takes real time now, not ~0.9s (got '+secs.toFixed(2)+'s)');
  assert(secs < 4.0, 'but still a purposeful stop, not a coast (got '+secs.toFixed(2)+'s)');
}

// 3. once STOPPED, holding the same input engages reverse (accelerates the other way)
{
  let sp = 0;
  for(let i=0;i<20;i++) sp = step(sp, -1, cfg);
  assert(sp < -1, 'held brake past a stop -> reverse engages and builds speed (sp='+sp.toFixed(2)+')');
  assert(sp >= -cfg.reverse-1e-6, 'reverse is capped at the reverse speed');
}

// 4. the Braking multiplier scales stopping power: 0.3 = long lazy stop, 3 = race stoppers
{
  const dist = (bm)=>{ let sp=30, d=0; for(let i=0;i<600 && sp>0.1;i++){ d+=sp*(1/60); sp=step(sp,-1,{...cfg,brake:bm}); } return d; };
  assert(dist(0.3) > dist(3), 'weaker brakes travel farther before stopping ('+dist(0.3).toFixed(1)+'m vs '+dist(3).toFixed(1)+'m)');
}

// 5. throttle and coast are unchanged — accelerate toward top speed, and lifting off coasts down
{
  eq(step(0, 1, cfg) > 0, true, 'throttle accelerates forward');
  let sp=20; sp=step(sp, 0, cfg); assert(sp<20 && sp>18, 'no input coasts (gentle), not a hard stop');
}

// --- vehicleApply sanitizes brake to [0.2,3], default 1 ---
const va = extractFunction('vehicleApply');
assert(/brake:\(v\.brake==null\?1:Math\.max\(0\.2, Math\.min\(3, \+v\.brake\|\|0\)\)\),/.test(va), 'vehicleApply clamps brake to [0.2,3] default 1');

// --- serialized only when non-default, and an editor slider + hint ---
assert(/if\(V\.brake!=null && V\.brake!==1\) e\.veh\.brake=V\.brake;/.test(src), 'brake serialized only when it differs from default');
assert(/row\('Braking','brake', 0\.2, 3, 0\.05, 1\);/.test(src), 'the editor has a Braking slider (0.2..3)');
assert(/<b>Braking<\/b> — how hard the brakes bite/.test(src), 'the Braking slider has an explanatory hint');

// --- brake lights glow only when actually braking (input opposes travel) or on the handbrake ---
assert(/_updateBrakeLights\(o, cfg, \(handbrake \|\| \(throttle<-0\.01 && r\.speed>0\.2\) \|\| \(throttle>0\.01 && r\.speed<-0\.2\)\)\);/.test(src), 'brake lights track true braking, not any reverse throttle');

done('build 825: braking is its own force — real stopping distance, no reverse overshoot, tunable + brake-light wiring');
