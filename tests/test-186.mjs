import { gameSource, extractFunction, evalIn, assert, done } from './harness.mjs';
const src = gameSource();

// trackers declared
assert(/let _skyPending = false;/.test(src), '_skyPending not declared');
assert(/let _texPending = 0;/.test(src), '_texPending not declared');

// _levelAssetsPending: true if models OR sky OR textures are pending
const mk = (g,sk,tx)=> evalIn(extractFunction('_levelAssetsPending'), {_glbPending:g,_skyPending:sk,_texPending:tx});
assert(mk(0,false,0)() === false, 'nothing pending => false (loader not shown)');
assert(mk(2,false,0)() === true, 'models pending => true');
assert(mk(0,true,0)() === true, 'sky pending => true');
assert(mk(0,false,3)() === true, 'textures pending => true');

// applySkyHdri instruments the flag: armed before the load, cleared on success + both failures
const ash = extractFunction('applySkyHdri');
assert(/const proxiedUrl = proxied\(url\); _skyPending = true;/.test(ash), 'sky load does not arm _skyPending');
assert((ash.match(/_skyPending = false;/g)||[]).length >= 3, 'sky pending not cleared on success + failures');

// _loadSurfaceMap counts each map load once and settles once (success or final failure)
const lsm = extractFunction('_loadSurfaceMap');
assert(/_texPending\+\+;/.test(lsm), '_loadSurfaceMap does not increment _texPending');
assert(/const _texFin=\(\)=>\{ if\(_tdone\) return; _tdone=true; _texPending=Math\.max\(0,_texPending-1\); \};/.test(lsm), 'no single-settle _texFin guard');
assert((lsm.match(/_texFin\(\)/g)||[]).length >= 4, '_texFin not wired into success + all failure paths');

// startGame shows the loader for ANY pending asset kind (not just GLBs)
assert(/if\(_levelAssetsPending\(\) \|\| _loadCover\)\{ _loadCover=false; showLevelLoader\(\); waitAssetsThenReveal\(\); \}/.test(src), 'startGame gate not widened to all assets');
// reveal waits on all asset kinds
assert(/if\(!_levelAssetsPending\(\)\)\{ if\(!zeroAt\) zeroAt=now;/.test(src), 'reveal does not wait on all assets');

// the sim is frozen behind the loader so play cannot begin until assets are in
assert(/if\(_levelLoaderActive\)\{ pollGamepad\(dt\); renderScene\(scene,camera\); renderViewmodel\(\); return; \}/.test(src), 'loop does not freeze while the level loader is up');
done();

// regression guard (build 275): _levelLoaderActive must be DECLARED before loop() reads it,
// otherwise the let-binding's temporal dead zone throws on the first animation frame.
import { gameSource as _gs } from './harness.mjs';
const _src = _gs();
const declIdx = _src.indexOf('let _levelLoaderEl=null, _levelLoaderActive=false;');
const loopIdx = _src.indexOf('function loop(){');
assert(declIdx !== -1 && loopIdx !== -1, 'could not locate decl or loop');
assert(declIdx < loopIdx, '_levelLoaderActive declared after loop() -> TDZ crash on first frame');
