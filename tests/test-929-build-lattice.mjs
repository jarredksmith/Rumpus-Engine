// (build 929) BUILD-MODE FIXES from live testing: cubes wouldn't align and rotate "didn't work".
// ALIGNMENT: the snap grid was anchored to whatever you aimed at — the floor prop's grid and a
// block's grid never coincided, so neighbouring placements couldn't line up. Snap now uses ONE
// GLOBAL WORLD LATTICE (cell = the ghost's own size, block bottoms on whole y-cells) for the
// tangent axes, normal axis flush-exact. ROTATE: the weapon-scroll listener had no build-mode
// guard (scrolling cycled weapons), the size was measured before the rotation applied, and the
// hint now shows the angle. CLIP-THROUGH: nothing stopped placing a block into your own body —
// an embedded player phases through walls via the walk-out allowance. The ghost turns red and
// placement is refused when it overlaps the player or an occupied cell.
// Verified live at 0.02 tolerance: ground block landed on-lattice; top-face ghost at dx=dz=0,
// dy=size exactly; side-face ghost same row, one cell over; self-overlap red+refused, occupied
// cell red, free cell green; scroll rotated without cycling the weapon; clearAt confirmed the
// anchored block solid to the player.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the world lattice
const tick = extractFunction('_buildModeTick', src);
assert(/if\(!_bmN\.x\) px=Math\.round\(px\/gx\)\*gx;/.test(tick) && /if\(!_bmN\.z\) pz=Math\.round\(pz\/gz\)\*gz;/.test(tick),
  'tangent axes snap to the GLOBAL world lattice (no more target-anchored grids)');
assert(/if\(!_bmN\.y\) py=Math\.round\(\(py\+b\.foot\)\/gy\)\*gy - b\.foot;/.test(tick),
  'block bottoms land on whole y-cells (rows align everywhere)');
assert(!/node\.userData\.nid\) \? node\.position : null/.test(tick), 'the aimed-target grid anchor is gone');

// rotate actually works now
assert(/if\(typeof buildMode!=='undefined' && buildMode\) return;   \/\/ build 929: in build mode the wheel ROTATES/.test(src),
  'weapon scroll is suppressed in build mode');
assert(/b\.ghost\.rotation\.set\(0, b\.yaw, 0\); b\.ghost\.updateMatrixWorld\(true\)/.test(src),
  'the size measure applies the rotation first (a rotated ramp swaps extents)');
assert(/_bmMeasure\(\); _bmHint\(\); \}/.test(extractFunction('_bmRotStep', src)) && /rot/.test(extractFunction('_bmHint', src)),
  'rotating refreshes the hint, which shows the angle (build 1022: every rotate input funnels through _bmRotStep)');

// placement validity: no self-embed, no double-fill
const val = extractFunction('_bmValidate', src);
assert(/feet\+STEP/.test(val) && /_bmBox\.min\.y<hi && _bmBox\.max\.y>lo/.test(val),
  'a ghost overlapping the player is invalid (embedding lets you phase through walls)');
assert(/bx\.intersectsBox\(_bmBox\)/.test(val), 'a ghost intersecting an existing prop is invalid');
assert(/setHex\(bad\?0xff5566:0x39ff88\)/.test(val), 'the ghost shows red when invalid');
assert(/if\(b\.invalid\)\{/.test(extractFunction('placeBuild', src)), 'invalid placements are refused');
assert(/_bmValidate\(\);\n\}/.test(tick.trimEnd()+'\n}') || /_bmValidate\(\);/.test(tick), 'validity runs every tick');

done('build 929: blocks align on one world lattice, rotate works, and you cannot build yourself into a wall');
