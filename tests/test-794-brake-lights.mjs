// (build 794) Brake lights — two red additive glow sprites at the car's tail that light up when you brake, reverse, or
// handbrake. Sprites (not scene lights) so toggling is just an opacity change (no shader-recompile freeze). Toggle +
// colour/size/position controls in the editor, previewed lit on the selected car, serialized when enabled.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// --- runtime: sprite-based, opacity toggled (never a scene-light count change) ---
assert(/let _brakeL=null, _brakeR=null;/.test(src), 'brake-light sprites are held in module state');
const eb = extractFunction('_ensureBrakeLights');
assert(/new THREE\.Sprite\(new THREE\.SpriteMaterial\(\{ map:fireSoftTex\(\), color:0xff2020[\s\S]*?blending:THREE\.AdditiveBlending/.test(eb), 'the lights are additive red glow sprites (cheap; no recompile)');
assert(/function _brakeLightsOff\(\)\{ if\(_brakeL\) _brakeL\.material\.opacity=0;/.test(src), 'off = opacity 0 (not visibility)');

// --- placement sits at the TAIL, uses the oriented footprint, and lights per the passed state ---
const pb = extractFunction('_placeBrakeLights');
assert(/const back=-\(f\.hd\*0\.95\) - \(\+cfg\.brakeBack\|\|0\)/.test(pb), 'the lights sit at the tail (negative forward), trimmable by brakeBack');
// build 802: the vertical offset has NO floor, so brakeY can drop the lights all the way down (and below) the model base
assert(/up=\(f\.hh\*0\.5 \+ \(\+cfg\.brakeY\|\|0\)\)/.test(pb) && !/Math\.max\(0\.12, f\.hh\*0\.5/.test(pb), 'the brake height has no lower clamp (build 802)');
// build 804: the tail-light offset is rotated onto the tilted body so it rides ramps / jumps
assert(/const f=_carFoot\(o\), Q=_carBodyQuat\(o, cy\);/.test(pb) && /_cbVec\.set\(f\.ox \+ sep\*s, up, -\(f\.oz\+back\)\)\.applyQuaternion\(Q\);/.test(pb), 'brake lights ride the car body tilt (build 804)');
assert(/S\.material\.opacity=lit;/.test(pb), 'the lit amount drives the sprite opacity');

// --- update only lights the car you are driving ---
const ub = extractFunction('_updateBrakeLights');
assert(/if\(!cfg\.brakeLights \|\| drivingCar!==o\)\{ _brakeLightsOff\(\); return; \}/.test(ub), 'brake lights only show on the car you drive');

// --- driveUpdate lights them on braking / reverse / handbrake ---
assert(/_updateBrakeLights\(o, cfg, \(handbrake \|\| throttle<-0\.01\)\);/.test(extractFunction('driveUpdate')), 'braking = handbrake OR reverse/brake input');

// --- exit + editor teardown ---
assert(/if\(typeof _brakeLightsOff==='function'\) _brakeLightsOff\(\);/.test(extractFunction('exitCar')), 'brake lights go off when you leave the car');
assert(/_editorHeadlightPreview\(_sv\); _editorBrakePreview\(_sv\);/.test(src), 'the editor previews the brake lights on the selected car');

// --- vehicleApply sanitizes; serialize persists only when enabled ---
const va = extractFunction('vehicleApply');
assert(/brakeLights:!!v\.brakeLights, brakeColor:\(v\.brakeColor!=null\?\(v\.brakeColor\|0\):0xff2020\), brakeSize:\(v\.brakeSize==null\?0\.5:Math\.max\(0\.12,Math\.min\(2,\+v\.brakeSize\|\|0\)\)\)/.test(va), 'brake fields are sanitized with defaults');
assert(/if\(V\.brakeLights\)\{ e\.veh\.brakeLights=1;/.test(src), 'brake lights are serialized only when enabled');

// --- editor UI: a toggle + a colour picker + position sliders ---
assert(/<b>Brake lights<\/b> — red glow at the tail when braking \/ reversing/.test(src), 'the editor has a Brake lights toggle + hint');
assert(/row\('Size','brakeSize', 0\.12, 2, 0\.02, 1\);/.test(src) && /row\('Height \(±m\)','brakeY', -8, 8, 0\.05, 1\);/.test(src) && /row\('Back \(±m\)','brakeBack', -8, 8, 0\.05, 1\);/.test(src), 'brake lights expose size + a wide-range height/back/spread (build 800)');

done('build 794: brake lights — red tail glow on braking/reverse, editor-tunable');
