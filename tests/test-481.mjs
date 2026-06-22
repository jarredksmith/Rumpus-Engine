import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 628: the Sapper — a fast rusher that doesn't melee; it DETONATES (blast + falloff) when it reaches you,
// and also when killed. New enemy variety that punishes letting it close in / shooting it point-blank.

// --- type definition + registration ---
const TYPES = (new Function('return ('+extractConst('ENEMY_TYPES')+')'))();
assert(TYPES.sapper && TYPES.sapper.exploder === true, 'sapper is an exploder type');
assert(TYPES.sapper.dmg === 0 && TYPES.sapper.blastR > 0 && TYPES.sapper.blastDmg > 0, 'no melee; has a blast radius + blast damage');
assert(TYPES.sapper.speedMin > TYPES.grunt.speedMax, 'sapper is faster than a grunt (it rushes)');
assert(/const ENEMY_TYPE_KEYS = \['grunt','runner','brute','gunner','sapper','boss'\]/.test(src), 'sapper is registered (placeable + serialized)');
// it can roll in later random waves
const pick = new Function('Math', '"use strict"; const gameCfg={bossWave:0}; '+extractFunction('pickEnemyType')+'; return pickEnemyType;')(Math);
let sawSapper=false; for(let w=1;w<=8;w++) for(let i=0;i<200;i++){ if(pick(w, ()=>Math.random())==='sapper') sawSapper=true; }
assert(sawSapper, 'random waves can roll sappers');

// --- spawn record carries the blast fields ---
assert(/exploder: !!ty\.exploder, blastR: ty\.blastR\|\|6, blastDmg: ty\.blastDmg\|\|40,/.test(src), 'spawn threads the exploder fields onto the enemy');

// --- AI: a sapper detonates on reach instead of swinging ---
assert(/if\(en\.exploder\)\{/.test(src), 'the attack chain handles exploders first (no melee swing)');
assert(/if\(!en\._detonated && en\._chase && en\._dist < \(en\._reach \|\| 2\.4\) \+ 0\.7[\s\S]*?detonateExploder\(en\);/.test(src), 'reaching the player triggers detonation');

// --- killEnemy: a downed sapper still goes off ---
const ke = extractFunction('killEnemy');
assert(/if\(en\.exploder && !en\._detonated\)\{ en\._detonated=true; if\(typeof explodeAt==='function'\) explodeAt\(/.test(ke), 'killing a sapper detonates it (kill it from range)');

// --- executable: detonateExploder removes the enemy FIRST (so it isn't caught in its own blast), then blasts once ---
const calls = { explode:0, removed:[] };
const run = new Function('scene','mixers','enemies','explodeAt','updateHUD', `
  ${extractFunction('detonateExploder')}
  return detonateExploder;
`);
const en = { id:7, _detonated:false, blastR:6, blastDmg:40, mesh:{ position:{ clone:()=>({x:1,y:0,z:2}) }, userData:{} } };
const enemies = [ {id:1}, en, {id:2} ];
const scene = { remove:(m)=>calls.removed.push(m) };
const explodeAt = (pos,R,d,by)=>{ calls.explode++; calls.atDetonate = enemies.indexOf(en); };   // capture whether en is still in the list when the blast fires
const fn = run(scene, [], enemies, explodeAt, ()=>{});
fn(en);
assert(calls.explode === 1, 'detonation blasts exactly once');
assert(calls.atDetonate === -1, 'the sapper is pulled from the enemies list BEFORE its blast (no self-hit / re-kill)');
assert(enemies.indexOf(en) === -1 && enemies.length === 2, 'the spent sapper is removed');
assert(en._detonated === true, 'it is flagged so it cannot double-detonate');
fn(en);   // second call is a no-op
assert(calls.explode === 1, 'a second detonate call does nothing');

done('Sapper enemy: rushing exploder that detonates on reach + on death (build 628)');
