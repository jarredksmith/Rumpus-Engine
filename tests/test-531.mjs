import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 685: a no-enemies "puzzle" objective (objective:'puzzle'). No waves/spawns ever run; the level is built
// from props + mechanisms + signals and won via a Win-level signal. Ideal for puzzle / exploration / adventure maps.

assert(/function noEnemyMode\(\)\{ return objectiveActive\(\)==='puzzle' \|\| objectiveActive\(\)==='race'; \}/.test(src), 'noEnemyMode flags the puzzle + race objectives (build 831: a race is a clean grid)');

// --- the spawn loop is skipped, but objectiveTick still runs ---
const upd = src;
assert(/objectiveTick\(dt\);[\s\S]*?if\(noEnemyMode\(\)\)\{[^}]*\}\s*\n\s*else if\(toSpawn>0\)\{/.test(upd), 'puzzle mode skips spawn + wave-advance (objectiveTick still ticks)');

// --- startWave bails before queuing enemies ---
const sw = extractFunction('startWave');
assert(/if\(noEnemyMode\(\)\)\{ toSpawn = 0;[\s\S]*?return; \}/.test(sw), 'startWave never queues enemies in puzzle mode');

// --- HUD label ---
const oh = extractFunction('objectiveHUD');
assert(/objectiveActive\(\)==='puzzle'\)\{ wn\.textContent = _curGoal \? _curGoal\.slice\(0,48\) : 'EXPLORE'; \}/.test(oh), 'the wave HUD shows the goal (or EXPLORE)');

// --- editor exposes the objective ---
const panel = extractFunction('renderEditorFields');
assert(/obBtn\('puzzle',/.test(panel), 'a Puzzle objective button exists');
assert(/if\(objectiveActive\(\)==='puzzle'\)\{ hint\(gHost[\s\S]*?Win level<\/b> signal/.test(panel), 'the panel explains the puzzle win path');

// --- it serializes through the normal objective field (round-trips) ---
assert(/objective: gameCfg\.objective/.test(src), 'objective (incl. puzzle) saves with the level');

done('build 685: no-enemies puzzle / exploration objective');
