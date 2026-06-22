// (build 48) Ranged "Gunner" enemy: holds a standoff distance and fires travelling projectiles that
// damage the player; walls/cover block line of sight (and the shots). Structural wiring + runnable LOS.
import { extractFunction, extractConst, gameSource, done, assert, eq } from './harness.mjs';
const src = gameSource();

// archetype
const TYPES = (new Function('"use strict"; return ' + extractConst('ENEMY_TYPES')))();
assert(TYPES.gunner && TYPES.gunner.ranged === true, 'gunner is a ranged type');
assert(TYPES.gunner.standoff > 0 && TYPES.gunner.fireCd > 0 && TYPES.gunner.projSpeed > 0, 'gunner has standoff/fireCd/projSpeed');
assert(/const ENEMY_TYPE_KEYS = \['grunt','runner','brute','gunner','sapper','boss'\]/.test(src), 'gunner is an authorable type');

// can appear in random waves
const pickEnemyType = new Function('Math', '"use strict"; '+extractFunction('pickEnemyType')+'; return pickEnemyType;')(Math);
let sawGunner=false; for(let w=1;w<=8;w++) for(let i=0;i<100;i++){ if(pickEnemyType(w, ()=>Math.random())==='gunner'){ sawGunner=true; } }
assert(sawGunner, 'random waves can roll gunners');

// spawn carries the ranged fields
const se = extractFunction('spawnEnemy');
assert(/ranged: !!ty\.ranged, standoff: ty\.standoff\|\|11, fireCd: ty\.fireCd\|\|1\.5, projSpeed: ty\.projSpeed\|\|24, burst: ty\.burst\|\|1, burstGap: ty\.burstGap\|\|0\.09, shootCd:/.test(se), 'enemy gets ranged + cooldown + burst fields');

// AI: kite to standoff (close if far, back off if crowded), and fire on LOS
assert(/if\(en\.ranged && td\.chase\)\{/.test(src), 'ranged enemies use standoff movement');
assert(/pd > en\.standoff \+ 1/.test(src) && /pd < en\.standoff\*0\.6/.test(src), 'close in when far, kite when crowded');
assert(/if\(en\.ranged\)\{[\s\S]*en\.shootCd<=0[\s\S]*segmentBlocked\(en\.mesh\.position\.x[\s\S]*fireEnemyShot\(en, near, \(en\.burst>1\)\?0\.02:0\)/.test(src), 'fires only with a clear line of sight');

// projectiles: travel, damage a player, blocked by cover, cleared on start, ticked in loop
const ues = extractFunction('updateEnemyShots');
assert(/if\(pl\.hurt\) pl\.hurt\(s\.dmg, s\.from/.test(ues), 'a hit routes damage to the player (local or remote)');
assert(/for\(const c of colliders\)\{[\s\S]*dead=true/.test(ues), 'cover stops the projectile');
assert(/updateEnemyShots\(dt\);/.test(src), 'projectiles tick each frame');
assert(/enemyShots\.slice\(\)\.forEach\(s=>scene\.remove\(s\.mesh\)\); enemyShots\.length=0;/.test(src), 'projectiles cleared on game start');
assert(/for\(const key of ENEMY_TYPE_KEYS\) trow\.appendChild\(tk\(key\)\)/.test(src), 'editor type selector offers every type (incl. Gunner + Boss)');

// --- runnable: line-of-sight blocking ---
const box = (x0,z0,x1,z1)=>({ userData:{ box:{ min:{x:x0,y:0,z:z0}, max:{x:x1,y:3,z:z1} } } });
const mk = cols => new Function('colliders', '"use strict"; '+extractFunction('segmentBlocked')+'; return segmentBlocked;')(cols);
let blocked = mk([ box(4,-1,6,1) ]);                 // wall sitting between the two endpoints
assert(blocked(0,0, 10,0, 1.4) === true, 'a wall on the line blocks LOS');
let clear = mk([ box(4,5,6,7) ]);                    // wall off to the side
assert(clear(0,0, 10,0, 1.4) === false, 'a wall off the line does not block');
let none = mk([]);
assert(none(0,0, 10,0, 1.4) === false, 'open ground is clear');
done('ranged Gunner enemy: standoff + LOS-gated projectiles');
