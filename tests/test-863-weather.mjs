// (build 863) WEATHER — rain / snow as ONE recycled THREE.Points cloud riding the camera:
// per-drop fall speed + sway phase in a flat Float32Array, drops respawn at the top of the 46x30 box
// when they fall out, zero per-frame allocation, count scales with Amount and halves on touch devices.
// World > Sky gets None/Rain/Snow buttons + an Amount slider; settings live in worldCfg so they save,
// share and carry to multiplayer like everything else.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

const rw = src.match(/function refreshWeather\(\)\{[\s\S]{0,1800}?\n\}/)[0];
assert(/\(kind==='rain'\?1400:900\)\*amt/.test(rw), 'count scales with kind + Amount');
assert(/IS_COARSE \? base\/2 : base/.test(rw), 'halved on touch devices');
assert(/new THREE\.Points\(geo, mat\)/.test(rw) && !/WebGLRenderTarget/.test(rw), 'one Points cloud, no render targets');
assert(/frustumCulled=false/.test(rw), 'never culled (the box rides the camera)');

const uw = src.match(/function updateWeather\(dt\)\{[\s\S]{0,2200}?\n\}/)[0];
assert(/_weatherPts\.position\.set\(cam\.position\.x, cam\.position\.y-6, cam\.position\.z\)/.test(uw), 'the box follows the camera');   // build 864 reshaped the update
assert(/y=_WEATHER_BOX\.h\*\(0\.8\+Math\.random\(\)\*0\.2\)/.test(uw), 'fallen drops respawn at the top (recycled, not reallocated)');
assert(/Math\.sin\(_weatherT\*1\.3\+ph\)/.test(uw), 'snow sways per-drop');
assert(/x\+=wind\.x\*1\.7\*dt/.test(uw), 'rain leans with the wind');
assert(/needsUpdate=true/.test(uw), 'positions upload once per frame');

// plumbing
assert(/weather:'none', weatherAmt:0\.6,/.test(src.match(/const DEFAULT_WORLD = \{[^\n]*/)[0]), 'defaults ship');
assert(/worldCfg\.weather = \(worldCfg\.weather==='rain'\|\|worldCfg\.weather==='snow'\) \? worldCfg\.weather : 'none';/.test(src), 'sanitized to the three valid values');
assert(/refreshWeather\(\);/.test(src.match(/function applyWorldCfg[\s\S]{0,4000}/)[0]), 'applyWorldCfg rebuilds the cloud when settings change (covers load/share/restore too)');
assert(/updateWeather\(dt\);/.test(src.match(/updateDayNight\(dt\);[^\n]*/)[0]), 'ticked beside the day/night cycle');
assert(/\[\['none','None'\],\['rain','Rain'\],\['snow','Snow'\]\]/.test(src), 'World > Sky exposes the three modes');
// the state must live ABOVE applyWorldCfg (it reads it at boot — the TDZ class the boot harness exists for)
assert(src.indexOf("let _weatherPts=null") < src.indexOf("function applyWorldCfg"), 'weather state is declared before applyWorldCfg (no boot TDZ)');

done('build 863: rain + snow — recycled camera-riding particle cloud, device-aware counts, full worldCfg plumbing');
