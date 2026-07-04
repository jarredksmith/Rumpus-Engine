// (build 864) WEATHER LOOKS LIKE WEATHER — the 863 particles were untextured Points (literal squares):
//  - RAIN is now a LineSegments streak field: 2 verts per drop, the tail sits back UP the fall+wind
//    velocity vector, so every streak leans exactly with the wind and stretches with fall speed × Size;
//  - SNOW flakes render through a radial-gradient CanvasTexture sprite — soft round flakes, alphaTest
//    trims the quad corners;
//  - new controls: Size (0.5-2, streak length / flake size), Wind (0-3) + Wind dir ° (0-360) — snow
//    drifts along it, rain leans into it. All sanitized + serialized via worldCfg like the rest.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// rain = streaks
const rw = src.match(/function refreshWeather\(\)\{[\s\S]{0,2600}?\n\}/)[0];
assert(/new THREE\.LineSegments\(geo, mat\)/.test(rw), 'rain is a LineSegments streak field');
assert(/new Float32Array\(n\*6\)/.test(rw), '...with 2 verts per drop');
assert(/map:_weatherSprite\(\)/.test(rw) && /alphaTest:0\.04/.test(rw), 'snow flakes render through the soft sprite');
assert(/createRadialGradient/.test(src.match(/function _weatherSprite[\s\S]{0,900}/)[0]), 'the sprite is a radial-gradient canvas (round + soft)');

// the streak geometry leans with the velocity — executable
const windFn = new Function('worldCfg','Math', extractFunction('_weatherWindVec') + 'return _weatherWindVec;');
const wv = windFn({ weatherWind:2, weatherWindDir:90 }, Math)();
near(wv.x, 2, 1e-9, 'wind dir 90 blows along +X');
near(wv.z, 0, 1e-9, '...and nowhere else');
eq(windFn({ weatherWind:99, weatherWindDir:0 }, Math)().z, 3, 'wind strength clamps at 3');
const uw = src.match(/function updateWeather\(dt\)\{[\s\S]{0,3200}?\n\}/)[0];
assert(/const len=\(0\.35\+spd\*0\.022\)\*size, vy=-spd, vx=wind\.x\*1\.7, vz=wind\.z\*1\.7;/.test(uw), 'streak length scales with speed × Size');
assert(/a\[i\*6\+3\]=x-vx\*k; a\[i\*6\+4\]=y-vy\*k; a\[i\*6\+5\]=z-vz\*k;/.test(uw), 'the tail sits back up the velocity vector (streaks lean with the wind)');
assert(/x\+=\(wind\.x\*0\.9\+Math\.sin\(_weatherT\*1\.3\+ph\)\*0\.55\)\*dt/.test(uw), 'snow drifts along the wind on top of its sway');

// controls + plumbing
assert(/weatherSize:1, weatherWind:1, weatherWindDir:90,/.test(src.match(/const DEFAULT_WORLD = \{[^\n]*/)[0]), 'defaults ship');
assert(/worldCfg\.weatherSize = Math\.max\(0\.5, Math\.min\(2,/.test(src) && /worldCfg\.weatherWind = Math\.max\(0, Math\.min\(3,/.test(src), 'sanitized');
assert(/slider\(b,'Size','weatherSize',0\.5,2,0\.05\);/.test(src) && /slider\(b,'Wind','weatherWind',0,3,0\.05\); slider\(b,'Wind dir °','weatherWindDir',0,360,5\);/.test(src), 'the Sky fold exposes Size + Wind + Wind dir');

done('build 864: rain streaks lean with the wind, snow is soft round flakes, Size/Wind/Wind-dir controls');
