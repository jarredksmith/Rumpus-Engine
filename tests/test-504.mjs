import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 654: the ammo/buy station is optional per level (not every game wants a restock terminal). Default ON
// so existing levels are unchanged; a checkbox in the Station tab builds it / tears it down, serialized as
// `stationEnabled`.

// --- state defaults ON, only OFF when the level explicitly saved false ---
assert(/let stationEnabled = !\(savedLevel && savedLevel\.stationEnabled===false\);/.test(src), 'stationEnabled defaults ON (back-compat)');

// --- build is guarded; teardown + toggle exist ---
assert(/function buildStation\(\)\{\s*if\(!stationEnabled\)\{ station = null; return; \}/.test(src), 'buildStation early-returns when disabled');
assert(/function teardownStation\(\)\{/.test(src), 'teardownStation removes the station from scene + colliders');
assert(/scene\.remove\(station\.group\)/.test(src), 'teardown removes the visual group');
assert(/const i=colliders\.indexOf\(station\.collider\); if\(i>=0\) colliders\.splice\(i,1\)/.test(src), 'teardown removes its collider');
assert(/function setStationEnabled\(on\)\{[\s\S]*?if\(stationEnabled\)\{ if\(!station\) buildStation\(\); \}\s*else teardownStation\(\);/.test(src), 'setStationEnabled builds or tears down');

// --- gameplay stays null-safe (proximity already guards) ---
assert(/if\(station\)\{\s*\n\s*const d = Math\.hypot\(player\.pos\.x-station\.pos\.x/.test(src), 'proximity check guards on station (no crash when off)');

// --- serialize + restore ---
assert(/stationEnabled: !!stationEnabled,/.test(src), 'serialized with the level');
assert(/setStationEnabled\(!\(level\.stationEnabled===false\)\);/.test(src), 'restore builds/tears down to match the level');
// build 1401: `if(level.station && station)` WAS the defect. `setStationEnabled(false)` runs first and tears
// the object down, so a level shipping a custom station DISABLED found `station` null and silently kept the
// PREVIOUS level's model url — re-enabling it in the editor then built the previous level's station. The
// config is level DATA and lands either way; only the LOAD waits for something to load into, which is what
// this assertion always meant.
{
  const kit = extractFunction('_applyLevelKit');
  assert(/if\(level\.station\)\{/.test(kit), 'the station config applies whenever the level carries one');
  assert(/if\(_su && _su !== stationModelUrl\)\{ if\(station\) swapStationModel\(_su\); else stationModelUrl = _su; \}/.test(kit),
    '...loading the model only when there is a station to load it into, and otherwise landing the url as data');
  assert(/if\(station && editorTargets\.station\.apply\) editorTargets\.station\.apply\(\);/.test(kit),
    '...and the transform is only APPLIED when a station exists');
  assert(!/if\(level\.station && station\)\{/.test(src), 'and the old gate that swallowed the url is gone');
}

// --- editor toggle UI + hiding the inert editors when off ---
assert(/if\(editorActive==='station'\)\{[\s\S]*?cb\.type='checkbox'; cb\.checked=!!stationEnabled;[\s\S]*?setStationEnabled\(cb\.checked\)/.test(src), 'a checkbox in the Station tab toggles it');
assert(/const _stationOff = \(editorActive==='station' && !stationEnabled\);/.test(src), 'a station-off flag drives the hiding');
assert(/if\(tgt\.urlField && !_stationOff\)\{/.test(src), 'the model import hides when the station is off');
assert(/tgt\.fields\.length && !_stationOff\)/.test(src), 'the transform sliders hide when the station is off');

done('build 654: the ammo station is an optional per-level toggle');
