// (build 931) COULDN'T BUILD ON TOP OF PLACED OBJECTS — the 929 occupancy veto tested the ghost
// against EVERY prop's whole-object bounding box. A big level prop (an arena floor, the Monster Jam
// stadium shell) has a box that encloses everything sitting on it, so every stacked placement
// inside the arena read as "occupied" and only bare ground worked. Occupancy now counts only
// PLAYER-BUILT pieces (userData.runtime); the self-overlap veto is untouched.
// Verified live: a ghost seated on top of a 12x12 level platform (inside its AABB) validates,
// while a runtime block's occupied cell and player overlap still refuse.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const val = extractFunction('_bmValidate', src);
assert(/if\(!o \|\| !o\.userData \|\| !o\.userData\.runtime\) continue;/.test(val),
  'occupancy counts only player-built pieces — a level prop cannot veto placements inside its huge AABB');
assert(/bx\.intersectsBox\(_bmBox\)/.test(val), 'occupied runtime cells still refuse');
assert(/feet\+STEP/.test(val) && /M=0\.12/.test(val), 'the self-overlap veto mirrors insideSolid (centre column, step band — build 932)');

done('build 931: you can build on top of anything again — occupancy only guards your own blocks');
