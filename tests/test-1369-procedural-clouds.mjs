// build 1369: procedural clouds — the sky was a three-band gradient with a sun disc, never a cloud,
// in any level, ever (measured: an open-sky patch varied by the film GRAIN over a 32/19/9
// top-to-bottom gradient; grep cloud|cirrus|cumulus hit zero in the sky path). A 2-octave value-noise
// FBM now composites over the gradient in the DOME shader: coverage worldCfg.skyCloud (0..1, default
// 0.35), formation size worldCfg.skyCloudScale (0.25..4), edge softness derived from the existing
// Haze, lit warm on the sun side, drifting on a bounded clock.
//
// One rule decides every wiring question: CLOUDS ARE IN THE PICTURE, NOT IN THE LIGHT. The dome
// composites them before its shared tone-map/encode; the hemisphere fill, the fog ring and the
// environment probe all stay cloudless — they recompute on the day-cycle cadence (or a rate-limited
// probe key) while the layer drifts per frame, and lighting that breathes out of step with the
// visible sky would be a worse artifact than the omission. The probe therefore keeps build 1136's
// RAW RADIANCE line byte-identical.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the GLSL layer, pinned
assert(src.includes("'uniform float uCloud; uniform float uCloudScale; uniform float uCloudSharp; uniform float uCloudTime;'"),
  'the four cloud uniforms are declared in SKY_GLSL');
assert(src.includes("'vec3 applyClouds(vec3 c, vec3 d){',\n  '  if(uCloud <= 0.0005) return c;',"),
  'coverage 0 is an explicit FIRST-LINE early return — byte-identical to the pre-cloud sky by construction');
assert(src.includes("'float _cfbm(vec2 p){ return _cnoise(p)*0.65 + _cnoise(p*2.17 + vec2(19.7, 7.3))*0.35; }'"),
  'the FBM is exactly two octaves');
assert(src.includes("'  float m = smoothstep(1.0 - uCloud, 1.0 - uCloud + uCloudSharp, n) * hf;'"),
  'coverage moves the threshold; sharpness is the smoothstep width');
assert(src.includes("'  vec2 uv = d.xz / (d.y + 0.14) * (1.35 * uCloudScale) + uCloudTime * 0.004 * vec2(1.0, 0.36);'"),
  'the drift rides a time uniform; scale zooms the formation');
assert(src.includes("'  vec3 cl = (uHor * 1.12 + uZen * 0.30) * (vec3(0.60) + vec3(0.85, 0.74, 0.60) * (sunT * sunT)) * uExp;'"),
  'the cloud colour is built from the SKY COLOURS with a warm sun-side gain — no additive constant to glow at night');
{
  // the hash must be sin-free: fract-sin degrades as the drift offset grows, which is the whole
  // reason the classic hash needs an unbounded-domain caveat. Slice the three noise functions.
  const i0 = src.indexOf("'float _chash(vec2 p){"), i1 = src.indexOf("'vec3 applyClouds(vec3 c, vec3 d){");
  assert(i0 > 0 && i1 > i0, 'the noise functions sit above applyClouds');
  assert(!src.slice(i0, i1).includes('sin('), 'the hash is SIN-FREE (fract chains) — precision does not decay with the drift offset');
}
{ // the clock is bounded — a fract-style hash domain must not grow without limit
  const es = extractFunction('_ensureSky');
  assert(/u\.uCloudTime\.value = \(\(typeof performance!=='undefined' \? performance\.now\(\) : 0\) \* 0\.001\) % 2048;/.test(es),
    'the drift clock is written per frame and WRAPPED at 2048 s (a bounded noise domain)');
  // the dome composites clouds INSIDE its own tone-map/encode — same response curve as the sky behind them
  assert(/gl_FragColor = vec4\(_out\(_aces\(applyClouds\(skyRadiance\(nd\), nd\)\)\), 1\.0\);/.test(es),
    'the dome composites the layer, then tone-maps, then encodes — clouds ride the shared curve');
}

