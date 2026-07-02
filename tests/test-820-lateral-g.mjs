// (build 820) LATERAL-G HANDLING — the physics-informed arcade core. Three force relationships the old model lacked:
//  1. Understeer: tires hold at most latG of lateral acceleration; a = v*yawRate, so the achievable yaw rate shrinks with
//     speed and corners genuinely WIDEN at speed (the old model turned the same radius at any speed).
//  2. Traction circle: grip spent cornering isn't available to accelerate — accel scales by sqrt(1-latFrac^2).
//  3. Progressive breakaway + counter-steer: the last 15% of the limit loses rear grip (push -> slide), and steering
//     against the slide recovers 1.4x faster so drifts are catchable.
// The handbrake bypasses the yaw cap (that IS oversteer). Per-vehicle latG tunable, serialized, in the editor.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// --- 1. the yaw cap ---
assert(/const _latG=\(cfg\.latG==null\?2\.2:\+cfg\.latG\);/.test(du), 'per-vehicle lateral-G (build 823: arcade-calibrated default 2.2)');
assert(/const _maxYawRate=\(_latG\*9\.81\)\/Math\.max\(4, Math\.abs\(r\.speed\)\);/.test(du), 'max yaw rate = latG*g / v (a = v*omega)');
assert(/const _cap=Math\.max\(_maxYawRate, Math\.abs\(_wantYaw\)\*0\.35\);/.test(du) && /const _cmdYaw=handbrake\?_wantYaw:Math\.max\(-_cap, Math\.min\(_cap, _wantYaw\)\);/.test(du), 'demand clamps to the tire limit with a 35% steering floor (build 823) — understeer softens, never bricks; handbrake bypasses');
// executable: corner radius grows with speed once past the grip point (radius = v / yawRate)
{
  const maxYaw=(latG,v)=>(latG*9.81)/Math.max(4,Math.abs(v));
  const cap=(latG,v,want)=>Math.max(maxYaw(latG,v), Math.abs(want)*0.35);
  const radius=(v)=>v/Math.min(2.0 /*driver demand*/, cap(2.2, v, 2.0));
  near(radius(4), 4/2.0, 1e-9, 'slow: the driver demand rules (tight radius)');
  assert(radius(40) > radius(15)*1.5, 'fast: the corner radius grows with speed (understeer)');
  near(20/maxYaw(2.2,20), 20*20/(2.2*9.81), 1e-6, 'r = v^2/(latG*g) — the real cornering formula');
  assert(cap(2.2, 80, 2.0) >= 0.7-1e-9, 'the 35% floor keeps the wheel alive even at extreme speed');
}

// --- 2. traction circle ---
assert(/const _tc=Math\.sqrt\(Math\.max\(0\.15, 1 - Math\.pow\(o\.userData\._latFrac\|\|0, 2\)\)\);/.test(du), 'accel scale = sqrt(1-latFrac^2), floored so the car never goes inert');
assert(/accel:cfg\.accel\*1\.5\*_tc/.test(du) && /accel:cfg\.accel\*_tc/.test(du), 'both boost and normal accel pay the cornering tax');
{
  const tc=(lf)=>Math.sqrt(Math.max(0.15, 1-lf*lf));
  eq(tc(0), 1, 'straight line: full power');
  assert(tc(0.9) < 0.45, 'hard cornering: less than half the drive force');
  eq(tc(1), Math.sqrt(0.15), 'at the limit: the floor keeps a sliver of drive');
}

// --- 3. breakaway + counter-steer ---
assert(/if\(!handbrake && \(o\.userData\._latFrac\|\|0\)>0\.9\) grip \*= 1 - 0\.35\*\(\(o\.userData\._latFrac\)-0\.9\)\/0\.1;/.test(du), 'the last 10% of the limit progressively loses grip (build 823: gentler — the edge slides, never gives way)');
assert(/if\(steer!==0 && Math\.abs\(vd\)>0\.06 && Math\.sign\(steer\)===-Math\.sign\(vd\)\) grip \*= 1\.4;/.test(du), 'counter-steering recovers grip 1.4x (catchable drifts)');

// --- wiring: sanitize, serialize, editor ---
assert(/latG:\(v\.latG==null\?2\.2:Math\.max\(0\.6, Math\.min\(4, \+v\.latG\|\|0\)\)\),/.test(extractFunction('vehicleApply')), 'latG sanitized to [0.6, 4], default 2.2');
assert(/if\(V\.latG!=null && V\.latG!==2\.2\) e\.veh\.latG=V\.latG;/.test(src), 'serialized when non-default');
assert(/row\('Cornering grip \(G\)','latG', 0\.6, 4, 0\.05, 1\);/.test(src), 'editor slider present');

done('build 820: lateral-G handling — understeer, traction circle, catchable drifts');
