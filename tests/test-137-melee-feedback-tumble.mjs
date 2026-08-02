// (build 194) Two combat-feel additions:
//  1) The punch now triggers the same hit feedback the guns have: crosshair hitmarker + floating damage
//     number (+ enemy flash for solo enemies), so melee feels as good as shooting.
//  2) Launched actors (enemies + bots) tumble through the air instead of sliding upright, then snap upright
//     on landing — makes every fling (trebuchet / explosion / punch) read like a real ragdoll launch.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// build 1303: the swing and the contact are two functions now — the blow lands after the weapon's
// windup, not on the input frame. These assertions are about the CONTACT, so read both halves.
const m = extractFunction('meleeAttack') + '\n' + extractFunction('_meleeStrike');
assert(/spawnDamageNumber\(best\.mesh\.position, DMG, _k, false\); \} showHitmarker\(_k\)/.test(m), 'melee on a bot shows a damage number + hitmarker');
assert(/spawnDamageNumber\(best\.posEye, DMG, false, false\); \} showHitmarker\(false\)/.test(m), 'melee on a remote player shows feedback');
assert(/spawnDamageNumber\(best\.mesh\.position, _d, _k, false\); flashEnemy\(best\); showHitmarker\(_k\)/.test(m), 'melee on a solo enemy shows number + flash + hitmarker');

const ub = extractFunction('updateBots');
// build 479: tumble fires only for LAUNCHES (trebuchet / explosion). A path-hop jump is tagged with
// _jumpCarry and keeps the bot upright — they were spinning end-over-end every time they jumped a ledge.
assert(/const launched = \(b\.grounded===false\) && !b\._jumpCarry;/.test(ub), 'tumble gate distinguishes a launch from a path hop');
assert(/if\(launched\)\{ b\._spin=\(b\._spin\|\|0\)\+\(Math\.hypot\(b\.evx\|\|0,b\.evz\|\|0\)\+Math\.abs\(b\.vy\|\|0\)\)\*dt\*0\.5; b\.mesh\.rotation\.set\(b\._spin, \(b\._dispYaw=turnToward\(b\._dispYaw==null\?b\.yaw:b\._dispYaw, b\.yaw, dt, TURN_RATE\)\), b\._spin\*0\.5\); \}/.test(ub), 'launched bots still tumble (yaw eased)');
assert(/else \{ b\._spin=0; b\.mesh\.rotation\.set\(0, \(b\._dispYaw=turnToward\(b\._dispYaw==null\?b\.yaw:b\._dispYaw, b\.yaw, dt, TURN_RATE\)\), 0\); \}/.test(ub), 'grounded bots turn smoothly toward target yaw');

assert(/en\._spin=\(en\._spin\|\|0\)\+\(Math\.hypot\(en\.evx\|\|0,en\.evz\|\|0\)\+Math\.abs\(en\.vy\|\|0\)\)\*dt\*0\.5;/.test(src), 'launched enemies tumble');
assert(/en\._spin=0;[\s\S]*?turnToward\(en\.mesh\.rotation\.y, _tYaw, dt, en\.shielded \? TURN_RATE\*0\.45 : TURN_RATE\)/.test(src), 'grounded enemies resume normal (eased) facing');

done();
