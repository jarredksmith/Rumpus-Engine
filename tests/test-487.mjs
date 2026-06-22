import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 634: Shieldbearer — a slow bruiser that SOAKS shots landing on its FRONT (flank it for full damage). It
// turns slowly so a strafing player can get around its guard. The shield is directional: explosions still ignore it.

// --- type + wiring ---
const TYPES = (new Function('return ('+extractConst('ENEMY_TYPES')+')'))();
assert(TYPES.shielded && TYPES.shielded.shielded === true, 'shielded type exists + flagged');
assert(TYPES.shielded.hp > TYPES.grunt.hp && TYPES.shielded.speedMax < TYPES.grunt.speedMin, 'tanky + slow (so you can circle it)');
assert(/const ENEMY_TYPE_KEYS = \['grunt','runner','brute','gunner','sapper','shielded','charger','boss'\]/.test(src), 'registered (placeable + serialized)');
assert(/shielded: !!ty\.shielded,/.test(src), 'flag threaded onto the spawned enemy');
// frontal damage cut applied at the hitscan site (so the damage number matches the HP loss)
assert(/if\(en\.shielded && en\.mesh\)\{ const _sy=en\.mesh\.rotation\.y-\(en\.mesh\.userData\.faceOff\|\|0\); if\(_reactDir\([^\n]*\)==='Front'\) dealt \*= 0\.18; \}/.test(src), 'frontal shots are cut to 18% (flank for full)');
// turns slowly so a flank is possible
assert(/en\.shielded \? TURN_RATE\*0\.45 : TURN_RATE/.test(src), 'a Shieldbearer turns slower than normal');

// --- executable: front hits are soaked, side/back hits deal full damage (uses the real _reactDir) ---
const reactDir = new Function(extractFunction('_reactDir') + '; return _reactDir;')();
// enemy facing yaw=0 -> _reactDir forward is (-sin0,-cos0)=(0,-1): a source at -z is "Front"
function dealtFor(srcDX, srcDZ, yaw){ let dealt = 100; if(reactDir(srcDX, srcDZ, yaw)==='Front') dealt *= 0.18; return dealt; }
eq(dealtFor(0, -5, 0), 18, 'shooting the enemy from directly in front -> soaked to 18');
eq(dealtFor(0, 5, 0), 100, 'shooting it from directly behind -> full 100 (flanked)');
eq(dealtFor(5, 0, 0), 100, 'shooting it from the side -> full 100 (flanked)');
eq(dealtFor(-5, 0.1, 0), 100, 'a near-side hit also lands full');

done('Shieldbearer: directional frontal damage soak, beatable by flanking (build 634)');