// ---------------------------------------------------------------- the light stays cloudless
{
  const env = extractFunction('_skyEnv');
  assert(/'void main\(\)\{ gl_FragColor=vec4\(skyRadiance\(normalize\(vDir\)\),1\.0\); \}'/.test(env),
    'the probe keeps build 1136’s RAW RADIANCE line BYTE-IDENTICAL');
  assert(!/applyClouds/.test(env), '...and never calls the cloud layer');
  assert(!/_aces\(/.test(env) && !/_out\(/.test(env), '...nor any tone map or encode (the 1136 invariant)');
}
{
  const as = extractFunction('applySky');
  assert(!/applyClouds/.test(as), 'the hemisphere fill and the fog ring sample skyRadiance, never the cloud layer');
  assert(/skyRadiance\(Math\.cos\(th\)\*r, y, Math\.sin\(th\)\*r, P, S\)/.test(as), '...the hemisphere average is unchanged');
  assert(/skyRadiance\(Math\.cos\(th\), 0\.04, Math\.sin\(th\), P, S\)/.test(as), '...and so is the horizon fog ring');
  assert(/clouds are in the PICTURE, not in the light/.test(as), 'and the decision is documented AT THE SITE');
}

// ---------------------------------------------------------------- uniforms from the one param source
{
  const uni = extractFunction('_skyUniforms');
  assert(/uCloud:\{value:P\.cloud\}, uCloudScale:\{value:P\.cloudScale\},/.test(uni),
    'coverage and scale come from _skyP like every other sky uniform');
  assert(/uCloudSharp:\{value:Math\.max\(0\.06, 0\.10 \+ P\.turb\*0\.30\)\}, uCloudTime:\{value:0\},/.test(uni),
    'sharpness DERIVES from the existing haze (no third knob), floored so smoothstep never sees a zero-width edge');
}

// ---------------------------------------------------------------- the clamps, executed
{
  const rig = (W) => new Function('W',
    "const THREE = { Color: function(h){ this.r=((h>>16)&255)/255; this.g=((h>>8)&255)/255; this.b=(h&255)/255; } };\n" +
    "let _skyDayDim = 1;\n" +
    "const SKY_DEF = { zenith:[0,0,0], horizon:[0,0,0], ground:[0,0,0], turb:0.35, sunSize:1.6, sunGlow:1.0, exp:1.0, cloud:0.35, cloudScale:1 };\n" +
    "let worldCfg = W;\n" +
    extractFunction('_skyClamp') + '\n' + extractFunction('_skyP') + '\n' +
    "return _skyP();")(W);
  eq(rig({}).cloud, 0.35, 'an unset field reads the default coverage');
  eq(rig({}).cloudScale, 1, '...and the default scale');
  eq(rig({ skyCloud: 99 }).cloud, 1, 'a hostile coverage clamps to 1');
  eq(rig({ skyCloud: -5 }).cloud, 0, '...and to 0');
  eq(rig({ skyCloud: 'x' }).cloud, 0.35, 'a NaN coverage falls to the DEFAULT, never into a uniform');
  eq(rig({ skyCloud: 0 }).cloud, 0, 'zero is a real value (a clean gradient) — the != null gate keeps it');
  eq(rig({ skyCloudScale: 0.01 }).cloudScale, 0.25, 'scale clamps at 0.25');
  eq(rig({ skyCloudScale: 99 }).cloudScale, 4, '...and at 4');
}

// ---------------------------------------------------------------- a JS mirror of the GLSL, executed
// The literals above pin the GLSL text; this mirror restates the same arithmetic in JS so the layer's
// PROPERTIES can be executed. If either side changes, one of the two fails.
{
  const fr = (v) => v - Math.floor(v);
  const chash = (px, py) => { let qx = fr(px * 0.1031), qy = fr(py * 0.1031), qz = fr(px * 0.1031);
    const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
    qx += d; qy += d; qz += d; return fr((qx + qy) * qz); };
  const mixv = (a, b, t) => a + (b - a) * t;
  const cnoise = (px, py) => { const ix = Math.floor(px), iy = Math.floor(py);
    let fx = px - ix, fy = py - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return mixv(mixv(chash(ix, iy), chash(ix + 1, iy), fx), mixv(chash(ix, iy + 1), chash(ix + 1, iy + 1), fx), fy); };
  const cfbm = (px, py) => cnoise(px, py) * 0.65 + cnoise(px * 2.17 + 19.7, py * 2.17 + 7.3) * 0.35;
  const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const maskAt = (d, U) => { const hf = sstep(0.02, 0.16, d[1]); if (hf <= 0) return 0;
    const k = 1.35 * U.scale;
    const n = cfbm(d[0] / (d[1] + 0.14) * k + U.time * 0.004 * 1.0, d[2] / (d[1] + 0.14) * k + U.time * 0.004 * 0.36);
    return sstep(1 - U.cloud, 1 - U.cloud + U.sharp, n) * hf; };
  const clAt = (d, U) => { const sunT = Math.max(d[0] * U.sun[0] + d[1] * U.sun[1] + d[2] * U.sun[2], 0), g = sunT * sunT;
    return [(U.hor[0] * 1.12 + U.zen[0] * 0.30) * (0.60 + 0.85 * g) * U.exp,
            (U.hor[1] * 1.12 + U.zen[1] * 0.30) * (0.60 + 0.74 * g) * U.exp,
            (U.hor[2] * 1.12 + U.zen[2] * 0.30) * (0.60 + 0.60 * g) * U.exp]; };
  const applyClouds = (c, d, U) => { if (U.cloud <= 0.0005) return c;
    const hf = sstep(0.02, 0.16, d[1]); if (hf <= 0) return c;
    const m = maskAt(d, U), cl = clAt(d, U);
    return [c[0] + (cl[0] - c[0]) * m * 0.9, c[1] + (cl[1] - c[1]) * m * 0.9, c[2] + (cl[2] - c[2]) * m * 0.9]; };
  const dirs = [];
  for (let iy = 1; iy <= 6; iy++) { const y = iy * 0.15, r = Math.sqrt(1 - y * y);
    for (let it = 0; it < 12; it++) { const th = it / 12 * Math.PI * 2; dirs.push([Math.cos(th) * r, y, Math.sin(th) * r]); } }
  const sl = Math.hypot(0.0, 0.7, 0.714), S = [0, 0.7 / sl, 0.714 / sl];
  const U0 = { cloud: 0.35, scale: 1, sharp: 0.205, time: 0, hor: [0.52, 0.60, 0.70], zen: [0.18, 0.30, 0.54], sun: S, exp: 1 };

  { // coverage 0 is the IDENTITY — executed, not asserted: the mirror returns the very input object
    const off = { ...U0, cloud: 0 };
    let same = true;
    for (const d of dirs) { const c = [0.3, 0.4, 0.5]; if (applyClouds(c, d, off) !== c) same = false; }
    assert(same, 'coverage 0 returns the INPUT radiance itself for every direction — byte-identical to the pre-cloud sky');
    const below = applyClouds([0.3, 0.4, 0.5], [0.995, 0.01, 0.0], U0);
    eq(below[0], 0.3, 'below the horizon fade the layer is also the identity (the ground band is not clouded)');
  }
  { // the noise is bounded and actually varied — the raw material of a cloud field
    let lo = 1, hi = 0, above = 0, n = 0;
    for (let i = 0; i < 500; i++) { const v = cfbm((i * 0.377) % 37 - 18, (i * 0.611) % 41 - 20);
      lo = Math.min(lo, v); hi = Math.max(hi, v); if (v > 0.65) above++; n++; }
    assert(lo >= 0 && hi <= 1, 'the FBM stays in [0,1] (' + lo.toFixed(3) + '..' + hi.toFixed(3) + ')');
    assert(hi - lo > 0.3, '...and is not flat');
    assert(above / n > 0.02 && above / n < 0.6, 'the default coverage threshold (0.65) selects a real minority of the field (' + (100 * above / n).toFixed(1) + '%)');
  }
  { // coverage is monotone: more coverage, more cloud
    const mean = (cov) => dirs.reduce((a, d) => a + maskAt(d, { ...U0, cloud: cov }), 0) / dirs.length;
    const m15 = mean(0.15), m50 = mean(0.5), m92 = mean(0.92);
    assert(m15 < m50 && m50 < m92, 'mean cloud mask rises with coverage (' + m15.toFixed(3) + ' < ' + m50.toFixed(3) + ' < ' + m92.toFixed(3) + ')');
    assert(m50 > 0.02 && m50 < 0.95, 'mid coverage is partial cloud, not a fill');
    assert(m92 > 0.55, 'the Overcast end really covers the sky (' + m92.toFixed(3) + ')');
  }
  { // the drift MOVES the field
    let moved = 0;
    for (const d of dirs) if (Math.abs(maskAt(d, { ...U0, cloud: 0.5 }) - maskAt(d, { ...U0, cloud: 0.5, time: 700 })) > 0.05) moved++;
    assert(moved > 0, 'advancing the clock changes the mask somewhere (' + moved + ' of ' + dirs.length + ' dirs)');
  }
  { // the cloud colour scales with the SKY colours — a dark sky keeps dark clouds (no night glow)
    const d = [0, 0.7, 0.714];
    const bright = clAt(d, U0);
    const dark = clAt(d, { ...U0, hor: U0.hor.map(v => v * 0.1), zen: U0.zen.map(v => v * 0.1) });
    for (let i = 0; i < 3; i++) near(dark[i], bright[i] * 0.1, 1e-12, 'channel ' + i + ' scales LINEARLY with the sky colours — no additive term to glow at night');
    // and the sun side is WARM: the red gain exceeds the blue gain
    const at = clAt(S, U0), away = clAt([-S[0], S[1], -S[2]], U0);
    assert(at[0] / away[0] > at[2] / away[2], 'the sun-side gain is warm (R gain ' + (at[0] / away[0]).toFixed(3) + ' > B gain ' + (at[2] / away[2]).toFixed(3) + ')');
    assert(at[0] > away[0], '...and the sun side is brighter at all');
  }
  { // a full-coverage cloud OCCLUDES the sun disc — driven through the REAL JS skyRadiance twin
    const sky = new Function('Math', extractFunction('skyRadiance') + '; return skyRadiance;')(Math);
    const P = { zenith: U0.zen, horizon: U0.hor, ground: [0.2, 0.19, 0.17], turb: 0.35, sunSize: 1.6, sunGlow: 1.0, exp: 1.0 };
    const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const Uover = { ...U0, cloud: 1, sharp: 0.376 };   // overcast haze softens the edge, as the derivation does
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {           // walk small offsets around the sun until the mask is opaque there
      const d0 = [S[0] + (i % 7) * 0.01, S[1], S[2] + Math.floor(i / 7) * 0.01];
      const l = Math.hypot(...d0), d = d0.map(v => v / l);
      if (maskAt(d, Uover) < 0.99) continue;
      found = true;
      const c = sky(d[0], d[1], d[2], P, S);
      const out = applyClouds(c, d, Uover);
      assert(L(c) > 2, 'the bare sun disc is bright (' + L(c).toFixed(2) + ')');
      assert(L(out) < L(c) * 0.3, 'an opaque cloud DIMS the disc to under 30% (' + L(out).toFixed(2) + ' vs ' + L(c).toFixed(2) + ') — the sun can finally go behind a cloud');
    }
    assert(found, 'full coverage produces an opaque cloud near the sun');
  }
}

// ---------------------------------------------------------------- the wiring
assert(/turb:0\.35, sunSize:1\.6, sunGlow:1\.0, exp:1\.0, cloud:0\.35, cloudScale:1 \};/.test(src),
  'SKY_DEF carries the cloud defaults (the rig above stubs the same values)');
assert(/skySunGlow:1\.0, skyExp:1\.0, skyCloud:0\.35, skyCloudScale:1 \};/.test(src),
  'DEFAULT_WORLD carries skyCloud 0.35 and skyCloudScale 1 — the whole-object world serialization does the rest');
