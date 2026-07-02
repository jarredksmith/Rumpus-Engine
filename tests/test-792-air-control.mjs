// (build 792) Air control on jumps — while airborne the throttle tilts the car's nose (gas = up, brake/reverse = down) so
// you can level a landing or exaggerate a jump. Hands-off, the nose auto-levels toward the flight arc (build 790). The
// tilt is bounded to ±0.9 rad around that arc so a jump can never rotate onto its roof; steering still yaws in the air.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// grounded vs airborne split
assert(/const _kp=Math\.min\(1, dt\*14\), _kr=Math\.min\(1, dt\*9\);\s*\n\s*if\(_grounded\)\{/.test(du), 'the tilt solve branches grounded vs airborne (build 826: pitch dt*14, roll dt*9)');

// airborne: throttle drives the pitch, bounded around the arc
assert(/const _arc=Math\.atan2\(_vy, Math\.max\(4,Math\.abs\(r\.speed\)\)\);/.test(du), 'the flight arc is the auto-level anchor');
assert(/let _cp=\(o\.userData\.carPitch\|\|0\) \+ throttle\*2\.2\*dt;/.test(du), 'the throttle tilts the nose (air control)');
assert(/_cp \+= \(_arc-_cp\)\*Math\.min\(1, dt\*\(Math\.abs\(throttle\)<0\.05\?3:1\.1\)\);/.test(du), 'no-input auto-levels to the arc; with input it drifts back slower so the player wins');
assert(/o\.userData\.carPitch=Math\.max\(_arc-0\.9, Math\.min\(_arc\+0\.9, _cp\)\);/.test(du), 'pitch is bounded ±0.9rad around the arc (never lands upside-down)');
assert(/o\.userData\.carRoll =\(o\.userData\.carRoll \|\|0\)\+\(0-\(o\.userData\.carRoll \|\|0\)\)\*Math\.min\(1, dt\*3\);/.test(du), 'roll eases level in the air');

// --- executable: model the airborne pitch update and check the behaviour ---
{
  const step = (carPitch, throttle, vy, speed, dt) => {
    const _arc = Math.atan2(vy, Math.max(4, Math.abs(speed)));
    let _cp = carPitch + throttle*2.2*dt;
    _cp += (_arc - _cp) * Math.min(1, dt*(Math.abs(throttle)<0.05?3:1.1));
    return Math.max(_arc-0.9, Math.min(_arc+0.9, _cp));
  };
  const dt = 1/60;
  // hands-off from a tilted pose converges toward the arc
  { let p = 0.8; const arc = Math.atan2(-8, 25); for(let i=0;i<120;i++) p = step(p, 0, -8, 25, dt); assert(Math.abs(p-arc) < 0.05, 'hands-off, the nose settles onto the flight arc'); }
  // holding gas pitches the nose UP relative to the arc, but never past +0.9
  { let p = 0; const arc = Math.atan2(-8, 25); for(let i=0;i<180;i++) p = step(p, 1, -8, 25, dt); assert(p > arc + 0.5, 'holding gas lifts the nose well above the arc'); assert(p <= arc + 0.9 + 1e-9, 'but the lift is bounded to +0.9rad (no roof landing)'); }
  // holding brake/reverse noses DOWN, bounded to -0.9
  { let p = 0; const arc = Math.atan2(4, 25); for(let i=0;i<180;i++) p = step(p, -1, 4, 25, dt); assert(p < arc - 0.5, 'holding brake drops the nose'); assert(p >= arc - 0.9 - 1e-9, 'bounded to -0.9rad'); }
}

done('build 792: air control on jumps — throttle tilts the nose, bounded around the flight arc');
