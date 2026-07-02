// (build 826) RAMP CLIPPING — cars sank into ramp/slab faces instead of riding up them. Two causes, both fixed:
//  1. The vertical climb budget floored on THIS-FRAME displacement (0.05m). At a ramp LIP the nose stalls forward progress
//     for a single frame, the budget collapsed to that floor, and the chassis was held BELOW the surface — the slab mesh
//     then poked up through the car (the clip). Now the budget takes max(displacement*1.3, carriedSpeed*dt*1.15): momentum
//     persists across the stalled frame so the car keeps climbing. A wall still zeroes it (blocked motion -> _horiz 0, and
//     the bonk bleeds carSpeed to ~10%), so the anti-wall-climb guard is intact.
//  2. Body PITCH eased to the slope at dt*9 — ~7 frames of lag, so the nose stayed flat and dug into the incline on the way
//     up. Pitch now tracks at dt*14 (roll stays dt*9 so a sideways wall only leans the body, never snaps it).
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// --- 1. momentum-scaled climb budget ---
assert(/const _spd=Math\.abs\(o\.userData\.carSpeed\|\|0\);/.test(du), 'the climb budget reads carried speed (momentum)');
assert(/const _budget=\(_horiz>0\.015 \? Math\.max\(_horiz\*1\.3, _spd\*dt\*1\.15\) : 0\);/.test(du), 'budget = max(this-frame displacement, carried momentum); zero the instant motion is blocked');
assert(/if\(_rest > _cy \+ _budget\) _rest = _cy \+ _budget;/.test(du), 'the rest height is still capped by the budget');

// executable: the lip case (stalled displacement, retained speed) vs the wall case (blocked)
{
  const budget=(mvx,mvz,spd,dt=1/60)=>{ const h=Math.hypot(mvx,mvz); return (h>0.015? Math.max(h*1.3, spd*dt*1.15) : 0); };
  assert(budget(0,0,25) === 0, 'a blocked car (mvx=mvz=0) gets ZERO budget however fast it was going — the wall guard holds');
  assert(budget(0.02,0,18) > 0.25, 'at a lip: tiny displacement but 18 m/s carried keeps a real climb budget open (no clip)');
  const norm=budget(0.30,0,18);   // normal driving: displacement dominates
  assert(Math.abs(norm-0.30*1.3) < 1e-9, 'normal driving is unchanged — displacement*1.3 dominates when travel is flowing');
}

// --- 2. faster pitch tracking, gentle roll ---
assert(/const _kp=Math\.min\(1, dt\*14\), _kr=Math\.min\(1, dt\*9\);/.test(du), 'pitch tracks the ramp slope faster (dt*14); roll stays gentle (dt*9)');
assert(/o\.userData\.carPitch=\(o\.userData\.carPitch\|\|0\)\+\(_tp-\(o\.userData\.carPitch\|\|0\)\)\*_kp;/.test(du), 'pitch eases at the faster rate');
assert(/o\.userData\.carRoll =\(o\.userData\.carRoll \|\|0\)\+\(_tr-\(o\.userData\.carRoll \|\|0\)\)\*_kr;/.test(du), 'roll eases at the gentle rate (a wall only leans it)');

done('build 826: ramp anti-clip — momentum climb budget + faster nose tracking');
