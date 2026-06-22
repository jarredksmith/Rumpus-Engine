// Wave modes + enemy types (build 37): archetypes, weighted random types, random/pre-built wave
// selection, win-after-N-waves, and persistence.
import { extractFunction, extractConst, evalIn, gameSource, done, assert, eq } from './harness.mjs';

// --- archetypes ---
const TYPES = evalIn(extractConst('ENEMY_TYPES'));
eq(Object.keys(TYPES).length, 8, 'eight enemy types (incl. gunner + boss + sapper + shielded + charger)');
assert(TYPES.boss && TYPES.boss.hp >= 500 && TYPES.boss.scale >= 2, 'boss is a big, high-HP type');
for (const k of ['grunt','runner','brute']){ const t=TYPES[k];
  for (const f of ['hp','speedMin','speedMax','scale','tint','dmg']) assert(f in t, `${k} has ${f}`);
  assert(t.speedMax>=t.speedMin && t.hp>0 && t.dmg>0, `${k} stats sane`);
}
assert(TYPES.runner.speedMin > TYPES.grunt.speedMin, 'runner faster than grunt');
assert(TYPES.brute.hp > TYPES.grunt.hp && TYPES.brute.speedMax < TYPES.grunt.speedMin, 'brute tankier + slower');
assert(TYPES.brute.scale > TYPES.grunt.scale && TYPES.runner.scale < TYPES.grunt.scale, 'sizes differ by type');

// --- pickEnemyType weighting (deterministic rng) ---
const pickEnemyType = new Function('Math', '"use strict"; const gameCfg = { bossWave: 0 }; ' + extractFunction('pickEnemyType') + '; return pickEnemyType;')(Math);
const rng = (v)=>()=>v;
eq(pickEnemyType(1, rng(0.1)), 'grunt', 'early wave low roll -> grunt');
eq(pickEnemyType(1, rng(0.99)), 'brute', 'early wave high roll -> brute (rare)');
eq(pickEnemyType(5, rng(0.5)), 'runner', 'late wave mid roll -> runner');
eq(pickEnemyType(5, rng(0.9)), 'brute', 'late wave high roll -> brute (common)');

// --- randomWaveDescriptors ---
const randomWaveDescriptors = new Function('Math', '"use strict"; const gameCfg = { bossWave: 0 }; ' + extractFunction('pickEnemyType') + '; ' + extractFunction('randomWaveDescriptors') + '; return randomWaveDescriptors;')(Math);
const w3 = randomWaveDescriptors(3, 40, rng(0.5));
eq(w3.length, 3 + 3*2, 'wave 3 random count = 3 + wave*2');
assert(w3.every(d => d.mode==='hunt' && ['grunt','runner','brute'].includes(d.type)), 'random descriptors are hunt + valid types');
assert(w3.every(d => Number.isFinite(d.x) && Number.isFinite(d.z)), 'random positions finite');
assert(randomWaveDescriptors(1,40,rng(0.5)).length < w3.length, 'later waves spawn more');

// --- spawnAppearsOnWave ---
const appears = new Function('"use strict"; ' + extractFunction('spawnAppearsOnWave') + '; return spawnAppearsOnWave;')();
assert(appears({wave:0}, 5) && appears({wave:0}, 1), 'wave 0 marker appears every wave (back-compat)');
assert(appears({wave:3}, 3) && !appears({wave:3}, 2), 'wave-N marker appears only on wave N');

// --- wiring ---
const src = gameSource();
const sw = extractFunction('startWave');
assert(/gameCfg\.mode === 'prebuilt'/.test(sw), 'startWave branches on game mode');
assert(/spawnAppearsOnWave\(g\.userData\.mark, wave\)/.test(sw), 'pre-built filters markers by wave');
assert(/randomWaveDescriptors\(wave, ARENA/.test(sw), 'random mode generates a scaled wave');
assert(/gameCfg\.winWaves>0 && wave>=gameCfg\.winWaves\)\{ if\(typeof gameWon/.test(src), 'win triggers after the final wave');
assert(/function gameWon\(\)/.test(src) && /MISSION COMPLETE/.test(src), 'victory screen exists');
assert(/game:\s*\{ mode: gameCfg\.mode, winWaves: gameCfg\.winWaves/.test(src), 'game config is serialized');
assert(/hp:ty\.hp, maxHp:ty\.hp,.*dmg:ty\.dmg, type:typeKey/.test(src), 'spawned enemy uses archetype stats');
done('wave modes + enemy archetypes + win condition');
