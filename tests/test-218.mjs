import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 309: Destroy objective (blow up flagged target props)
assert(/let _destroyTotal=0, _destroyRemain=0; const _destroyMarkers=\[\];/.test(src), 'destroy tracking state');
// flag round-trips through serialize + restore
const pe = extractFunction('propEntry');
assert(/if\(o\.userData\.objective\) e\.obj=1;/.test(pe), 'objective flag serialized');
const ap = extractFunction('applyPropDynState');
assert(/if\(p\.obj\) obj\.userData\.objective=true;/.test(ap), 'objective flag restored');
// setup builds a beacon per target; startObjective hooks it
const setup = extractFunction('_setupDestroyTargets');
assert(/o\.userData\.objective && !o\.userData\._shattered/.test(setup) && /_destroyMarkers\.push\(m\)/.test(setup), 'beacon per live target');
const so = extractFunction('startObjective');
assert(/objectiveActive\(\)==='destroy'\) _setupDestroyTargets\(\); else _clearDestroyMarkers\(\);/.test(so), 'startObjective sets up/tears down targets');
// tick wins when all targets are gone
const ot = extractFunction('objectiveTick');
assert(/objectiveActive\(\)==='destroy'/.test(ot), 'destroy tick branch');
assert(/o\.userData\._shattered \|\| !o\.parent/.test(ot), 'shattered/removed targets drop off');
assert(/if\(_destroyTotal>0 && remain<=0\)\{ if\(typeof gameWon==='function'\) gameWon\(\); \}/.test(ot), 'wins when all targets destroyed (and there were some)');
// HUD + co-op + editor
const hud = extractFunction('objectiveHUD');
assert(/NO TARGETS SET/.test(hud) && /DESTROY '\+\(_destroyTotal-_destroyRemain\)/.test(hud), 'destroy HUD label');
assert(/dd:_destroyTotal-_destroyRemain, dn:_destroyTotal/.test(src), 'destroy progress sent to clients');
const aos = extractFunction('applyObjectiveSnapshot');
assert(/O\.o==='destroy'/.test(aos), 'client shows destroy progress');
assert(/obBtn\('destroy',_icn\('blast'\)\+'Destroy'\)/.test(src), 'editor has a Destroy button (build 819: SVG icon)');
assert(/Objective target/.test(src), 'prop editor exposes the objective-target toggle');
done();
