// (build 786/789) Driving on a connected gamepad. Steering + look already came from the sticks; build 786 wired the
// action controls, and build 789 switched to a racing scheme: RIGHT TRIGGER = gas (analog), LEFT TRIGGER = boost, and
// the LEFT STICK steers ONLY (no speed). Reverse/handbrake move to A/B (held); the camera toggles move to the D-pad.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// --- gamepad throttle: RT analog = gas, A = reverse; the left stick no longer feeds speed ---
assert(/if\(typeof padDriveGas!=='undefined' && padDriveGas>0\.06\) throttle \+= padDriveGas;/.test(du), 'RT analog value is the gas');
assert(/if\(typeof padDriveRev!=='undefined' && padDriveRev\) throttle -= 1;/.test(du), 'A (padDriveRev) reverses');
assert(!/padMoveZ/.test(du), 'the left stick Y (padMoveZ) no longer drives the car — steering only');

// --- boost = LT, handbrake = B (plus keyboard + mobile buttons) ---
assert(/boostKey=\(keys\[BINDS\.sprint\]\|\|keys\['ShiftRight'\]\|\|\(typeof padDriveBoost!=='undefined'&&padDriveBoost\)\|\|\(typeof touchBoost!=='undefined'&&touchBoost\)\)/.test(du), 'LT (padDriveBoost) + mobile Boost button engage boost (sprint bind, build 910)');
assert(/const handbrake=\(keys\[BINDS\.jump\]\|\|keys\['KeyB'\]\|\|\(typeof padDriveBrake!=='undefined'&&padDriveBrake\)\|\|\(typeof touchHandbrake!=='undefined'&&touchHandbrake\)\);/.test(du), 'B (padDriveBrake) + mobile Brake button engage the handbrake (jump bind, build 910)');

// --- mobile: the virtual joystick still drives the car (throttle + steer) ---
assert(/if\(typeof touchMoveZ!=='undefined' && touchMoveZ\) throttle \+= -touchMoveZ;/.test(du), 'mobile joystick Y = throttle/reverse');
assert(/else if\(typeof touchMoveX!=='undefined' && touchMoveX\) steer-=touchMoveX;/.test(du), 'mobile joystick X = steering');
// the gamepad left stick X still steers
assert(/if\(typeof padMoveX!=='undefined' && padMoveX\) steer-=padMoveX;/.test(du), 'the gamepad left stick X steers');

// --- shared toggle helpers so the pad drives the same C / V / H actions the keyboard does ---
assert(/function _carCycleView\(\)\{ if\(!drivingCar\) return; _carViewOverride = \(_carViewMode\(drivingCar\)==='cockpit'\)\?'chase':'cockpit'; \}/.test(src), 'a shared view toggle helper exists');
assert(/function _carCycleFollow\(\)\{ if\(!drivingCar\) return; _carFollowOverride = !_carFollowMode\(drivingCar\);/.test(src), 'a shared follow-cam toggle helper exists');
assert(/function _carCycleHeadlights\(\)\{ if\(!drivingCar \|\| !drivingCar\.userData\.vehicle \|\| !drivingCar\.userData\.vehicle\.headlights\) return; _carHeadOn=!_carHeadOn;/.test(src), 'a shared headlight toggle helper exists (guards on the vehicle having headlights)');

// --- pollGamepad: while driving, set the driving state + repurpose the buttons ---
const pg = extractFunction('pollGamepad');
assert(/if\(typeof drivingCar!=='undefined' && drivingCar\)\{/.test(pg), 'pollGamepad branches on whether you are driving');
assert(/padDriveGas   = aval\(7\);/.test(pg), 'RT feeds the analog gas');
assert(/padDriveBoost = aval\(6\) > 0\.4 \|\| down\(6\);/.test(pg), 'LT feeds boost');
assert(/padDriveRev   = down\(0\);/.test(pg), 'A feeds reverse');
assert(/padDriveBrake = down\(1\);/.test(pg), 'B feeds the handbrake');
assert(/if\(edge\(3\)\) interact\(\);[\s\S]*?if\(edge\(2\)\) _carCycleHeadlights\(\);[\s\S]*?if\(edge\(12\)\) _carCycleView\(\);[\s\S]*?if\(edge\(13\)\) _carCycleFollow\(\);/.test(pg), 'driving: Y exits, X = headlights, D-pad up = view, D-pad down = follow-cam');

// --- on foot, the original mapping is intact + the driving state is cleared ---
assert(/padDriveGas = 0; padDriveRev = false; padDriveBoost = false; padDriveBrake = false;/.test(pg), 'on foot the driving state resets');
assert(/\} else \{[\s\S]*?padJump = edge\(0\);[\s\S]*?if\(edge\(2\)\) reload\(\);[\s\S]*?if\(edge\(1\)\) throwGrenade\(\);[\s\S]*?if\(edge\(5\)\) cycleWeapon\(1\);/.test(pg), 'on foot keeps jump / reload / grenade / weapon-cycle');

done('build 786/789: car/driving controls wired for a gamepad (RT gas, LT boost, stick steers only)');