assert(/slider\(b,'Clouds','skyCloud',0,1,0\.05\); slider\(b,'Cloud scale','skyCloudScale',0\.25,4,0\.05\);/.test(src),
  'the two sliders exist with the same ranges the clamp enforces');
assert(src.indexOf("slider(b,'Haze','skyTurb'") < src.indexOf("slider(b,'Clouds','skyCloud'"),
  '...and sit beside Haze in the Sky fold');
{
  const moods = new Function('return ' + src.match(/const SKY_MOODS = \{[\s\S]*?\n\};/)[0].replace('const SKY_MOODS =', '').replace(/;\s*$/, ''))();
  const dw = src.match(/const DEFAULT_WORLD = \{[^\n]*\};/)[0];
  const defCov = +dw.match(/skyCloud:([0-9.]+)/)[1], defScale = +dw.match(/skyCloudScale:([0-9.]+)/)[1];
  for (const k of Object.keys(moods)) {
    assert(isFinite(moods[k].skyCloud) && moods[k].skyCloud >= 0 && moods[k].skyCloud <= 1, 'mood ' + k + ' states a coverage in range');
    assert(isFinite(moods[k].skyCloudScale) && moods[k].skyCloudScale >= 0.25 && moods[k].skyCloudScale <= 4, 'mood ' + k + ' states a scale in range');
  }
  eq(moods.day.skyCloud, defCov, 'Day.skyCloud === DEFAULT_WORLD.skyCloud — Day is still exactly stock (the 1234 rule)');
  eq(moods.day.skyCloudScale, defScale, '...and Day.skyCloudScale too');
  assert(Object.keys(moods).every(k => moods[k].skyCloud <= moods.overcast.skyCloud), 'Overcast carries the heaviest cover');
  assert(moods.overcast.skyCloud >= 0.85, '...and it really is near-full (' + moods.overcast.skyCloud + ')');
  assert(Object.keys(moods).every(k => moods[k].skyCloud >= moods.night.skyCloud), 'Night carries the lightest');
}
{ // legacy content: a pre-sky level keeps the flat background, so the layer cannot reach it at all
  const fn = new Function('DEFAULT_WORLD', extractFunction('_worldFrom') + '; return _worldFrom;')({ colorV: 2, skyMode: 'sky', skyCloud: 0.35 });
  eq(fn({ sun: 1 }).skyMode, 'flat', 'a level authored before the sky existed still renders no dome — and therefore no clouds');
  eq(fn(null).skyCloud, 0.35, 'a fresh level starts at the default coverage');
}

done('build 1369: procedural clouds in the sky dome — a sin-free 2-octave value-noise layer pinned line for line and executed through a JS mirror (coverage 0 returns the input radiance itself, coverage is monotone to overcast, the drift clock is bounded at 2048 s, cloud colour scales linearly with the sky so night stays dark, the warm sun side executes, and an opaque cloud dims the real sun disc through the real skyRadiance twin), composited inside the dome’s own tone-map/encode while the probe keeps the 1136 raw-radiance line byte-identical and the hemisphere fill / fog ring stay cloudless by rule, with the clamps executed against hostile input and the two sliders, DEFAULT_WORLD defaults and per-mood coverage all wired');
