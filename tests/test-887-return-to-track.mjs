// (build 887) RETURN TO TRACK — "a 'return to track' message if the player is driving out of bounds…
// 3 second warning and then transport their car back… also helpful if they fall off a ledge."
// Off = nearest racing-line point more than TRACK_W/2+3.5 to the side, OR the car 3m below the line
// (ledge fall). A red countdown banner warns; at 3s the car is placed back at the LAST on-track arc
// distance with the standing-start grid recipe (ground snap, modelYaw, motion state zeroed). Verified
// headless: warn/count/respawn, quick-recovery clears without teleporting, and the ledge-fall case.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const fn = extractFunction('_raceOffTrackTick', src);

// gating: race path + driving only; countdown and game-over stand down (and clear any warning)
assert(/if\(!_racePath \|\| !drivingCar \|\| _raceCountT>0 \|\| \(typeof gameOver!=='undefined' && gameOver\)\)\{\s*\n\s*if\(_offTrackT\)\{ _offTrackT=0; _offTrackHide\(\); \}\s*\n\s*return;/.test(fn),
  'inert on foot, during the 3-2-1 start, and after game over — and the banner clears');
// the off test: lateral margin covers sample spacing; the y test catches ledge falls at lateral 0
assert(/const off = Math\.sqrt\(bd\) > \(TRACK_W\/2 \+ 3\.5\) \|\| o\.position\.y < near\.y - 3;/.test(fn),
  'off = beside the road (with sampling margin) OR fallen 3m below it');
assert(/if\(!off\)\{ _raceLastS=near\.s; if\(_offTrackT\)\{ _offTrackT=0; _offTrackHide\(\); \} return; \}/.test(fn),
  'on-track frames record the respawn point and clear the warning — driving back in time cancels everything');
// the 3-second contract
assert(/const left=Math\.max\(0, 3 - _offTrackT\);/.test(fn) && /if\(_offTrackT>=3\)\{/.test(fn), 'a full 3 seconds of warning before any teleport');
// respawn = the standing-start grid recipe at the LAST on-track spot
assert(/const pose=_racePathAt\(_raceLastS, 0\);/.test(fn), 'respawn at the last on-track arc distance (not "nearest", which could snap across a gap)');
assert(/surfaceTopAt\(pose\.x, pose\.z, o, true, pose\.y\+6, true\)/.test(fn), 'ground-snapped like the grid placement');
assert(/o\.rotation\.set\(0, pose\.yaw - \(\(\(o\.userData\.vehicle&&o\.userData\.vehicle\.modelYaw\)\|\|0\)\*RAD\), 0\);/.test(fn), 'faces down the course, honouring the model yaw offset');
assert(/o\.userData\.carSpeed=0; o\.userData\.carVelY=0; o\.userData\.carPitch=0; o\.userData\.carRoll=0;/.test(fn) && /o\.userData\._suspOff=0; o\.userData\._suspVel=0;/.test(fn),
  'motion + suspension state zeroed (no phantom momentum or drift after the teleport)');
// the banner cache must not survive a hide (a second excursion at the same countdown second stayed invisible)
assert(/if\(el\._lbl!==label \|\| el\.style\.display!=='block'\)\{/.test(fn), 'banner re-shows even when the countdown label repeats');

// ---- wiring: ticked with the race systems, cleared with them ----
assert(/_raceOffTrackTick\(dt\);   \/\/ build 887/.test(src), 'ticks from _raceTick alongside the other race systems');
assert(/function _raceClear\(\)\{ _offTrackT=0; _raceLastS=0; if\(typeof _offTrackHide==='function'\) _offTrackHide\(\);/.test(src), '_raceClear resets the state and hides the banner');
assert(/id='offTrack';/.test(src) && /RETURN TO TRACK/.test(src), 'the red RETURN TO TRACK banner exists');

done('build 887: off-course races warn for 3 seconds, then the car returns to the racing line');
