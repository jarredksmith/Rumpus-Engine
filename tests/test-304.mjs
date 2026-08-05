import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 411: the load gate still let capsule/placeholder models through because the prewarm only covered
// player + enemy models. It now ALSO warms the gun viewmodel(s) and every scene prop model BEFORE the gate,
// so _glbPending reflects them and both the loading screen and the deferred intro cutscene wait.

const pw = extractFunction('_prewarmMatchModels');
// gun viewmodels warmed
assert(/for\(const k in WEAPONS\)\{ const w=WEAPONS\[k\]; const u=\(w&&w\.model\)\?w\.model:\(typeof gunModelUrl!=='undefined'\?gunModelUrl:''\); if\(u\) urls\.add\(u\); \}/.test(pw), 'all weapon viewmodels are prewarmed (fixes the missing gun in the cutscene)');
// scene props warmed (non-primitives only)
assert(/const list=\(savedLevel && Array\.isArray\(savedLevel\.props\)\)\?savedLevel\.props:\(typeof SCENE_PROPS!=='undefined'\?SCENE_PROPS:\[\]\);/.test(pw), 'reads the level prop list');
assert(/if\(p && p\.src && typeof isPrimitive==='function' && !isPrimitive\(p\.src\)\) urls\.add\(p\.src\);/.test(pw), 'warms each non-primitive prop model (incl. sketchfab: urls)');
// enemy + character warms still present
assert(/for\(const k in enemyModels\)/.test(pw) && /myCharCfg/.test(pw), 'enemy + character warms retained');

// the prewarm runs BEFORE the gate check in startGame
const sg = extractFunction('startGame');
assert(/_prewarmMatchModels\(\);[\s\S]*?if\(_levelAssetsPending\(\) \|\| _loadCover\)\{ _loadCover=false; showLevelLoader\(\); waitAssetsThenReveal\(\); \}/.test(sg), 'prewarm precedes the asset gate');

// the intro cutscene is deferred while the loader/loads are pending (so it never frames a half-loaded scene)
assert(/if\(_levelLoaderActive\) _cineIntroPending = true;/.test(sg), 'cutscene deferred while the loading screen is up');
assert(/else _startIntroWhenSettled\(\);/.test(sg), 'or waits for the load counters to go quiet before starting');
const ws = extractFunction('_startIntroWhenSettled');
assert(/if\(!_levelAssetsPending\(\)\)\{ if\(!zeroAt\) zeroAt=now; if\(now-zeroAt>=300\)\{ maybeStartIntroCine\(\); return; \} \}/.test(ws), 'the no-loader path also waits for assets before the cutscene');

// executable: loadGLTFCached must bump _glbPending SYNCHRONOUSLY, or the gate check right after prewarm sees 0
const lg = extractFunction('loadGLTFCached');
const idxCache = lg.indexOf('if(gltfCache[url])');
const idxPending = lg.indexOf('_glbPending++');
const idxQueue = lg.indexOf('_glbQueue.push');
assert(idxPending>0 && idxPending<idxQueue, '_glbPending increments before the load is queued (synchronous) so the gate sees it');
done();
