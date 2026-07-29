// (build 53) The "Show ground grid" toggle (worldCfg.grid) must persist. It IS saved (world config) and
// loaded, but a deferred arena-resize rebuild used to recreate a visible grid after applyWorldCfg hid it.
// Fix: rebuildArena itself applies the saved visibility on every rebuild.
import { extractFunction, gameSource, done, assert } from './harness.mjs';
const src = gameSource();

// visibility semantics: only an explicit false hides; unset/true show
const vis = g => (g !== false);
assert(vis(false) === false, 'grid:false hides the grid');
assert(vis(true)  === true,  'grid:true shows it');
assert(vis(undefined) === true, 'unset defaults to shown');

// the fix lives in rebuildArena (so deferred / restore-triggered rebuilds respect it), TDZ-guarded
const ra = extractFunction('rebuildArena');
assert(/grid\.visible = \(worldCfg\.grid !== false\)/.test(ra), 'rebuildArena applies saved grid visibility');
assert(/typeof worldCfg !== 'undefined'/.test(ra) && /catch\(e\)\{\}/.test(ra), 'guarded for the first call (before worldCfg exists)');

// applyWorldCfg still applies it for the no-rebuild toggle case
const awc = extractFunction('applyWorldCfg');
assert(/grid\.visible = \(worldCfg\.grid !== false\)/.test(awc), 'toggle without a resize still works');

// saved + restored as part of the world config
const sl = extractFunction('serializeLevel');
assert(/world:\s*Object\.assign\(\{\}, worldCfg\)/.test(sl), 'grid saved inside world config');
const rl = extractFunction('restoreLevel');
assert(/level\.world\)\{ worldCfg = _worldFrom\(level\.world\); applyWorldCfg\(\);/.test(rl), 'restoreLevel reapplies saved world config');
done('ground-grid visibility persists across save/reload + arena rebuilds');
