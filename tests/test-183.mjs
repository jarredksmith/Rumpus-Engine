import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// loadLevelFromNet (campaign + co-op load path) must restore the per-level extraction spot
// build 1454: both loaders reach ONE applier, and this pin is where the drift showed. Before 1454 the
// net copy refreshed the extraction marker and the EDITOR copy did not — so loading a level, or pressing
// undo, left the marker on the previous level's spot unless you happened to be on the extract tab. The
// intent here was always "the spot is restored and its marker refreshed on the load path"; it is now
// true of BOTH paths, and cannot drift again because there is only one statement.
const app = extractFunction('_applyLevelSections');
assert(/extractSpot = level\.extract \? \{ x:level\.extract\.x\|\|0, z:level\.extract\.z\|\|0 \} : null;/.test(app), 'the applier does not restore extractSpot');
assert(/refreshExtractMarker\(\)/.test(app), 'the applier does not refresh the extraction marker');
for (const loader of ['loadLevelFromNet', 'restoreLevel'])
  assert(/_applyLevelSections\(level\)/.test(extractFunction(loader)), loader + ' does not reach the applier');
// serialize still writes it and restoreLevel still reads it (regression guard)
assert(/extract: extractSpot \? \{ x: \+extractSpot\.x\.toFixed\(3\), z: \+extractSpot\.z\.toFixed\(3\) \} : null/.test(src), 'serializeLevel no longer saves the extract spot');

done();
