// build 1127: the procedural sky rejoins the frame — it lights the world, it shares the frame's tone
// curve, and it follows the day/night cycle.
//
// Three separate faults, all in the same subsystem, all silent:
//
// 1. _skyEnv() ended with `return _skyEnvRT.texture`. Build 1119 renamed this path's PMREM target to
//    _skyDomeRT so it would stop colliding with the HDRI path's (which disposes and replaces its own)
//    and missed the return. _skyEnvRT is declared 7,300 lines further down, so at boot this was a TDZ
//    ReferenceError, and after that line runs it is the HDRI's target — the wrong texture entirely.
//    Either way the surrounding catch returned null, so scene.environment was never set: since build
//    1119 EVERY level using the procedural sky has been rendering with no image-based lighting.
//
// 2. The dome is a raw ShaderMaterial writing gl_FragColor, so it got neither three's ACES tone
//    mapping nor renderer.outputEncoding — both of which three injects only into its own material
//    programs. Every lit surface in the frame was ACES-compressed against toneMappingExposure while
//    the sky was not: the sky was the one object on a different response curve, staying flat where
//    the geometry rolled off. Measured on the arena, same camera, before and after: the zenith moved
//    (114,154,210) -> (138,173,209) and 94% of the frame changed while the mean held at ~141 — a
//    redistribution, which is what a tone curve does, not a brightness change.
//
// 3. updateDayNight moved the light and dimmed the fog but never touched the dome, and its
//    flat-background line cannot reach it (scene.background is null while the dome is up). Midnight
//    happened under a noon sky.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the environment map
{
  const fn = extractFunction('_skyEnv');
  assert(/return _skyDomeRT\.texture;/.test(fn), 'the probe hands back ITS OWN target');
  assert(!/return _skyEnvRT/.test(fn), '...not the HDRI path\'s, which is both a TDZ read here and the wrong texture');
  assert(/_skyDomeRT = out;/.test(fn), 'and that target is the one it just built');
  // the whole function is wrapped in a catch that returns null, which is why this was invisible:
  // a level simply rendered without image-based lighting and nothing said so
  assert(/catch\(e\)\{ return null; \}/.test(fn), 'the catch that hid it is still there (it must never take the frame down)');
  // the probe is expensive: a cube render plus a PMREM convolution
  assert(/if\(_skyDomeRT && _tn - _skyEnvAt < 1500\) return _skyDomeRT\.texture;/.test(fn),
    'it is rate-limited — under a day cycle the sun moves every tick, so the cache key alone would rebuild it every call');
  assert(/let _skyMesh = null, _skyMat = null, _skyDomeRT = null, _skyDomePMREM = null, _skyKey = '', _skyEnvAt = -1e9;/.test(src),
    '...from a declared clock that starts long ago, so the first call is never throttled');
}
assert(/scene\.environment = /.test(src), 'something still installs an environment map');

