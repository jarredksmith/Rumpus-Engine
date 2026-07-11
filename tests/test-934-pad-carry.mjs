// (build 934) THE CARRY LOOP ON A CONTROLLER — no pad button ever called grabAction, RT while
// carrying was dead (the fire gate excludes heldProp and only the mouse path throws), and the hint
// showed keyboard keys. Now: Y grabs when aiming at a grabbable prop (and stays interact otherwise
// — which already drops), RT (edge) throws the carried prop, B exits build mode (grenade otherwise),
// and the grab hint speaks controller once a pad is seen.
// Verified live with a synthetic gamepad: Y grabbed the aimed crate, the hint read
// "[Y] Drop · [RT] Throw", RT threw it flying, Y dropped a re-grabbed one, and B exited build mode
// without throwing a grenade.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

assert(/if\(edge\(3\)\)\{[\s\S]{0,180}_grabAvail && !drivingCar && !mountedTurret[\s\S]{0,140}grabAction\(\);\s*\n\s*else interact\(\);/.test(src),
  'Y grabs an aimed prop, interacts otherwise (interact already drops a held prop)');
assert(/if\(heldProp && \(down\(7\) \|\| aval\(7\)>0\.5\) && !padPrev\[7\]\) throwHeld\(\);/.test(src),
  'RT (edge) throws the carried prop');
assert(/if\(edge\(1\)\)\{ if\(typeof buildMode!=='undefined' && buildMode\) exitBuildMode\(\); else throwGrenade\(\); \}/.test(src),
  'B exits build mode; grenade otherwise');
assert(/_pad \? '\[Y\] Drop \\u00b7 \[RT\] Throw'/.test(src) && /_pad \? '\[Y\] Grab'/.test(src),
  'the grab hint speaks controller when a pad is present');

done('build 934: grab, carry, throw and drop all work on a controller — Y and RT, with matching hints');
