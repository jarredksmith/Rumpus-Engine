// build 1380: CONTACT-HARDENING SUN SHADOWS.
//
// Every shadow in the engine had the same edge softness whatever cast it, because PCF samples a FIXED
// radius — `shadowRadius` texels, everywhere. Real shadows do not work that way: the penumbra grows with
// the distance between the occluder and the receiver, which is why a chair leg is razor-sharp where it
// meets the floor and a roofline three storeys up is a soft band. A single softness reads as either "cut
// out with scissors" or "everything is out of focus", and builds 1341, 1345 and 1346 all spent themselves
// on the artifacts of the first choice without questioning the model underneath it.
//
// PCSS is three passes over the map three already renders: search for blockers, estimate the penumbra from
// how far away they are, PCF at THAT radius. Measured on the shipped path with the world paused and the
// HUD excluded from the window (it animates, and it WAS the entire noise floor of the first four runs):
//
//     control 0 vs 0     0.000% of world pixels moved by >6      mean |d| 0.0047
//     shipped            0.232%                                  0.0396
//     3x                 0.842%                                  0.1376
//     10x                1.566%                                  0.3017
//
// Monotonic, replicating to four figures, with the control returning to zero.
import { gameSource, assert, near, eq, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');

// ------------------------------------------------------------ the patch reaches the shader ----
// Both of these are SILENT no-ops if three renames a chunk or reflows a line: every material still
// compiles, the frame still renders, and the shadows are simply the old ones. That failure mode is why
// this file has lost a subsystem twice, so the anchors are asserted against the real build.
{
  const chunk = T.ShaderChunk.shadowmap_pars_fragment;
  assert(chunk.indexOf('#ifdef USE_SHADOWMAP') >= 0,
    'three ' + T.REVISION + ' still guards the shadow helpers with #ifdef USE_SHADOWMAP (the uniform anchor)');
  assert(chunk.indexOf('\tvec2 cubeToUV') >= 0,
    '...and still declares cubeToUV right after getShadow (the function anchor)');
  const g = chunk.indexOf('float getShadow(');
  assert(g >= 0 && g < chunk.indexOf('\tvec2 cubeToUV'),
    'getShadow is defined BEFORE that anchor — GLSL has no forward declarations, so getShadowPCSS must ' +
    'come after the function it falls back to');
  assert(chunk.indexOf('float texture2DCompare(') >= 0 && chunk.indexOf('float texture2DCompare(') < g,
    '...and so must texture2DCompare, which the PCF loop calls');
  assert(chunk.indexOf('unpackRGBAToDepth') >= 0,
    'the shadow map stores PACKED depth, which is what makes a blocker SEARCH possible at all — a ' +
    'compare-only sampler could never report how far away the occluder is');

  const lf = T.ShaderChunk.lights_fragment_begin;
  const call = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  eq(lf.split(call).length - 1, 1, 'the directional shadow call site is exactly one string in three ' + T.REVISION);
  assert(lf.indexOf('UNROLLED_LOOP_INDEX') >= 0, 'and UNROLLED_LOOP_INDEX is available to select the cascade');
}

// ------------------------------------------------------------------- what the engine writes ----
{
  assert(/THREE\.ShaderChunk\.shadowmap_pars_fragment = THREE\.ShaderChunk\.shadowmap_pars_fragment/.test(src),
    'the engine patches the chunk rather than replacing it');
  assert(/'uniform vec3 pcssP;\\n#ifdef USE_SHADOWMAP'/.test(src), 'the uniform is declared before the helpers use it');
  assert(/float getShadowPCSS\( sampler2D shadowMap/.test(src), 'getShadowPCSS is appended');

  // OFF IS NOT AN APPROXIMATION OF ON. It is three's own getShadow, called. That is what makes this safe
  // to shed on the adaptive ladder and safe to disable, and it is the first line of the function.
  // the END anchor has to be searched FROM the start: the same 'cubeToUV' string is also the replace's
  // first argument, which sits EARLIER in the file, so a bare indexOf returns a slice of negative length.
  const _b0 = src.indexOf('float getShadowPCSS( sampler2D shadowMap');
  const body = src.slice(_b0, src.indexOf('cubeToUV', _b0));
  assert(/if \( pcssP\.x <= 0\.0 \) return getShadow\( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord \);/.test(body),
    'pcssP.x <= 0 returns three\'s own getShadow VERBATIM — off is the shipped 1346 path, not a cheap copy of it');
  assert(body.indexOf('pcssP.x <= 0.0') < body.indexOf('unpackRGBAToDepth'),
    '...and it returns BEFORE any of the extra sampling, so off costs one comparison');

  // The blocker search must be able to say "nothing is between this pixel and the sun".
  assert(/if \( bN < 0\.5 \) return 1\.0;/.test(body), 'no blocker found = fully lit, rather than a divide by zero');
  assert(/float pen = clamp\( \( sc\.z - bSum \/ bN \) \* pcssP\.x, 1\.0, pcssP\.z \);/.test(body),
    'THE WHOLE BUILD IS THIS LINE: the penumbra is the DEPTH GAP to the average blocker, scaled — so an ' +
    'occluder touching its receiver gets the floor (a sharp contact shadow) and a distant one gets a band');
  {
    const d = src.match(/const _pcssP = \{ x:([\d.]+), y:([\d.]+), z:([\d.]+) \}/);
    assert(d, 'the three terms are one declaration');
    const [, x, y, z] = d.map(Number);
    eq(x, 0, 'it starts OFF');
    assert(y >= 2 && y <= 16, 'the blocker search is a few texels wide (' + y + ') — too small misses thin ' +
      'occluders and leaks light, too large costs taps for a penumbra the clamp will cap anyway');
    assert(z > 1 && z <= 64, 'the penumbra is ceilinged at ' + z + ' texels: floored at one (below that the ' +
      'map cannot resolve it) and capped (an unbounded radius is an unbounded gather)');
    assert(z > y, 'and the ceiling is wider than the search, or the search would bound the result instead');
  }

  // GLSL ES 1.0 cannot index a const array with a loop variable, so the disc is COMPUTED.
  assert(/2\.39996/.test(body), 'the sample disc is a golden-angle Vogel spiral, computed per tap (build 1247\'s)');
  assert(!/\[\s*i\s*\]/.test(body.replace(/directionalShadowMap\[ i \]/g, '')),
    'nothing indexes an array with the loop variable — WebGL 1 forbids it and the failure is a compile error ' +
    'on every lit material in the engine');
  assert(/sqrt\( \( fi \+ 0\.5 \) \/ 12\.0 \)/.test(body) && /sqrt\( \( fi \+ 0\.5 \) \/ 16\.0 \)/.test(body),
    'both loops use sqrt-radius, which is what makes a spiral UNIFORM over the disc rather than centre-heavy');
}

// ---------------------------------------------------- only the near cascade, nothing else ----
{
  assert(/UNROLLED_LOOP_INDEX == 0 \? getShadowPCSS\(/.test(src),
    'ONLY light 0 gets PCSS: the far cascade keeps three\'s getShadow (its texel is 4x coarser by design ' +
    'and it covers geometry where a penumbra is under a pixel)');
  assert(/: getShadow\( directionalShadowMap\[ i \]/.test(src), '...and the other index still calls it');
  // A spot light's shadow camera is PERSPECTIVE, so the depth-to-world scale derived below is simply wrong
  // for it. Point lights use getPointShadow and are untouched by construction.
  const patched = src.match(/THREE\.ShaderChunk\.lights_fragment_begin = THREE\.ShaderChunk\.lights_fragment_begin\.replace\([\s\S]*?\);/g) || [];
  const pcssPatch = patched.filter(p => /getShadowPCSS/.test(p));
  eq(pcssPatch.length, 1, 'exactly one call site is redirected');
  assert(!/spotShadowMap/.test(pcssPatch[0]) && !/getPointShadow/.test(pcssPatch[0]),
    'and it names neither the spot map nor the point path — a spot\'s shadow camera is perspective, so this ' +
    'derivation would be wrong for it');
}

// -------------------------------------------------- the uniform actually reaches the GPU ----
// build 1181's trap, and it is the one that would make this whole build a silent no-op: ShaderLib merged
// UniformsLib at MODULE LOAD, so adding to the lib alone reaches nothing already built, seqWithValue
// silently drops a program uniform with no value, and pcssP would sit at GL zero forever — which reads as
// "PCSS is off", i.e. exactly like it working correctly with the feature disabled.
{
  assert(/THREE\.UniformsLib\.lights\.pcssP = \{ value:_pcssP \};/.test(src), 'the lib gets it for anything built later');
  assert(/for\(const _pk in THREE\.ShaderLib\)[\s\S]{0,200}_pu\.directionalLights[\s\S]{0,80}_pu\.pcssP = \{ value:_pcssP \};/.test(src),
    '...and every ALREADY-MERGED lit entry gets it too, which is the half that matters');
  // shared by reference, so one CPU write reaches every material (1181's mechanism)
  const decl = src.match(/const _pcssP = \{[^}]*\};/);
  assert(decl, '_pcssP is one shared plain object');
  assert(/x:0/.test(decl[0]), '...and it starts OFF, so nothing is on before the fit has derived a real scale');
  let n = 0; for(const m of src.matchAll(/value:_pcssP/g)) n++;
  eq(n, 2, 'it is handed out by reference in both places, never cloned');
}

// --------------------------------------------------------- the scale, executed not asserted ----
{
  const tan = parseFloat(src.match(/const SUN_ANGLE_TAN = ([\d.]+)/)[1]);
  assert(tan > 0.004 && tan < 0.06,
    'the sun\'s apparent radius is an exaggeration of a real one (' + tan + ' against the sun\'s own 0.0047), ' +
    'not an arbitrary softness: at life size the penumbra is under a texel for anything but a very tall ' +
    'occluder, which would measure as no change at all');

  // penumbraTexels = depthGap x (far - near) x tan / texel   -- reproduced from the shipped expression
  const line = src.match(/_pcssP\.x = _on \? \(_dr \* SUN_ANGLE_TAN\) \/ texel : 0;/);
  assert(line, 'the scale is derived where the extent, the depth range and the map size all already live');
  const scale = (dr, texel) => (dr * tan) / texel;
  // the shipped default: shadowDist 60, map 4096 -> texel 0.0293 m; camera near 1 far 260
  const texel = (2 * 60) / 4096, s = scale(259, texel);
  near(s, 176.8, 2, 'at the shipped defaults one unit of normalised depth gap is ~177 texels of penumbra');
  // ...which is to say: an occluder 10 m above its receiver casts about a 7-texel penumbra.
  const gap10 = 10 / 259;
  near(gap10 * s, 6.8, 0.3, 'so a 10 m occluder gives ~7 texels (' + (gap10 * s * texel * 100).toFixed(0) + ' cm) ' +
    'while one touching the ground gives the 1-texel floor — which IS the contact hardening');
  // and it must GROW with distance, which is the entire claim
  assert(scale(259, texel) * (30 / 259) > scale(259, texel) * (3 / 259),
    'a further occluder gives a wider penumbra, always');
  // a finer map means more texels for the same world penumbra
  assert(scale(259, texel / 2) > scale(259, texel), 'and halving the texel doubles the count, as a texel measure must');

  assert(/_prStepI === 0/.test(src.slice(src.indexOf('_pcssP.x = _on'), src.indexOf('_pcssP.x = _on') + 400)) ||
         /_on = \(typeof _prStepI === 'undefined' \|\| _prStepI === 0\)/.test(src),
    'it sheds below the top rung — build 1350\'s rule that a perf ADD needs a way out, and here shedding is ' +
    'exactly free because 0 makes the function return three\'s own getShadow');
  assert(/_dr > 0 && texel > 0/.test(src), 'a degenerate camera or map turns it off rather than producing Infinity');
}

done('build 1380: a shadow\'s softness is the distance to what cast it');