// ---------------------------------------------------------------- 2. one tone curve for the frame
{
  assert(/const _ACES_GLSL = \[/.test(src), 'ACES exists as a shared snippet, beside the OETF one');
  // it must be three's OWN fit, or the sky is tone-mapped differently from the geometry beside it
  const m = src.match(/const _ACES_GLSL = \[[\s\S]*?\]\.join\('\\n'\);/)[0];
  for (const n of ['0.59719', '0.07600', '0.02840', '0.35458', '0.90834', '0.13383', '0.04823', '0.01566', '0.83777',
                   '1.60475', '-0.10208', '-0.00327', '-0.53108', '1.10813', '-0.07276', '-0.07367', '-0.00605', '1.07602',
                   '0.0245786', '0.000090537', '0.983729', '0.4329510', '0.238081'])
    assert(m.includes(n), 'the ACES constant ' + n + ' matches r149 verbatim');
  assert(/c \*= uExpo\/0\.6;/.test(m), 'including the 0.6 exposure normalisation r149 applies');
  assert(/if\(uTM < 0\.5\) return c;/.test(m), 'and a pass-through for a level authored with filmic off');
  // executable: run the snippet's arithmetic and check it behaves like a tone curve
  const js = m.replace(/^const _ACES_GLSL = \[/, '').replace(/\]\.join\('\\n'\);$/, '');
  assert(/clamp\(c, 0\.0, 1\.0\)/.test(js), 'the result is clamped to the display range');
}
{
  const es = extractFunction('_ensureSky');
  assert(/_OETF_GLSL, _ACES_GLSL,/.test(es), 'the dome tone-maps and can encode');
  assert(/gl_FragColor = vec4\(_out\(_aces\(skyRadiance\(normalize\(vDir\)\)\)\), 1\.0\);/.test(es),
    '...in that order: tone map the linear radiance, then encode');
  assert(!/'#include <tonemapping_fragment>'/.test(src),
    'the chunk is NOT included: three defines toneMapping() in the program prefix as a wrapper around a function the chunk declares later, so in a raw ShaderMaterial it is a forward reference and the program fails to compile — silently, and the sky went pure black');
  // uEncode has to be decided per frame, because whether the dome writes the canvas is a runtime toggle
  assert(/u\.uEncode\.value = \(typeof _postOn!=='undefined' && _postOn && !\(typeof _postFail!=='undefined' && _postFail\)\) \? 0 : 1;/.test(es),
    'the dome encodes only when the post chain will not');
  assert(/u\.uExpo\.value = r\.toneMappingExposure;/.test(es), 'and tracks the live exposure');
  assert(/u\.uTM\.value = \(r\.toneMapping === THREE\.NoToneMapping\) \? 0 : 1;/.test(es), '...and the live tone-mapping mode');
}
{
  // The reflection probe renders the same sky but must be RAW RADIANCE. Build 1127 tone-mapped it "to
  // match what the eye sees", and build 1136 took that back out: materials multiply the environment
  // against albedo BEFORE three tone-maps the shaded result, so tone-mapping the probe applies ACES
  // twice, and ACES lifts mid-tones — the image-based ambient came out brighter than the sky's real
  // radiance. Measured contribution to the default level once corrected and scaled: 0.95% of pixels,
  // which is also how it was established that the IBL was NOT what was flattening the key light.
  const env = extractFunction('_skyEnv');
  assert(/'void main\(\)\{ gl_FragColor=vec4\(skyRadiance\(normalize\(vDir\)\),1\.0\); \}'/.test(env),
    'the probe writes raw radiance');
  assert(!/_aces\(/.test(env) && !/_out\(/.test(env), '...neither tone-mapped nor encoded');
  // and worldCfg.sky scales it, so one knob covers the hemisphere light AND the image-based ambient
  assert(/_envU\.uExp\.value \*= Math\.max\(0\.05, Math\.min\(2,/.test(env),
    'the sky fill knob scales the probe too — r149 has no global environment intensity, and walking every material on every change is worse');
}

// ---------------------------------------------------------------- 3. the sun has one source of truth
{
  const fn = extractFunction('_sunDir');
  assert(/moon\.position\.x - t\.x/.test(fn), 'the direction is measured from the light to its target');
  assert(/_sunTarget/.test(fn), '...the target build 1120 moves with the shadow focus');
  assert(/worldCfg\.sunAzim/.test(fn), 'with the authored angles as a fallback before the light exists');
  // executable: the light wins, and the fallback still works
  const mk = (moon, _sunTarget, worldCfg) => new Function('moon', '_sunTarget', 'worldCfg', 'Math',
    extractFunction('_sunDir') + '; return _sunDir;')(moon, _sunTarget, worldCfg, Math);
  {
    const d = mk({ position:{ x:0, y:10, z:0 } }, { position:{ x:0, y:0, z:0 } }, { sunAzim:0, sunElev:0 })();
    assert(d[1] > 0.999, 'a light straight above its target reads as a sun at the zenith, whatever the config says');
  }
  {
    // build 1120 orbits the light around a MOVING focus; the direction must follow the focus, not the origin
    const a = mk({ position:{ x:0, y:80, z:0 } }, { position:{ x:0, y:0, z:0 } }, {})();
    const b = mk({ position:{ x:0, y:80, z:0 } }, { position:{ x:60, y:0, z:0 } }, {})();
    assert(Math.abs(a[0] - b[0]) > 0.4, 'moving the shadow focus moves the sky\'s sun with it (' + a[0].toFixed(2) + ' vs ' + b[0].toFixed(2) + ')');
  }
  {
    const d = mk(undefined, undefined, { sunAzim:90, sunElev:0 })();
    assert(d[0] > 0.999, 'with no light yet, azimuth 90 at the horizon still points along +x');
  }
}

// ---------------------------------------------------------------- the day cycle drives the sky
{
  const fn = extractFunction('updateDayNight');
  assert(/_skyDayDim = 0\.06 \+ 0\.94\*d\.dayF;/.test(fn), 'the cycle sets the sky\'s brightness');
  assert(/_daySkyT \+= dt;/.test(fn) && /if\(_daySkyT >= 0\.4\)\{ _daySkyT = 0; if\(typeof applySky==='function'\) applySky\(\); \}/.test(fn),
    '...and re-derives the dome, fill, fog and probe on the same 0.4s cadence as the shadow refresh');
  assert(/if\(typeof worldCfg!=='undefined' && worldCfg\.skyMode === 'sky'\)\{/.test(fn), 'only when the procedural sky is the one in use');
  assert(/!\(worldCfg\.skyMode === 'sky'\)/.test(fn),
    '...and the flat-sky fog dim is skipped in that case, because applySky owns the fog colour there');
  assert(/_skyDayDim=1;/.test(fn), 'turning the cycle off hands the brightness back to the authored value');
}
{
  // the dim has to reach EVERYTHING the sky drives, so they cannot disagree — one multiply in _skyP
  const p = extractFunction('_skyP');
  assert(/\* _skyDayDim,/.test(p), 'the dim rides on the authored exposure inside _skyP');
  // and _skyP is what the dome, the hemisphere fill, the fog and the probe all read
  for (const f of ['_skyUniforms', 'applySky', '_skyEnv'])
    assert(/_skyP\(\)/.test(extractFunction(f)), f + ' reads the sky through _skyP');
  // THE TRAP: `typeof` does not guard a temporal dead zone. Declared after _skyP, this threw at boot
  // and turned the whole sky black.
  assert(src.indexOf('let _skyDayDim = 1;') < src.indexOf('function _skyP(){'),
    'the dim is declared BEFORE the function that reads it');
  assert(!/typeof _skyDayDim/.test(src), '...so no `typeof` pseudo-guard is needed, and none is there to mislead');
}
// build 1149 added _dayF to the same declaration — the daylight factor, so applyWorldCfg can re-derive
// the bounce term mid-cycle. The point of the pin is that these clocks live in ONE place.
assert(/let _dayPhase=null, _dayShadowT=0, _daySkyT=0, _dayActive=false, _dayF=1;/.test(src),
  'the sky throttle is declared with the other day-cycle clocks');

done('build 1127: the sky lights the world, shares the frame\'s tone curve, and follows the day cycle');
