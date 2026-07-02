// (build 821) Spring-damper suspension. The rigid chassis solve stays authoritative (walls / ramps / trailers depend on
// it); the body rides a slightly under-damped spring ON TOP — landings compress and rebound, kerbs kick the body up and
// it settles, instead of the old glued snap. Physics reads the CLEAN height (offset stripped); render+camera get the
// sprung one. Per-vehicle "Suspension" tunable (0 = rigid, 2 = soft).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// clean-height separation
assert(/const _cy=o\.position\.y - \(o\.userData\._suspOff\|\|0\);/.test(du), 'the vertical solve reads the CLEAN chassis height');
assert(/o\.position\.y=_ny \+ _sOff;/.test(du), 'the rendered height = clean chassis + suspension travel');

// the spring
assert(/const _sK=120, _sC=11;/.test(du), 'under-damped spring (one honest, visible rebound)');
assert(/_sVel \+= \(-_sK\*_sOff - _sC\*_sVel\)\*dt; _sOff \+= _sVel\*dt;/.test(du), 'semi-implicit spring-damper integration');
assert(/const _sMax=Math\.max\(0\.06, _h\.hh\*0\.3\);/.test(du), 'travel is clamped to a fraction of the body height');

// excitation: landings compress, kerbs kick up — both scaled by the per-vehicle amount
assert(/o\.userData\._suspVel=\(o\.userData\._suspVel\|\|0\) - Math\.min\(-_impVy,20\)\*0\.14\*_sAmt;/.test(du), 'a landing drives the springs down');
assert(/if\(_grounded && _climb>1\.5 && _climb<22\) o\.userData\._suspVel=\(o\.userData\._suspVel\|\|0\) \+ Math\.min\(_climb,10\)\*0\.05\*_sAmt;/.test(du), 'a kerb/bump kicks the body up');

// executable: the spring compresses, rebounds past zero once, then settles (under-damped, stable)
{
  const K=120, C=11, dt=1/60;
  let off=0, vel=-2.0;   // a landing hit
  let minOff=0, crossed=false, frames=0;
  for(let i=0;i<240;i++){ vel += (-K*off - C*vel)*dt; off += vel*dt; minOff=Math.min(minOff,off); if(off>0.004) crossed=true; frames++; }
  assert(minOff < -0.05, 'the landing compresses the body');
  assert(crossed, 'it rebounds past neutral once (reads as suspension, not a cushion)');
  near(off, 0, 0.004, 'and settles back to neutral within 4 seconds');
}

// lifecycle hygiene: settled on enter, folded out on exit, cleared on editor reset
assert(/o\.userData\._suspOff = 0; o\.userData\._suspVel = 0;\s*\/\/ build 821: suspension starts settled/.test(extractFunction('enterCar')), 'entering starts settled');
assert(/if\(o\.userData\._suspOff\)\{ o\.position\.y -= o\.userData\._suspOff; o\.userData\._suspOff=0; o\.userData\._suspVel=0; \}/.test(extractFunction('exitCar')), 'exiting folds the travel out (clean parked height)');

// wiring
assert(/susp:\(v\.susp==null\?1:Math\.max\(0, Math\.min\(2, \+v\.susp\|\|0\)\)\),/.test(extractFunction('vehicleApply')), 'susp sanitized to [0,2], default 1');
assert(/if\(V\.susp!=null && V\.susp!==1\) e\.veh\.susp=V\.susp;/.test(src), 'serialized when non-default');
assert(/row\('Suspension','susp', 0, 2, 0\.05, 1\);/.test(src), 'editor slider present');

done('build 821: spring-damper suspension — landings and kerbs compress and rebound');
