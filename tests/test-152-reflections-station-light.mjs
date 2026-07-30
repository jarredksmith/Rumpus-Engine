import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// Reflection strength still tracks metalness — but build 1144 put a FLOOR under it, because
// envMapIntensity scales the diffuse ambient too, so `= metalness` left a matte surface with no sky
// light at all. Above the floor, every value is exactly what it was.
assert(/o\.material\.envMapIntensity = _envInten\(m\);/.test(src), 'prop reflection tracks metalness');
assert(/floorMat\.envMapIntensity = _envInten\(floorMat\.metalness, worldCfg\.skyBright\);/.test(src), 'floor reflection tracks metal slider, scaled by sky brightness');
assert(/wallMat\.envMapIntensity = _envInten\(wallMat\.metalness, worldCfg\.skyBright\);/.test(src), 'wall reflection tracks metal slider, scaled by sky brightness');
assert(/Math\.max\(SKY_ENV_FLOOR, \+metal \|\| 0\)/.test(src), '...and the floor only ever RAISES it, so a tuned metal is untouched');
// station light
assert(/function applyStationLight\(\)/.test(src) && /station\.light\.color\.setHex/.test(src), 'station light apply helper');
assert(/applyStationLight\(\); \}/.test(src), 'station transform apply also applies the light');
assert(/<b>Station light<\/b>/.test(src) && /mkSL\('Intensity','lightInt'/.test(src) && /mkSL\('Distance','lightDist'/.test(src), 'station light controls (color/intensity/distance)');
done('reflections-station-light');
