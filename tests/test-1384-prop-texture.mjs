// build 1384: a primitive gets real material STRUCTURE.
//
// A cold critic put the stock level at 3/10 and a GENERATED arena at 6/10 off the same renderer, and named
// the difference exactly: the generator gives every piece it builds a real per-material albedo, while the
// hand-built level's crates, ramps and pillars are untextured primitives. 1379's noise gave them variation;
// it cannot give them STRUCTURE — panel lines, brushed grain, wear — which is what reads as a material.
//
// A plain `map` cannot be the answer, and that is the whole design problem. Build 1378 could compensate
// `floorMat`'s base colour because the ENGINE owns it; a primitive's colour is the CREATOR'S, chosen in a
// picker, and a map multiplies it — every prop in every level ever saved would have gone ~60% darker.
//
// So the texture is a MEAN-1.0 MODULATION, not an albedo: its LUMINANCE over that luminance's own mean.
//   * the mean albedo does not move, so nothing re-exposes and no authored colour changes;
//   * the texture's colour cast divides out, so the CREATOR's colour still decides the hue;
//   * what survives is the structure, which is the thing that was missing.
import { gameSource, assert, near, eq, done } from './harness.mjs';
import { pngDecode } from './albedo.mjs';
import { readFileSync, statSync } from 'node:fs';

const src = gameSource();
const num = (n) => { const m = src.match(new RegExp('const ' + n + ' = ([\\d.]+)')); assert(m, n + ' is declared'); return parseFloat(m[1]); };

// ------------------------------------- the constant IS the mean of what the shader computes ----
// Neutrality is true by CONSTRUCTION rather than by tuning, and only if this number is the mean of the
// exact quantity the GLSL evaluates: sRGB-space luminance, THEN decoded. Re-derived here from the PNG that
// ships, so regenerating the texture without re-deriving the constant fails here instead of silently
// re-exposing every prop in the game.
{
  const url = src.match(/const PROP_TEX_URL = '([^']+)';/);
  assert(url, 'the texture is named once');
  const path = new URL('../' + url[1], import.meta.url).pathname;
  assert(statSync(path).size > 0, 'and it ships in the repo: ' + url[1]);
  assert(statSync(path).size < 220 * 1024, '...at a size the first-load path can carry');
  assert(!/^[a-z]+:/i.test(url[1]) && !url[1].startsWith('/'),
    'as a relative same-origin path — build 1332\'s CSP is img-src \'self\' and 1335 reports third-party hosts');

  const { w, h, ch, data } = pngDecode(readFileSync(path));
  const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  let sum = 0, lo = 9, hi = -9; const n = w * h;
  for(let i = 0; i < n; i++){
    const o = i * ch;
    const y = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;   // sRGB-space luma
    const v = s2l(y);                                                                    // then decoded
    sum += v; if(v < lo) lo = v; if(v > hi) hi = v;
  }
  const mean = sum / n;
  near(num('PROP_TEX_LUM'), mean, 1e-4,
    'PROP_TEX_LUM is the mean of srgb2lin(luma(texel)) over the shipped PNG (' + mean.toFixed(6) + ')');
  assert(hi / mean > 1.5, 'and the texture has real contrast to give (peak is ' + (hi / mean).toFixed(2) + 'x the mean)');
  assert(w === h && w >= 128, 'square and at least 128px (' + w + 'x' + h + ')');

  // ...therefore the modulation's mean is exactly 1.0, which is the claim the whole design rests on.
  const amt = num('PROP_TEX_AMT');
  const modMean = (1 - amt) + amt * (mean / num('PROP_TEX_LUM'));
  near(modMean, 1.0, 1e-3, 'so mix(1.0, lum/mean, amt) integrates to 1.0 at any amplitude — no authored ' +
    'colour changes and nothing re-exposes');
  // the swing at the shipped amplitude, stated rather than left to be discovered
  const loMul = 1 + amt * (lo / mean - 1), hiMul = 1 + amt * (hi / mean - 1);
  assert(loMul > 0.3, 'the darkest multiplier stays well off zero (' + loMul.toFixed(2) + 'x) — below that it ' +
    'stops being a modulation and starts crushing the creator\'s colour to black');
  assert(hiMul < 2.0, '...and the brightest stays under 2x (' + hiMul.toFixed(2) + 'x)');
}

