import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// the cutscene builds the local avatar at the spawn and hides it again on end
assert(/let _cineAvatar=null;/.test(src), '_cineAvatar not declared');
const show = extractFunction('_showCineAvatar');
assert(/buildAvatarVisual\(_cineAvatar,/.test(show), 'cine avatar not built from the avatar pipeline');
assert(/_cineAvatar\.position\.set\(playerSpawn\.x, gy, playerSpawn\.z\)/.test(show), 'cine avatar not placed at the player start');
assert(/terrainHeightAt\(playerSpawn\.x, playerSpawn\.z\)/.test(show), 'cine avatar not seated on the terrain');
assert(/_cineAvatar\.visible=true/.test(show), 'cine avatar never shown');
const hide = extractFunction('_hideCineAvatar');
assert(/mixers\.splice\(mi,1\)/.test(hide), 'cine avatar mixer not removed on hide');
assert(/_cineAvatar\.visible=false/.test(hide), 'cine avatar not hidden after the shot');
// wired into start/end/update
assert(/_cineShowBars\(true\);\s*\n\s*_cineFireShotEv\(_cineData\);[^\n]*\n\s*_showCineAvatar\(\);/.test(src), '_showCineAvatar still called on start (after 1196 fires the first shot event)');
assert(/document\.body\.classList\.remove\('cine'\);\s*\n\s*_hideCineAvatar\(\);/.test(src), '_hideCineAvatar not called on end');
assert(/if\(_cineAvatar && _cineAvatar\.userData\.mixer\) _cineAvatar\.userData\.mixer\.update\(dt\);/.test(src), 'avatar idle mixer not advanced during the shot');
// look target now terrain-aware (both sites), no bare absolute-EYE spawn target remains
assert(/_cineTgt\.set\(playerSpawn\.x, terrainHeightAt\(playerSpawn\.x,playerSpawn\.z\)\+EYE, playerSpawn\.z\)/.test(src), 'look target not terrain-adjusted');
assert(!/_cineTgt\.set\(playerSpawn\.x, EYE, playerSpawn\.z\)/.test(src), 'a bare absolute-EYE look target still remains');
done();
