// (build 796) A fresh or cleared scene starts with post-processing OFF by default — bloom / motion blur / vignette / grain
// zeroed and the grade neutral — so a first-time canvas isn't pre-loaded with heavy effects. The authored DEFAULT_WORLD
// look is untouched (that's still what "reset to defaults" gives); only a brand-new (no saved world) or explicitly cleared
// scene starts clean.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- the helper zeros the effects + neutralises the grade ---
const po = extractFunction('_postOffWorld');
{
  const _postOffWorld = new Function(po + '; return _postOffWorld;')();
  const w = _postOffWorld({ postBloom:0.65, postMotion:0.62, postVig:0.42, postGrain:0.05, postSat:1.08, postCon:1.05, postThresh:0.62 });
  eq(w.postBloom, 0, 'bloom off'); eq(w.postMotion, 0, 'motion blur off'); eq(w.postVig, 0, 'vignette off');
  eq(w.postGrain, 0, 'grain off'); eq(w.postSat, 1, 'saturation neutral'); eq(w.postCon, 1, 'contrast neutral');
  eq(w.postThresh, 0.62, 'the bloom threshold is left alone (only matters when bloom>0)');
  eq(_postOffWorld(null), null, 'null-safe');
}

// --- first-time boot (no saved world) applies it ---
assert(/if\(!\(savedLevel && savedLevel\.world\)\) _postOffWorld\(worldCfg\);/.test(src), 'a first-time scene (no saved world) starts with post FX off');

// --- clearing the scene applies it + re-applies the world ---
const ws = extractFunction('wipeScene');
assert(/_postOffWorld\(worldCfg\); if\(typeof applyWorldCfg==='function'\) applyWorldCfg\(\);/.test(ws), 'clearing the scene turns post FX off and re-applies the world');

// --- but the authored DEFAULT_WORLD look is NOT changed (reset-to-defaults still restores the designed look) ---
assert(/postBloom:0\.65, postMotion:0\.62, postVig:0\.42/.test(src), 'DEFAULT_WORLD keeps its designed post values (unchanged)');

done('build 796: fresh / cleared scenes default to post-processing off');