// --------------------------------------------- projection: triplanar, object space, never UV ----
{
  const _s0 = src.indexOf('// build 1384: TRIPLANAR');
  assert(_s0 > 0, 'the triplanar block is present');
  const _s1 = src.indexOf('uOdTexM, uOdTexA);', _s0);
  assert(_s1 > _s0, '...and ends at the modulation it applies');
  const s = src.slice(_s0, _s1 + 30);
  assert(/vOdPos\.zy\*_tf/.test(s) && /vOdPos\.xz\*_tf/.test(s) && /vOdPos\.xy\*_tf/.test(s),
    'three projections off the OBJECT-SPACE position: a primitive\'s UVs run 0..1 per FACE whatever that ' +
    'face\'s real size is, so a stretched box would stretch the texture — build 1378\'s 17:1 boundary wall, ' +
    'one layer down. vOdPos cannot stretch and needs no UVs at all');
  assert(/abs\(normalize\(vOdNrm\)\)/.test(s), 'blended by the object-space normal');
  assert(/max\(1e-4, _tb\.x\+_tb\.y\+_tb\.z\)/.test(s), '...with a guarded normalise, so a degenerate normal cannot make it NaN');
  assert(/dot\(_ts, vec3\(0\.2126, 0\.7152, 0\.0722\)\)/.test(s),
    'LUMINANCE only — the texture\'s own cast must never override the colour the creator picked');
  assert(/pow\(\(_ty\+0\.055\)\/1\.055, 2\.4\)/.test(s) && /_ty\/12\.92/.test(s),
    'decoded with the exact sRGB EOTF, because the constant is the mean of that same quantity');
  assert(/varying vec3 vOdNrm;/.test(src), 'the object-space normal is carried as a varying');
  assert(/vOdNrm = normal;/.test(src), '...written from the vertex attribute');
}

// ------------------------------------------------------- who pays for it, and who does not ----
{
  assert(/const texOn = !!\(albOnly && mat\.userData\._odTex\);/.test(src), 'the modulation is opt-in per material');
  assert(/\(texOn \? 'T' : ''\)/.test(src),
    'and it is its OWN program variant — three extra texture fetches are not free, so a material that does ' +
    'not want them must not compile them in');
  assert(/mat\.userData\._odTex = true; mat\.userData\._odTexF = _propTexFreq\(span\);/.test(src),
    'primitives opt in, marked BEFORE the patch reads the flag');
  // floorMat/wallMat take the MACRO mode (build 1382) and carry a real authored map — they must not pay.
  assert(!/applyMacroDetail\([^)]*\)[\s;]*[\s\S]{0,80}_odTex = true/.test(src),
    'the two engine surfaces never opt in — they have a real albedo and take the macro layer instead');
  // probed live: 52 of 57 prop materials carried the uniforms, floorMat carried none.
}

// -------------------------------------------------- a sampler is never null at program build ----
// The PNG loads asynchronously, so at the moment the first material compiles the uniform's value would be
// null — and a null sampler is not one that arrives later. White is also exactly neutral here, because the
// modulation is a RATIO: a constant texel gives a constant multiplier.
{
  assert(/const _propTexWhite = \(function\(\)\{/.test(src), 'a 1x1 neutral texel exists...');
  assert(/const _propTexU = \{ value: _propTexWhite \};/.test(src), '...and seeds the uniform');
  assert(/_propTex = null; _propTexU\.value = _propTexWhite;/.test(src), 'and a failed load falls back to it rather than to null');
  assert(/if\('colorSpace' in t\) t\.colorSpace = THREE\.NoColorSpace/.test(src),
    'the texture is deliberately NOT sRGB-tagged: it is sampled by a hand-written patch, never by three\'s ' +
    'map path, and the decode happens in the shader so it matches the constant exactly');
}

// ---------------------------------------------------------- density, executed ----
{
  const perM = num('PROP_TEX_PER_M'), minC = num('PROP_TEX_MIN_CYC');
  const f = new Function('PROP_TEX_MIN_CYC', 'PROP_TEX_PER_M',
    src.match(/function _propTexFreq\(span\)\{[\s\S]*?\n\}/)[0] + '\nreturn _propTexFreq;')(minC, perM);
  eq(f(8), Math.max(minC, perM * 8), 'an 8 m prop gets ~2 tiles — the density the sweep chose');
  assert(f(1) === minC, 'and a 1 m crate gets the floor rather than a quarter of one tile');
  assert(f(40) > f(8), 'a bigger prop gets proportionally more, so the physical scale holds (build 1139)');
  assert(f(0) >= minC && isFinite(f(1e9)), 'a degenerate or absurd span is clamped, never 0 or infinite');
  // the sweep: density 2 beat density 5 at BOTH amplitudes, because 5.6 tiles is sub-pixel at range
  assert(perM < 0.5, 'the density is coarse (' + perM + '/m) — the first guess was 0.7/m and measured WORSE');
  assert(/if\(u && u\.uOdTexF\) u\.uOdTexF\.value = _tf;/.test(src),
    'and it follows a resize through the hook that already owns the world span');
}

done('build 1384: primitives carry material structure, as a mean-1.0 modulation that cannot move an authored colour');
