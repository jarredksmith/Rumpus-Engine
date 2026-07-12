import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/if\(_levelLoaderActive\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'movement frozen while loading');
assert(/if\(!_ledge && _jPressed && player\.onGround && \(player\.jumpCd\|\|0\)<=0 && !_levelLoaderActive && matchWarmup<=0 && !mountedTurret\)\{ player\.vel\.y = JUMP/.test(src), 'jump blocked while loading (and during the pre-match warmup)');
assert(/&& !heldProp && !editorOpen && !_levelLoaderActive && !drivingCar && !\(typeof buildMode!=='undefined' && buildMode\)\)\{ if\(mountedTurret\) turretFire\(\); else shoot\(\); \}/.test(src), 'firing blocked while loading (and while driving)');
done('loader-input-lock');
