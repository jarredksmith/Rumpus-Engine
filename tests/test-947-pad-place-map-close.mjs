// (build 947) TWO CONTROLLER FIXES from live testing:
// RT NOW PLACES IN BUILD MODE — _buildModeTick's intercept read only `firing`; its comment claimed
// "mouse, touch FIRE and pad trigger all set `firing`", but the pad sets padFiring and touch sets
// touchFiring, so RT fell through to the weapon path and SHOT the ghost instead of placing. The
// tick now places on any fire input (holding keeps placing at the deploy cooldown's pace), and the
// weapon gate skips entirely while build mode is up — nothing can shoot through it.
// THE BIG MAP CLOSES ON A PAD — D-pad down opened it, but pollGamepad had no mapOpen branch, so no
// controller input could ever close it. B or D-pad down now closes it.
// Verified live with a synthetic pad: RT placed a block (no ammo spent, no shot), holding RT placed
// more at the cooldown's pace, LT still deleted, RT fired normally after exiting build mode; the
// map opened on D-pad down, closed on B, and toggled closed on a second D-pad down.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// RT places
const tick = extractFunction('_buildModeTick', src);
assert(/if\(\(typeof padFiring!=='undefined' && padFiring\) \|\| \(typeof touchFiring!=='undefined' && touchFiring\)\) placeBuild\(\);/.test(tick),
  'the build tick places on the pad trigger and the touch FIRE button (they never set `firing`)');
assert(/&& !\(typeof buildMode!=='undefined' && buildMode\)\)\{ if\(mountedTurret\) turretFire\(\); else shoot\(\); \}/.test(src),
  'the weapon gate skips while build mode is up — fire can never shoot through the ghost');

// map closes
assert(/if\(typeof mapOpen!=='undefined' && mapOpen\)\{ if\(edge9\(1\)\|\|edge9\(13\)\)\{ closeBigMap\(\); \}/.test(src),
  'with the big map open, B or D-pad down closes it (a pad could open it but never close it)');

done('build 947: RT places blocks in build mode (never fires), and the big map closes on a controller');
