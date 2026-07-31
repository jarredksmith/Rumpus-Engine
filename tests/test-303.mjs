import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 410: a Sketchfab ARENA model added as a prop made enemies unable to see/attack the player. segmentBlocked
// (line-of-sight) tested whether the sightline passed through any collider's bounding box — and an arena's box is
// the whole play volume, so EVERY sightline was "blocked" and enemies never fired or meleed. Fix: a box that
// contains BOTH endpoints is an enclosing volume, not a wall between them, so it's skipped. Also now multi-box aware.

const sb = extractFunction('segmentBlocked');
assert(/const aIn = \(ax>=b\.min\.x && ax<=b\.max\.x && az>=b\.min\.z && az<=b\.max\.z\);/.test(sb), 'tests if endpoint A is inside the box');
assert(/const bIn = \(bx>=b\.min\.x && bx<=b\.max\.x && bz>=b\.min\.z && bz<=b\.max\.z\);/.test(sb), 'tests if endpoint B is inside the box');
assert(/if\(aIn && bIn\) continue;/.test(sb), 'an enclosing box (both endpoints inside) does not block sight');
assert(/c\.userData\.boxes \|\| \(c\.userData\.box && \[c\.userData\.box\]\)/.test(sb), 'multi-box colliders are honored (matches movement)');

// executable: build the function against a mocked collider set
const fn = new Function('colliders', 'const _cgSeg=[]; const _cgQuery=(a,b,c2,d,out)=>colliders;\n' + extractFunction('segmentBlocked') + '\nreturn segmentBlocked;')([]);
// 1) ARENA shell: a big box covering everything. Enemy at (-5,0) and player at (5,0) are both inside it.
const arena = { userData:{ box:{ min:{x:-20,y:0,z:-20}, max:{x:20,y:10,z:20} } } };
const f1 = new Function('colliders', 'const _cgSeg=[]; const _cgQuery=(a,b,c2,d,out)=>colliders;\n' + extractFunction('segmentBlocked') + '\nreturn segmentBlocked;')([arena]);
assert(f1(-5,0, 5,0, 1.4)===false, 'arena shell containing both enemy + player does NOT block line-of-sight');
// 2) a real WALL pillar between them (small box at origin, endpoints outside it) -> blocks
const wall = { userData:{ box:{ min:{x:-1,y:0,z:-1}, max:{x:1,y:5,z:1} } } };
const f2 = new Function('colliders', 'const _cgSeg=[]; const _cgQuery=(a,b,c2,d,out)=>colliders;\n' + extractFunction('segmentBlocked') + '\nreturn segmentBlocked;')([wall]);
assert(f2(-5,0, 5,0, 1.4)===true, 'a pillar standing between enemy + player still blocks sight');
// 3) the same wall but ABOVE the sightline (y band above the ray) -> does not block
const high = { userData:{ box:{ min:{x:-1,y:5,z:-1}, max:{x:1,y:9,z:1} } } };
const f3 = new Function('colliders', 'const _cgSeg=[]; const _cgQuery=(a,b,c2,d,out)=>colliders;\n' + extractFunction('segmentBlocked') + '\nreturn segmentBlocked;')([high]);
assert(f3(-5,0, 5,0, 1.4)===false, 'geometry above eye height (overhead beam) does not block a ground sightline');
done();
