// build 1119: a real sky — one analytic model that draws the background, lights the world and
// colours the fog.
//
// Before this, `scene.background` was a solid fill of worldCfg.fogColor: sampling the same frame at
// two heights returned identical pixels, and the environment fallback was a 256x128 canvas with a
// white blob painted on for a sun. All four visual critics called the missing sky a kills-it fault.
//
// Measured on the stock level, same camera, before and after: a vertical scan through the sky region
// went from 1 unique colour and a luminance delta of 0.0000 to 74 unique colours and a delta of
// 0.1026 — a real gradient, not a fill.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- one model, written twice
assert(/const SKY_GLSL = \[/.test(src), 'the sky exists as a GLSL snippet');
assert(/function skyRadiance\(dx, dy, dz, P, S\)/.test(src), '...and as a JS twin');
{
  // both must be driven from the same authored numbers, or the sky the camera sees and the sky the
  // lighting is sampled from drift apart
  const uni = extractFunction('_skyUniforms');
  assert(/_skyP\(\)/.test(uni) && /_sunDir\(\)/.test(uni), 'the uniforms come from the same params as the JS twin');
  assert(/uFall:\{value:1\.6\+\(1-P\.turb\)\*3\.4\}/.test(uni), '...including the derived falloff');
  const js = extractFunction('skyRadiance');
  assert(/1\.6 \+ \(1 - P\.turb\) \* 3\.4/.test(js), '...and the JS twin derives it identically');
}

// ---------------------------------------------------------------- run the model
{
  const fn = new Function('Math', extractFunction('skyRadiance') + '; return skyRadiance;')(Math);
  const P = { zenith: [0.18, 0.30, 0.54], horizon: [0.52, 0.60, 0.70], ground: [0.20, 0.19, 0.17],
              turb: 0.35, sunSize: 1.6, sunGlow: 1.0, exp: 1.0 };
  const S = [0, 1, 0];                                   // sun straight up, so the disc is at the zenith
  const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // the ramp is monotonic from horizon to zenith — that is the whole point
  const ramp = [];
  for (let i = 0; i <= 8; i++) { const y = i / 8; ramp.push(L(fn(Math.sqrt(1 - y * y), y, 0, P, { ...S, 0: 1, 1: 0, 2: 0 }))); }
  // (sun on the horizon for the ramp test, so its glow does not mask the gradient)
  const flat = ramp.every((v, i) => i === 0 || Math.abs(v - ramp[0]) < 1e-6);
  assert(!flat, 'the sky is not a flat fill');
  {
    const noSun = { ...P, sunGlow: 0, sunSize: 0.01 };
    const zen = L(fn(0, 1, 0, noSun, [0, -1, 0])), hor = L(fn(1, 0.02, 0, noSun, [0, -1, 0]));
    assert(Math.abs(zen - hor) > 0.05, 'zenith and horizon differ (' + zen.toFixed(3) + ' vs ' + hor.toFixed(3) + ')');
    let prev = null, mono = true;
    for (let i = 0; i <= 10; i++) { const y = i / 10, v = L(fn(Math.sqrt(Math.max(0, 1 - y * y)), y, 0, noSun, [0, -1, 0]));
      if (prev !== null && v > prev + 1e-9) mono = false; prev = v; }
    assert(mono, 'and the ramp is monotonic zenith-ward with the sun out of the way');
  }
  // the sun disc is bright, local, and where the azimuth/elevation say it is
  const at = fn(0, 1, 0, P, [0, 1, 0]);                  // looking straight at the sun
  const off = fn(1, 0, 0, P, [0, 1, 0]);                 // 90 degrees away
  assert(L(at) > L(off) * 8, 'the sun disc is at least 8x the sky beside it (' + (L(at) / L(off)).toFixed(1) + 'x)');
  // below the horizon we get ground, not more sky
  const down = fn(0, -1, 0, P, [0, 1, 0]);
  assert(Math.abs(down[0] - P.ground[0]) < 0.05, 'straight down returns the ground colour');
  // and nothing returns negative light, at any angle
  for (let i = 0; i < 64; i++) { const th = i / 64 * Math.PI * 2, y = Math.cos(i);
    const c = fn(Math.cos(th), y, Math.sin(th), P, [0, 1, 0]);
    assert(c.every(v => v >= 0 && isFinite(v)), 'radiance stays finite and non-negative in every direction'); }
}
{
  // the sun direction must agree with the light that actually casts the shadows
  const fn = new Function('worldCfg', 'Math', extractFunction('_sunDir') + '; return _sunDir;')({ sunAzim: 0, sunElev: 90 }, Math);
  const up = fn();
  assert(up[1] > 0.999, 'elevation 90 points straight up');
  const fn2 = new Function('worldCfg', 'Math', extractFunction('_sunDir') + '; return _sunDir;')({ sunAzim: 90, sunElev: 0 }, Math);
  assert(fn2()[0] > 0.999, 'azimuth 90 at the horizon points along +x — the same convention _sunOrbit uses');
}

// ---------------------------------------------------------------- the dome
{
  const es = extractFunction('_ensureSky');
  assert(/side:THREE\.BackSide/.test(es), 'the dome is inside-out');
  assert(/depthWrite:false/.test(es), '...writes no depth');
  assert(/fog:false/.test(es), '...and is not fogged (it IS the thing fog fades toward)');
  assert(/gl_Position = p\.xyww/.test(es), '...and is pinned to the far plane, so it can never clip geometry');
  assert(/frustumCulled = false/.test(es), '...and is never culled');
  // the bug this caught in testing: a 2-unit box left at the origin is not a sky once you walk away
  assert(/onBeforeRender/.test(es) && /position\.copy\(cam\.getWorldPosition\(_skyCamPos\)\)/.test(es),
    'the dome follows whichever camera is rendering — WORLD position since 1186: a CubeCamera\'s face cameras are children whose local .position is (0,0,0)');
}

// ---------------------------------------------------------------- the sky drives the lighting
{
  const as = extractFunction('applySky');
  assert(/skyLight\.color\.setRGB/.test(as) && /skyLight\.groundColor\.setRGB/.test(as),
    'the hemisphere fill is sampled from the sky model, not hand-picked');
  assert(/Math\.max\(0\.012, v\/n\)/.test(as),
    '...with a floor, so ground lit only by bounce keeps its texture instead of going to zero');
  assert(/scene\.background = null/.test(as), 'the flat background is retired while the dome is up');
  assert(/SCENE_FOG\.color\.setRGB/.test(as), 'fog takes the sky\'s horizon colour, so distance fades INTO the sky');
  assert(/_skyEnv\(\)/.test(as), 'and the same model becomes the environment map');
}
{
  const se = extractFunction('_skyEnv');
  assert(/key === _skyKey/.test(se), 'the environment is rebuilt only when the sky actually changes, never per frame');
  assert(/IS_COARSE/.test(se), '...at a smaller cube on phones');
  assert(/_skyDomeRT && _skyDomeRT\.dispose/.test(se), '...disposing the previous target');
  assert(/_skyDomePMREM/.test(se) && !/[^e]_skyPMREM/.test(se),
    '...using its own PMREM generator, not the HDRI path\'s (which disposes and replaces its own)');
  assert(/catch\(e\)\{ return null; \}/.test(se), '...and never takes the frame down if it fails');
}

// ---------------------------------------------------------------- legacy levels are untouched
assert(/skyMode:'sky'/.test(src), 'new levels get the sky');
{
  const wf = extractFunction('_worldFrom');
  const fn = new Function('DEFAULT_WORLD', wf + '; return _worldFrom;')({ colorV: 2, skyMode: 'sky' });
  eq(fn(null).skyMode, 'sky', 'a fresh level gets the procedural sky');
  eq(fn({ sun: 1 }).skyMode, 'flat', 'a level authored before the sky existed keeps its flat background');
  eq(fn({ sun: 1, skyMode: 'sky' }).skyMode, 'sky', '...unless its author opted in');
  eq(fn({ sun: 1, colorV: 2 }).skyMode, 'sky', 'and a level authored after the colour fix gets it too');
}
assert(/const hdri = \(typeof _skyHdriUrl !== 'undefined'\) && _skyHdriUrl;/.test(src),
  'an authored HDRI still outranks the procedural sky — and the read is TDZ-guarded');

done('build 1119: the sky is a model, not a fill — it draws the background, lights the world and colours the fog');
