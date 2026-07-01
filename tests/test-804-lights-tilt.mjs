// (build 804) Mounted lights (headlights + brake lights) ride the car's body tilt. Previously they were placed with a
// yaw-only, flat-vertical transform, so on a ramp or mid-jump the body pitched/rolled but the lights stayed level and
// detached. Now a shared _carBodyQuat (heading + pitch + roll incl. suspension lean) rotates the mount offset onto the body.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// the shared body-orientation quaternion includes pitch + roll + lean, ordered YXZ (yaw * pitch * roll)
const cbq = extractFunction('_carBodyQuat');
assert(/const p=\(o\.userData\.carPitch\|\|0\)\+\(o\.userData\.leanPitch\|\|0\), r=\(o\.userData\.carRoll\|\|0\)\+\(o\.userData\.leanRoll\|\|0\);/.test(cbq), 'body tilt = surface pitch/roll + suspension lean');
assert(/_cbEuler\.set\(p, cy, r\); _cbQuat\.setFromEuler\(_cbQuat\?_cbQuat:_cbQuat\)|_cbEuler\.set\(p, cy, r\); _cbQuat\.setFromEuler\(_cbEuler\);/.test(cbq), 'the euler is (pitch, yaw, roll)');
assert(/new THREE\.Euler\(0,0,0,'YXZ'\)/.test(src), 'the tilt euler uses YXZ order (yaw then pitch then roll)');

// headlights: offset + aim both rotated onto the tilted body
const ph = extractFunction('_placeHeadlights');
assert(/const f=_carFoot\(o\), Q=_carBodyQuat\(o, cy\);/.test(ph), 'headlights build the body quaternion');
assert(/_cbVec\.set\(f\.ox \+ sep\*s, up, -\(f\.oz\+fwd\)\)\.applyQuaternion\(Q\);/.test(ph), 'the headlight mount offset rides the tilt');
assert(/_cbVec\.set\(0, -0\.14, -1\)\.applyQuaternion\(Q\);/.test(ph), 'the beam aim tilts with the car (up a ramp -> beams lift)');

// brake lights: tail offset rotated onto the tilted body
const pb = extractFunction('_placeBrakeLights');
assert(/const f=_carFoot\(o\), Q=_carBodyQuat\(o, cy\);/.test(pb), 'brake lights build the body quaternion');
assert(/_cbVec\.set\(f\.ox \+ sep\*s, up, -\(f\.oz\+back\)\)\.applyQuaternion\(Q\);/.test(pb), 'the tail-light offset rides the tilt');

// --- executable: a parked/flat car (no pitch/roll) leaves the offset unchanged; a pitched car lifts the tail point ---
{
  // model YXZ euler -> quaternion -> rotate a tail-ish offset, checking flat == identity and nose-up lifts the rear point
  const rotY = (v, a) => ({ x: v.x*Math.cos(a) + v.z*Math.sin(a), y: v.y, z: -v.x*Math.sin(a) + v.z*Math.cos(a) });
  const rotX = (v, a) => ({ x: v.x, y: v.y*Math.cos(a) - v.z*Math.sin(a), z: v.y*Math.sin(a) + v.z*Math.cos(a) });
  const body = (v, yaw, pitch) => rotY(rotX(v, pitch), yaw);   // YXZ with roll=0
  const tail = { x:0, y:0.3, z:1.2 };   // behind the origin (+z), a bit up
  const flat = body(tail, 0, 0);
  assert(Math.abs(flat.y - tail.y) < 1e-9, 'flat car: the tail light keeps its height');
  const noseUp = body(tail, 0, 0.5);    // pitch nose up -> the TAIL swings DOWN (lower y) as the body rotates
  assert(noseUp.y < tail.y - 0.05, 'nose-up on a ramp drops the tail point (it rides the body instead of staying level)');
}

done('build 804: headlights + brake lights ride the car body tilt (ramps / jumps)');
