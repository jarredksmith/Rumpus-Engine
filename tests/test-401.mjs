import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();

// build 526: third-person camera framing + gunfire origin travel with the roster character.
assert(/grip:_sanitizeGripMap\(c\.grip\), view:_sanitizeView\(c\.view\) \}; \}/.test(src), 'sanitizeCharCfg carries a view');
assert(/grip:_sanitizeGripMap\(tpGunGrips\), view:_snapshotView\(\) \}\);/.test(src), 'snapshot bakes the current framing into the character');
assert(/grip:_sanitizeGripMap\(c\.grip\), view:_sanitizeView\(c\.view\) \}\)\),/.test(src), 'serializeLevel roster carries the view');
assert(/if\(c\.view\) _applyView\(c\.view\);/.test(src), 'loadCharIntoEditor restores the framing for editing');
// selecting a roster character applies its framing; default restores the viewer's own
assert(/myRosterIdx>=0 && charRoster\[myRosterIdx\] && charRoster\[myRosterIdx\]\.view\) _applyView\([^;]*\); else _loadPersonalView\(\)/.test(src), 'select applies char view, default restores personal view');

// executable: sanitize clamps out-of-range values and drops a non-object; apply is round-tripped by snapshot
const _viewClamp = new Function('return (' + extractFunction('_viewClamp') + ')')();
const _sanitizeView = new Function('_viewClamp', 'return (' + extractFunction('_sanitizeView') + ')')(_viewClamp);
assert(_sanitizeView(null) === null, 'no view object -> null (falls back to personal prefs)');
const s = _sanitizeView({ tpSide:99, tpDist:0, tpMuzFwd:1.2 });   // tpSide over max, tpDist under min, rest default
near(s.tpSide, 3, 1e-9, 'tpSide clamps to +3');
near(s.tpDist, 1.5, 1e-9, 'tpDist clamps to 1.5 min');
near(s.tpMuzFwd, 1.2, 1e-9, 'in-range value preserved');
near(s.tpAimSide, 0.9, 1e-9, 'missing aim-side falls to default 0.9');
done();
