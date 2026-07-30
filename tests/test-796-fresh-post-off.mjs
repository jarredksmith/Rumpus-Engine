// (build 796) A cleared scene starts with post-processing OFF by default — bloom / motion blur / vignette / grain
// zeroed and the grade neutral — so an empty canvas isn't pre-loaded with heavy effects. The authored DEFAULT_WORLD
// look is untouched (that's still what "reset to defaults" gives).
//
// build 1140 narrowed this to the EMPTY case only. See the note at the first-time-boot assertion below.
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

// --- first-time boot does NOT apply it any more (build 1140) ---
// Build 796's reason was "so a first-time canvas isn't pre-loaded with heavy effects", and that was right
// when the first-time scene was 22 boxes at Math.random() positions. Build 1133 made it a DESIGNED level,
// so from build 1140 it ships with the engine's authored look. Probed on the stock frame before the
// change: bloom 0, vignette 0, grain 0, grade neutral, ssao 0 — every visual system builds 1126, 1128,
// 1135 and 1136 added was off in the first frame anyone ever sees, and unmeasurable there.
assert(!/if\(!\(savedLevel && savedLevel\.world\)\) _postOffWorld\(worldCfg\);/.test(src),
  'a first-time scene keeps the authored post look');
assert(/let worldCfg = _worldFrom\(\(savedLevel && savedLevel\.world\) \|\| null\);/.test(src),
  '...and still derives its world from the save when there is one');
// the EMPTY-scene case is where build 796's intent actually lives, and it is untouched — see below.

// --- clearing the scene applies it + re-applies the world ---
const ws = extractFunction('_wipeSceneCore') + extractFunction('wipeScene');   // build 879: wipeScene = pushUndoSnapshot + _wipeSceneCore
assert(/_postOffWorld\(worldCfg\); if\(typeof applyWorldCfg==='function'\) applyWorldCfg\(\);/.test(ws), 'clearing the scene turns post FX off and re-applies the world');

// --- but the authored DEFAULT_WORLD look is NOT changed (reset-to-defaults still restores the designed look) ---
assert(/postBloom:0\.65, postMotion:0\.62, postVig:0\.42/.test(src), 'DEFAULT_WORLD keeps its designed post values (unchanged)');

done('build 796 as amended by 1140: a CLEARED scene defaults to post-processing off; the designed default level does not');
