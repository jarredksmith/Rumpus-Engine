// (build 786) Driving works on a connected gamepad. Throttle/steer already came from the left stick (padMoveZ/padMoveX)
// and look from the right stick; this build wires the remaining controls: RT = boost, LT = handbrake, and while driving
// the face/D-pad edges toggle the vehicle's camera + headlights instead of firing/reloading/cycling weapons.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// --- held triggers: RT boosts, LT handbrakes (firing/ADS are gated off while driving, so reusing them is safe) ---
assert(/boostKey=\(keys\['ShiftLeft'\]\|\|keys\['ShiftRight'\]\|\|\(typeof padFiring!=='undefined'&&padFiring\)\)/.test(du), 'RT (padFiring) also engages boost');
assert(/const handbrake=\(keys\['Space'\]\|\|keys\['KeyB'\]\|\|\(typeof padAds!=='undefined'&&padAds\)\);/.test(du), 'LT (padAds) also engages the handbrake');

// --- shared toggle helpers so the pad drives the same C / V / H actions the keyboard does ---
assert(/function _carCycleView\(\)\{ if\(!drivingCar\) return; _carViewOverride = \(_carViewMode\(drivingCar\)==='cockpit'\)\?'chase':'cockpit'; \}/.test(src), 'a shared view toggle helper exists');
assert(/function _carCycleFollow\(\)\{ if\(!drivingCar\) return; _carFollowOverride = !_carFollowMode\(drivingCar\);/.test(src), 'a shared follow-cam toggle helper exists');
assert(/function _carCycleHeadlights\(\)\{ if\(!drivingCar \|\| !drivingCar\.userData\.vehicle \|\| !drivingCar\.userData\.vehicle\.headlights\) return; _carHeadOn=!_carHeadOn;/.test(src), 'a shared headlight toggle helper exists (guards on the vehicle having headlights)');

// --- pollGamepad: while driving, the edges are repurposed for the car ---
const pg = extractFunction('pollGamepad');
assert(/if\(typeof drivingCar!=='undefined' && drivingCar\)\{/.test(pg), 'pollGamepad branches on whether you are driving');
assert(/if\(edge\(3\)\) interact\(\);[\s\S]*?if\(edge\(2\)\) _carCycleHeadlights\(\);[\s\S]*?if\(edge\(1\)\) _carCycleView\(\);[\s\S]*?if\(edge\(0\)\) _carCycleFollow\(\);/.test(pg), 'driving: Y exits, X = headlights, B = view, A = follow-cam');
assert(/if\(typeof drivingCar!=='undefined' && drivingCar\)\{[\s\S]*?padJump = false;/.test(pg), 'driving suppresses the jump edge (A is the follow-cam toggle instead)');

// --- on foot, the original mapping is intact ---
assert(/\} else \{[\s\S]*?padJump = edge\(0\);[\s\S]*?if\(edge\(2\)\) reload\(\);[\s\S]*?if\(edge\(1\)\) throwGrenade\(\);[\s\S]*?if\(edge\(5\)\) cycleWeapon\(1\);/.test(pg), 'on foot keeps jump / reload / grenade / weapon-cycle');

done('build 786: car/driving controls fully wired for a gamepad');
