import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 409: the load gate (loading screen that waits for _glbPending) only prewarmed PLAYER character models,
// not ENEMY models. Enemy GLBs load when an enemy first spawns — a frame or two after the gate already passed —
// so the player saw the placeholder capsule pop to the model. Now enemy models are prewarmed before the gate.

const pw = extractFunction('_prewarmMatchModels');
// still warms the local + remote character models
assert(/const mc=\(typeof myCharCfg==='function'\)\?myCharCfg\(\):null; if\(mc && mc\.url\) urls\.add\(mc\.url\);/.test(pw), 'local character still prewarmed');
assert(/for\(const id in NET\.charById\)\{ const c=NET\.charById\[id\]; if\(c && c\.url\) urls\.add\(c\.url\); \}/.test(pw), 'remote characters still prewarmed');
// NEW: enemy type models prewarmed
assert(/for\(const k in enemyModels\)\{ const em=enemyModels\[k\]; if\(em && em\.url\) urls\.add\(em\.url\); \}/.test(pw), 'every enemy type with a model URL is prewarmed (build 409)');
assert(/urls\.forEach\(u=>\{ try\{ loadGLTFCached\(u, \(\)=>\{\}, \(\)=>\{\}\); \}catch\(e\)\{\} \}\);/.test(pw), 'the warm loads kick off through the tracked loader');

// startGame runs the prewarm BEFORE the asset gate, so _glbPending reflects the enemy loads
const sg = extractFunction('startGame');
assert(/_prewarmMatchModels\(\);[\s\S]*?if\(_levelAssetsPending\(\) \|\| _loadCover\)\{ _loadCover=false; showLevelLoader\(\); waitAssetsThenReveal\(\); \}/.test(sg), 'prewarm happens before the loading-screen gate');

// the gate counts models still loading, and the loader has a safety timeout
const lap = extractFunction('_levelAssetsPending');
assert(/_glbPending>0/.test(lap), 'gate waits on pending model loads');
const wat = extractFunction('waitAssetsThenReveal');
assert(/if\(now-t0>=15000\)\{ reveal\(\); return; \}/.test(wat), 'loader has a 15s safety timeout (never traps the player)');
done();
