// (build 895) REMOTE DRIVEN CARS — "make other players actually just be the car and only see the host's
// car instead of characters." While a player drives, their state packet carries the CAR (identity +
// pose); receivers hide the avatar and render the car instead. The authored car resolves by nid on
// every machine; a grid clone (local-only, no shared nid) gets a per-player GHOST car built from the
// synced model + scale. Driven cars are driver-authoritative: the reconciler and pMov leave them alone
// until the driver exits — whose machine then sends the one parking pMov. Verified headless (stubbed
// room): authored-car takeover moves the car + hides the avatar + claims the nid; the reconciler emits
// nothing for a driven car; a clone driver gets a moving ghost; parking restores the avatar; my own
// drive packs the car, stays pMov-silent, and sends exactly one parking pMov on exit.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// ---- the state channel carries the car ----
const pack = extractFunction('_packCar', src);
assert(/if\(typeof drivingCar==='undefined' \|\| !drivingCar\) return undefined;/.test(pack), 'on foot -> no car field');
assert(/n:\(o\.userData\.nid\|\|''\), s:\(o\.userData\.src\|\|''\)/.test(pack), 'identity: nid (authored) + model src (for clone ghosts)');
assert(/r:\[\+o\.rotation\.x\.toFixed\(3\),\+o\.rotation\.y\.toFixed\(3\),\+o\.rotation\.z\.toFixed\(3\)\]/.test(pack), 'full rotation (pitch/roll ride the arc)');
assert(/cl:_climbCode\(\), c:_packCar\(\) \}\];/.test(src), "the host's own snapshot entry carries it");
assert(/cl:\(rp\.cl\|\|0\), c:\(rp\.car\|\|undefined\) \}\); \}/.test(src), '...and relays every client\'s');
assert(/cl:_climbCode\(\), c:_packCar\(\) \}\); \}catch\(e\)\{\}/.test(src), 'the client state packet carries it');
assert(/rp\.car = msg\.c\|\|null;/.test(src) && /rp\.car=pl\.c\|\|null;/.test(src), 'both receive paths store it');

// ---- rendering: the car, not the character ----
const sync = extractFunction('_syncRemoteCar', src);
assert(/rp\.mesh\.visible=false; rp\._carHidden=true;/.test(sync), 'driving hides the avatar');
assert(/let car = c\.n \? propByNid\(c\.n\) : null;/.test(sync), 'the authored car resolves by nid (re-checked every frame for late GLB loads)');
assert(/car=_ensureCarGhost\(rp\); if\(!car\) return; car\.visible=true;/.test(sync), 'an unresolvable (grid-clone) car gets a local ghost');
assert(/if\(car\.position\.distanceToSquared\(_netLerpV\) > 400\) car\.position\.copy\(_netLerpV\);/.test(sync), 'a >20m jump teleports (grid snap/respawn), no cross-map glide');
assert(/else car\.position\.lerp\(_netLerpV, k\);/.test(sync), 'otherwise the pose is smoothed like avatars');
assert(/if\(rp\._carHidden\)\{ rp\.mesh\.visible=true; rp\._carHidden=false; \}/.test(sync), 'parking restores the avatar');
assert(/if\(typeof _syncRemoteCar==='function'\) _syncRemoteCar\(rp, \+id, k\);/.test(src), 'netInterpolate drives it per player');
const ghost = extractFunction('_ensureCarGhost', src);
assert(/isPrimitive\(c\.s\) && PRIMITIVE_BUILDERS\[c\.s\]/.test(ghost) && /loadGLTFCached\(c\.s,/.test(ghost), 'ghosts build from primitives OR cached GLBs');

// ---- driver-authoritative: nobody else touches a driven car ----
assert(/if\(typeof drivingCar!=='undefined' && o===drivingCar\) continue;/.test(src), "the reconciler skips MY driven car (parking pMov goes out on exit)");
assert(/if\(_remoteDrivenNids\[nid\]!=null\) continue;/.test(src), '...and never echoes a remotely-driven one');
assert(/if\(typeof _remoteDrivenNids!=='undefined' && _remoteDrivenNids\[nid\]!=null\) return false;/.test(src), 'stale pMovs cannot stomp a driven car');
assert(/if\(rp\.carGhost\)\{ scene\.remove\(rp\.carGhost\.mesh\); rp\.carGhost=null; \}/.test(extractFunction('removeRemotePlayer', src)), 'leavers drop their ghost car');

done('build 895: remote racers ARE their car — nid takeover, clone ghosts, driver-authoritative sync');
