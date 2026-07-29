import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// Campaign/co-op load must reset the sky guard so each level's sky re-applies (not stick on level 1's).
const lln = extractFunction('loadLevelFromNet');
// the world-apply line resets _skyHdriUrl to null BEFORE applyWorldCfg so applySkyHdri can't short-circuit
assert(/worldCfg = _worldFrom\(level\.world\); _skyHdriUrl = null; applyWorldCfg\(\);/.test(lln),
  'loadLevelFromNet does not reset the sky guard before applyWorldCfg');
// applySkyHdri still has its same-url short-circuit (the thing we are deliberately bypassing on level load)
const ash = extractFunction('applySkyHdri');
assert(/if\(_skyHdriUrl === url\) return;/.test(ash), 'applySkyHdri guard changed unexpectedly');
// editor path (restoreLevel) is intentionally left alone (loads one level at a time, works)
const rl = extractFunction('restoreLevel');
assert(/worldCfg = _worldFrom\(level\.world\); applyWorldCfg\(\);/.test(rl),
  'restoreLevel world-apply changed unexpectedly');
assert(!/_skyHdriUrl = null/.test(rl), 'restoreLevel should not need the guard reset');
done();
