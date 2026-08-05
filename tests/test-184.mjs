import { gameSource, extractFunction, evalIn, assert, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();
// spawnAppearsOnWave: noRespawn turns wave-0 ("every wave") into a one-time wave-1 spawn
const saw = extractFunction('spawnAppearsOnWave');
const fn = (no) => evalIn(saw, { gameCfg: { noRespawn: no } });
let appears = fn(false);
assert(appears({wave:0}, 1) && appears({wave:0}, 5), 'default: wave-0 appears every wave');
assert(appears({wave:3}, 3) && !appears({wave:3}, 2), 'default: wave-N appears only on N');
appears = fn(true);
assert(appears({wave:0}, 1) && !appears({wave:0}, 2), 'noRespawn: wave-0 fires once on wave 1');
assert(appears({wave:3}, 3) && !appears({wave:3}, 4), 'noRespawn: wave-N still only on N');

// _hasFutureAuthoredSpawns: true while later waves remain, false once exhausted
const hasFuture = evalIn(extractFunction('_hasFutureAuthoredSpawns'), {
  gameCfg: { noRespawn:true },
  spawnMarkers: [ {userData:{mark:{wave:0}}}, {userData:{mark:{wave:2}}} ]   // effective waves 1 and 2
});
assert(hasFuture(1) === true, 'wave 2 still pending after clearing wave 1');
assert(hasFuture(2) === false, 'nothing left after wave 2');

// wave-clear logic: noRespawn + prebuilt + nothing pending -> do not advance the wave
assert(/const _cleared = gameCfg\.noRespawn && gameCfg\.mode==='prebuilt' && !_hasFutureAuthoredSpawns\(wave\)/.test(src), 'cleared condition missing');
assert(/else if\(_cleared\)\{ if\(objectiveActive\(\)==='eliminate'\)\{ if\(typeof gameWon==='function'\) gameWon\(\); \} \}/.test(src), 'cleared branch wrong (must not advance for extraction/survival)');
// persisted
assert(/noRespawn: !!gameCfg\.noRespawn/.test(src), 'noRespawn not serialized');
assert((src.match(/gameCfg\.noRespawn = !!g\.noRespawn;/g)||[]).length === 1, 'noRespawn not restored in both load paths');
assert(/No respawn<\/b> \(single pass\)/.test(src), 'no-respawn toggle UI missing');
done();
