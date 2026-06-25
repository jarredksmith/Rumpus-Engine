// (build 88) Boss enemy: a big, high-HP ranged heavy that joins random-mode waves on a cadence, shows a
// dedicated health bar, and pays out on death.
import { html, gameSource, extractFunction, extractConst, done, assert, eq } from './harness.mjs';
const src = gameSource();

// type definition
const TYPES = (new Function('return ('+extractConst('ENEMY_TYPES')+')'))();
assert(TYPES.boss, 'boss type exists');
assert(TYPES.boss.hp>=500 && TYPES.boss.scale>=2 && TYPES.boss.ranged===true, 'boss is big, tanky, ranged');
assert(/const ENEMY_TYPE_KEYS = \['grunt','runner','brute','gunner','sapper','shielded','charger','boss']/.test(src), 'boss is registered (placeable + serialized)');

// cadence config round-trips
assert(/bossWave: \(savedLevel && savedLevel\.game && savedLevel\.game\.bossWave!=null\) \? savedLevel\.game\.bossWave : 5/.test(src), 'bossWave defaults to 5');
assert(/bossWave: gameCfg\.bossWave, noRespawn: !!gameCfg\.noRespawn, unarmed: !!gameCfg\.unarmed, allowPickup: gameCfg\.allowPickup!==false, flashlight: !!gameCfg\.flashlight, flash: \{ intensity:\+gameCfg\.flashCfg\.intensity, angle:\+gameCfg\.flashCfg\.angle, penumbra:\+gameCfg\.flashCfg\.penumbra, distance:\+gameCfg\.flashCfg\.distance, color:gameCfg\.flashCfg\.color \}, goalText: \(gameCfg\.goalText\|\|''\)\.slice\(0,160\), respawnOnDeath: !!gameCfg\.respawnOnDeath, winText: \(gameCfg\.winText\|\|''\)\.slice\(0,240\), loseText: \(gameCfg\.loseText\|\|''\)\.slice\(0,240\), spawnRegion:/.test(src), 'bossWave is serialized with the level');
assert((src.match(/gameCfg\.bossWave = level\.game\.bossWave!=null \? level\.game\.bossWave : 5/g)||[]).length===2, 'bossWave restored in both restore paths');

// random waves add a boss on the cadence (runnable, isolated)
const mk = (bw)=> new Function('Math', '"use strict"; const gameCfg={bossWave:'+bw+'}; '+extractFunction('pickEnemyType')+'; '+extractFunction('randomWaveDescriptors')+'; return randomWaveDescriptors;')(Math);
const rng=(v)=>()=>v;
const w5 = mk(5)(5, 40, rng(0.5));
assert(w5.some(d=>d.type==='boss'), 'a boss joins wave 5 when bossWave=5');
const w3 = mk(5)(3, 40, rng(0.5));
assert(!w3.some(d=>d.type==='boss'), 'no boss on a non-multiple wave');
const wOff = mk(0)(5, 40, rng(0.5));
assert(!wOff.some(d=>d.type==='boss'), 'bossWave=0 disables auto bosses');

// boss health bar
assert(/id="bossBar"/.test(html) && /id="bossBarFill"/.test(html), 'boss bar markup exists');
const ubb = extractFunction('updateBossBar');
assert(/e\.type==='boss'/.test(ubb) && /bossBarFill/.test(ubb), 'bar aggregates living boss HP');
assert(/updateBossBar\(isClient \|\| duelMode\)/.test(src), 'loop drives the bar (hidden on clients/duel)');

// kill payoff
const ke = extractFunction('killEnemy');
assert(/en\.type==='boss'\)\{[\s\S]*?score \+= 500;[\s\S]*?BOSS DOWN/.test(ke), 'downing a boss grants a bonus + toast');
// boss is selectable in the Spawns-tab type picker (picker now iterates all types)
assert(/for\(const key of ENEMY_TYPE_KEYS\) trow\.appendChild\(tk\(key\)\)/.test(src), 'spawn-marker type picker includes every type (incl. boss)');
done('boss enemy');
