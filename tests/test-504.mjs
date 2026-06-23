import { gameSource, assert, done } from './harness.mjs';
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
assert(/if\(level\.station && station\)\{/.test(src), 'station transform only applied when a station exists');

// --- editor toggle UI + hiding the inert editors when off ---
assert(/if\(editorActive==='station'\)\{[\s\S]*?cb\.type='checkbox'; cb\.checked=!!stationEnabled;[\s\S]*?setStationEnabled\(cb\.checked\)/.test(src), 'a checkbox in the Station tab toggles it');
assert(/const _stationOff = \(editorActive==='station' && !stationEnabled\);/.test(src), 'a station-off flag drives the hiding');
assert(/if\(tgt\.urlField && !_stationOff\)\{/.test(src), 'the model import hides when the station is off');
assert(/tgt\.fields\.length && !_stationOff\)/.test(src), 'the transform sliders hide when the station is off');

done('build 654: the ammo station is an optional per-level toggle');
