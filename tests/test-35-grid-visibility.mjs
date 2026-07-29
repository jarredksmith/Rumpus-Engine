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

// build 1133: both sites go through _gridWanted, which keeps worldCfg.grid as the author's switch and
// adds one rule on top — the grid is a VIEWPORT aid, so it never shows in a running game. Its lines
// alias into horizontal bands across the floor at eye height, which is the loudest prototype tell there
// is, and no other engine puts its grid in the game.
const gw = extractFunction('_gridWanted');
assert(/worldCfg\.grid === false\) return false;/.test(gw), 'an explicit false still hides it everywhere');
assert(/try\{ if\(editorOpen\) return true; \}catch\(e\)\{ return true; \}/.test(gw), 'the editor always shows it');
assert(/try\{ return !gameOn; \}catch\(e\)\{ return true; \}/.test(gw), '...and a running game never does');
assert(!/typeof editorOpen/.test(gw) && !/typeof gameOn/.test(gw),
  'guarded with try/catch, not typeof: both are `let`s declared below this and `typeof` THROWS on an uninitialised let');
{
  // executable: the three states
  const mk = (grid, ed, on) => new Function('worldCfg', 'editorOpen', 'gameOn',
    extractFunction('_gridWanted') + '; return _gridWanted;')({ grid }, ed, on)();
  assert(mk(false, true, false) === false, 'grid:false hides it even in the editor');
  assert(mk(true, true, true) === true, 'editor open -> shown');
  assert(mk(true, false, true) === false, 'playing -> hidden');
  assert(mk(true, false, false) === true, 'menu / not playing -> shown');
  assert(mk(undefined, true, false) === true, 'unset defaults to shown');
}

// the fix lives in rebuildArena (so deferred / restore-triggered rebuilds respect it), TDZ-guarded
const ra = extractFunction('rebuildArena');
assert(/grid\.visible = _gridWanted\(\)/.test(ra), 'rebuildArena applies saved grid visibility');
assert(/typeof worldCfg !== 'undefined'/.test(ra) && /catch\(e\)\{\}/.test(ra), 'guarded for the first call (before worldCfg exists)');

// applyWorldCfg still applies it for the no-rebuild toggle case
const awc = extractFunction('applyWorldCfg');
assert(/grid\.visible = _gridWanted\(\)/.test(awc), 'toggle without a resize still works');
// and the two transitions that change the answer without touching worldCfg
assert(/grid\.visible = _gridWanted\(\);   \/\/ build 1133: the grid follows the editor, not the level/.test(src),
  'entering or leaving the editor re-evaluates it');
assert(/grid\.visible = false;   \/\/ build 1133: never show the viewport grid in a running game/.test(src),
  'and pressing Deploy hides it outright');

// saved + restored as part of the world config
const sl = extractFunction('serializeLevel');
assert(/world:\s*Object\.assign\(\{\}, worldCfg\)/.test(sl), 'grid saved inside world config');
const rl = extractFunction('restoreLevel');
assert(/level\.world\)\{ worldCfg = _worldFrom\(level\.world\); applyWorldCfg\(\);/.test(rl), 'restoreLevel reapplies saved world config');
done('ground-grid visibility persists across save/reload + arena rebuilds');
