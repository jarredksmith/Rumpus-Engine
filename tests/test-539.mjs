import { gameSource, extractFunction, assert, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();
// build 693: checkpoints. A signal action do:'checkpoint' drops a respawn point at the player; with gameCfg.
// respawnOnDeath on, a solo death sends them to the last checkpoint (or the start) with full health, no game over.

// --- death routes through playerDied, which respawns instead of ending when enabled ---
assert(/if\(player\.hp<=0\) playerDied\(\);/.test(src), 'self-damage death goes through playerDied');
const pd = extractFunction('playerDied');
assert(/if\(gameCfg\.respawnOnDeath && \(typeof pvpMode!=='function' \|\| !pvpMode\(\)\) && NET\.mode==='off'\)\{ respawnAtCheckpoint\(\); return; \}/.test(pd), 'solo + enabled -> respawn; else endGame');
assert(/endGame\(\);/.test(pd), 'otherwise the run ends (wave shooters)');

// --- respawn restores health + position ---
const ra = extractFunction('respawnAtCheckpoint');
assert(/player\.hp = player\.maxHp;/.test(ra), 'respawn refills health');
assert(/if\(_checkpoint\)\{ player\.pos\.set\(_checkpoint\.x, _checkpoint\.y, _checkpoint\.z\)/.test(ra), 'respawn at the checkpoint when one is set');
assert(/else \{ const ty=.*terrainHeightAt\(playerSpawn\.x,playerSpawn\.z\)/.test(ra), 'falls back to the level start');

// --- the checkpoint signal drops a point at the player (no target) ---
const sc = extractFunction('setCheckpoint');
assert(/_checkpoint = \{ x:player\.pos\.x, y:player\.pos\.y, z:player\.pos\.z, yaw:player\.yaw \};/.test(sc), 'setCheckpoint stores the player pose');
assert(/\['checkpoint','Set checkpoint'\]/.test(src), 'the do dropdown offers Set checkpoint');
assert(/if\(s\.do==='checkpoint'\)\{ if\(typeof setCheckpoint==='function'\) setCheckpoint\(\); return; \}/.test(src), 'the signal action drops a checkpoint');

// --- a fresh run clears the checkpoint ---
assert(/run = \{ \.\.\.RUN0 \}; _checkpoint=null;/.test(src), 'startGame resets the checkpoint');

// --- config + editor + persistence ---
assert(/respawnOnDeath: !!\(savedLevel && savedLevel\.game && savedLevel\.game\.respawnOnDeath\)/.test(src), 'gameCfg.respawnOnDeath seeded from the save');
assert(/respawnOnDeath: !!gameCfg\.respawnOnDeath/.test(src), 'serialized with the level');
assert((src.match(/gameCfg\.respawnOnDeath = !!g\.respawnOnDeath;/g)||[]).length === 1, 'restored in both load paths');
const panel = extractFunction('renderEditorFields');
assert(/<b>Respawn at checkpoint<\/b> on death \(solo\)/.test(panel) && /gameCfg\.respawnOnDeath=cb\.checked/.test(panel), 'an editor toggle exists');

done('build 693: checkpoints + respawn-on-death');
