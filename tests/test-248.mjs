import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 350: multi-shot cutscenes — shots chain with hard cuts; per-shot duration up to 120s.

// --- executable: shot advancement in updateCinematic (stubbed camera/world) ---
const norm = new Function(extractFunction('_normCineShot') + '\nreturn _normCineShot;')();
const s1 = norm({ path:[[0,5,0],[10,5,0]], dur:2, lensFrom:35 });
const s2 = norm({ path:[[50,9,50],[60,9,50]], dur:3, lensFrom:80 });
near(s1.dur, 2, 1e-9); near(s2.lensFrom, 80, 1e-9);
assert(/const raw = Array\.isArray\(data\.shots\) \? data\.shots : \[data\];/.test(extractFunction('startCinematic')), 'legacy single-shot callers still accepted');
assert(/_cineShots = raw\.filter\(s=>s && s\.path && s\.path\.length\)\.map\(_normCineShot\);/.test(extractFunction('startCinematic')), 'empty shots are dropped before play');
const uc = extractFunction('updateCinematic');
assert(/if\(_cineShots && _cineShotIdx < _cineShots\.length-1\)\{ _cineShotIdx\+\+; _cineData=_cineShots\[_cineShotIdx\]; _cineT=0; _cineFireShotEv\(_cineData\); \}/.test(uc), 'shot end hard-cuts to the next shot (and since 1196 fires its event)');
assert(uc.indexOf('else endCinematic();') > uc.indexOf('_cineShotIdx++'), 'sequence ends only after the last shot');

// --- duration cap raised per shot ---
assert(/crow\('Duration', CS\.dur, 1, 120, 0\.5, 's'/.test(src), 'per-shot duration up to 120s');

// --- editor shot selector binds the controls to one shot ---
assert(/const CS = cineAllShots\(\)\[_cineShotSel\];/.test(src), 'CS binding for the selected shot');
assert(/<b>Shot '\+\(_cineShotSel\+1\)\+' \/ '\+N\+'<\/b>/.test(src), 'Shot k / N readout');
assert(/CC\.shots2\.push\(_newCineShot\(\)\)/.test(src), 'Add shot appends to the SELECTED cutscene (build 356)');
assert(/const nx=CC\.shots2\.shift\(\); CC\.path=nx\.path;/.test(src), 'deleting shot 1 promotes shot 2, within the selected cutscene (build 356)');
assert(/total '\+cineAllShots\(\)\.reduce\(\(s,x\)=>s\+\(\+x\.dur\|\|0\),0\)\.toFixed\(1\)\+'s'/.test(src), 'total runtime readout');

// --- sequence persistence + intro/preview play the whole list ---
assert(/shots2: \(cineCfg\.shots2\|\|\[\]\)\.map\(s=>\(\{ path:\(s\.path\|\|\[\]\)\.map\(q=>q\.slice\(\)\)/.test(src), 'extra shots serialize deep-copied');
assert(/cineCfg\.shots2 = Array\.isArray\(lc\.shots2\) \? lc\.shots2\.map/.test(extractFunction('_applyCine')), 'extra shots restore on level load');
assert(/startCinematic\(\{ shots: cineShotsOf\(cineCfg\), audio: cineCfg\.audio \}, false\)/.test(src) && /const _cc=_curCutscene\(\); startCinematic\(\{ shots: cineShotsOf\(_cc\), audio: _cc\.audio \}, true\)/.test(src), 'intro plays cutscene #1; preview plays the selected one (build 356)');
assert(/function cineHasData\(\)\{ return _ccHasData\(_curCutscene\(\)\); \}/.test(src) && /function _ccHasData\(cc\)\{ return !!\(cc && cineShotsOf\(cc\)\.some\(s=>s\.path && s\.path\.length>=1\)\); \}/.test(src), 'cineHasData counts any shot of the selected cutscene (build 356)');

// --- level check goes per-shot ---
const li = new Function('propModels','pickupSpots','POWERUP_KINDS','keyDisplayName','pickupsOn','audioZones','cineCfg',
  extractFunction('levelIssues') + '\nreturn levelIssues();');
const run = (cine) => li([], [], {}, c=>c, true, [], cine);
assert(run({ on:true, path:[[0,0,0],[1,1,1]], shots2:[{ path:[[2,2,2]] }] }).some(m=>/shot 2/.test(m)), 'a one-point extra shot is flagged by number');
assert(run({ on:true, path:[[0,0,0],[1,1,1]], shots2:[{ path:[[2,2,2],[3,3,3]] }] }).length === 0, 'two valid shots -> clean');
done();
