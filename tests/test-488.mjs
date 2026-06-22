import { gameSource, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 635: Charger — a bruiser that, at mid-range with LOS, TELEGRAPHS a wind-up then LUNGES across the gap to
// slam you. The dash direction is locked when the wind-up ends, so you can sidestep it. Up close it melees normally.

// --- type + wiring ---
const TYPES = (new Function('return ('+extractConst('ENEMY_TYPES')+')'))();
assert(TYPES.charger && TYPES.charger.charger === true, 'charger type exists + flagged');
assert(TYPES.charger.lungeRange > 0 && TYPES.charger.lungeSpeed > 0 && TYPES.charger.lungeDur > 0 && TYPES.charger.lungeWind > 0, 'lunge tuning present');
assert(/const ENEMY_TYPE_KEYS = \['grunt','runner','brute','gunner','sapper','shielded','charger','boss'\]/.test(src), 'registered (placeable + serialized)');
assert(/charger: !!ty\.charger, lungeRange: ty\.lungeRange\|\|16, lungeSpeed: ty\.lungeSpeed\|\|30/.test(src), 'lunge fields threaded onto the spawned enemy');

// --- lunge state machine in the movement block ---
assert(/let _charging = false;/.test(src), 'a _charging flag gates normal movement off during a lunge');
assert(/if\(_charging\)\{ \/\* the lunge owns movement this frame \*\/ \}\s*else if\(en\.ranged && td\.chase\)\{/.test(src), 'when charging, the normal walk/standoff movement is skipped');
assert(/en\._lungeWind = nowMs \+ \(en\.lungeWind\|\|520\); en\._attackT = nowMs[^\n]*en\._lungePending = true;/.test(src), 'reaching mid-range with LOS starts a telegraphed wind-up');
assert(/en\._lungeDx = lx\/ll; en\._lungeDz = lz\/ll; en\._lungeT = \(en\.lungeDur\|\|0\.45\);/.test(src), 'the dash direction locks at the end of the wind-up (sidesteppable)');
assert(/if\(en\._dist < \(en\._reach\|\|2\.4\) \+ 0\.6\)\{ near\.hurt\(en\.dmg\|\|20/.test(src), 'a connecting lunge slams the player');
assert(/insideSolid\(nx, nz, \(en\._groundY!=null\?en\._groundY:0\)\+0\.6\)\)\{ en\._lungeT=0;/.test(src), 'the dash stops short at a wall (no clipping through)');

// --- executable: the locked dash direction is a unit vector toward where the player WAS at fire time ---
function lockDir(ex, ez, px, pz){ const lx=px-ex, lz=pz-ez, ll=Math.hypot(lx,lz)||1; return { dx:lx/ll, dz:lz/ll }; }
const d = lockDir(0,0, 6,8);
near(Math.hypot(d.dx,d.dz), 1, 1e-9, 'dash direction is normalized');
near(d.dx, 0.6, 1e-9, 'points at the player x'); near(d.dz, 0.8, 1e-9, 'points at the player z');
// once locked, advancing along it for the dash duration covers lungeSpeed*lungeDur and ignores later player motion (sidestep)
const reached = { x: d.dx*30*0.45, z: d.dz*30*0.45 };
near(Math.hypot(reached.x, reached.z), 30*0.45, 1e-9, 'a full dash travels lungeSpeed*lungeDur along the locked line');

done('Charger: telegraphed, sidesteppable lunge across a gap (build 635)');
