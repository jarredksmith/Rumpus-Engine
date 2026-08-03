import { gameSource, html, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1334 — the last entry in the platform audit's accessibility census ("colour-blind modes 0"), and
// the completion of 1333. CORRECTION (daltonization), not simulation: a simulation shows a colour-blind
// player what they already see.
//
// Measured on REAL COMPOSITED PIXELS (tools/probe/colorblind.mjs — screenshot, then decoded through an
// offscreen canvas, because a filter is applied by the compositor and nothing inside the page can read it):
//
//              filter              red             green         grey            teal
//   off        (none)              [255,0,0]       [0,192,0]     [128,128,128]   [56,245,181]
//   protan     url("#cbFilter")    [255,130,157]   [0,94,0]      [128,128,128]   [56,149,64]
//   deutan     url("#cbFilter")    [255,52,132]    [0,153,0]     [128,128,128]   [56,207,83]
//   tritan     url("#cbFilter")    [255,0,255]     [0,219,0]     [128,128,128]   [56,255,0]
//   protan@50% url("#cbFilter")    [255,65,79]     [0,143,0]     [128,128,128]   [56,197,123]
//   off        (none)              [255,0,0]       ...           byte-identical to the first row
//
// TWO things in that table are the verification, not decoration:
//  * GREY DID NOT MOVE — 0,0,0 delta under every correction and at half strength. A dichromat sees a
//    neutral grey as a neutral grey, so the error term is zero there and every row of the matrix must sum
//    to exactly 1. That is asserted below by recomputing, not by restating.
//  * The red row lands EXACTLY where the sRGB-space arithmetic says it should: protan's matrix gives
//    G = 0.5089 -> 129.8 -> measured 130, B = 0.6173 -> 157.4 -> measured 157. That is what proves
//    `color-interpolation-filters="sRGB"` took: an SVG filter defaults to linearRGB, and in linearRGB
//    those two numbers are different. The grey invariant alone could NOT have caught that — grey is
//    invariant in either space — which is why the coloured swatches are in the control set.

// ---------------------------------------------------------------- the filter element and its colour space
{
  assert(/<filter id="cbFilter" color-interpolation-filters="sRGB">/.test(html),
    'the filter declares sRGB — the SVG default is linearRGB and the matrices are display-space');
  assert(/an SVG filter defaults to linearRGB/.test(html), 'with the trap recorded beside it');
  assert(/<feColorMatrix id="cbMat" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"\/>/.test(html),
    'and starts as identity, so a failure to write it is a no-op rather than a colour cast');
}

// ---------------------------------------------------------------- recompute all three from the constants
{
  const R2L = extractConst('CB_R2L'), L2R = extractConst('CB_L2R');
  const SIM = extractConst('CB_SIM'), SHIFT = extractConst('CB_SHIFT');
  const cbMul = extractFunction('_cbMul'), cbMatrix = extractFunction('cbMatrix');
  const run = new Function(`
    const CB_R2L = ${R2L}, CB_L2R = ${L2R}, CB_SIM = ${SIM}, CB_SHIFT = ${SHIFT};
    ${cbMul}
    ${cbMatrix}
    return { cbMatrix, _cbMul, CB_R2L, CB_L2R };`)();

  // the LMS pair must actually be inverses, or every matrix derived from them is quietly wrong
  const I = run._cbMul(run.CB_L2R, run.CB_R2L);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    near(I[i][j], i === j ? 1 : 0, 1e-3, 'CB_L2R is the inverse of CB_R2L at [' + i + '][' + j + ']');

  for (const mode of ['protan', 'deutan', 'tritan']) {
    const m = run.cbMatrix(mode, 1);
    for (let i = 0; i < 3; i++)
      // 1e-4, not 0: CB_L2R is the STANDARD PUBLISHED inverse of CB_R2L, rounded to nine digits, so the
      // round trip is exact only to ~5e-5. That is 0.013 of one 8-bit code value — which is why the probe
      // measured the grey swatch moving by exactly 0,0,0 rather than by a rounding wobble.
      near(m[i][0] + m[i][1] + m[i][2], 1, 1e-4,
        mode + ': row ' + i + ' sums to 1 — a neutral grey is invariant, which the probe measured as a 0,0,0 delta');
  }

  // the exact numbers the composited red pixel landed on, re-derived rather than copied
  const p = run.cbMatrix('protan', 1);
  near(p[1][0], 0.5089, 1e-3, 'protan G-from-R = 0.5089 -> 130/255, which is what the screenshot read');
  near(p[2][0], 0.6173, 1e-3, 'protan B-from-R = 0.6173 -> 157/255, likewise');

  // strength is a real dial and 0 is exactly identity
  for (const mode of ['protan', 'deutan', 'tritan']) {
    const off = run.cbMatrix(mode, 0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      eq(off[i][j], i === j ? 1 : 0, mode + ' at strength 0 is exactly the identity');
    const half = run.cbMatrix(mode, 0.5), full = run.cbMatrix(mode, 1);
    near(half[1][0], full[1][0] * 0.5, 1e-9, mode + ': half strength is exactly half the correction');
  }
  // an unknown mode (a corrupt localStorage value) is identity, never a throw mid-frame
  const bad = run.cbMatrix('nonsense', 1);
  eq(bad[0][0], 1, 'an unknown mode falls back to identity');
  eq(bad[1][0], 0, '…with no correction at all');
  // and out-of-range strength clamps rather than exploding the matrix
  eq(run.cbMatrix('protan', 99)[1][0].toFixed(4), run.cbMatrix('protan', 1)[1][0].toFixed(4), 'strength clamps at 1');
  eq(run.cbMatrix('protan', -5)[1][0], 0, 'and at 0');
}

// ---------------------------------------------------------------- one filter, not three shaders
{
  const f = extractFunction('applyColorBlind');
  assert(/body\.style\.filter = on \? 'url\(#cbFilter\)' : '';/.test(f),
    'off REMOVES the filter rather than leaving an identity matrix in place');
  assert(/nobody should pay for a correction they are not using/.test(src), 'with the reason: it is a full-screen composite');
  assert(/0,0,0,1,0/.test(f), 'alpha is passed through untouched');
  // the decision that makes this one implementation instead of three
  assert(/absent ENTIRELY when post-processing is off/.test(src),
    'and the reason it is not a term in the composite shader is recorded — that pass does not always run');
  // it must not have been bolted into the composite as well; two implementations is the recurring defect
  assert(!/uColorBlind|uCbMat/.test(src), 'there is no second copy in the post chain');
}

// ---------------------------------------------------------------- persisted, validated, wired
{
  assert(/CB_MODES\.indexOf\(_m\) > 0\) cbMode = _m;/.test(src),
    'a stored mode is validated against the list — index > 0 also rejects "off" as a no-op write');
  assert(/Math\.max\(0, Math\.min\(1, _k\)\)/.test(src), 'and the stored strength is clamped on the way in');
  assert(/cbMode = CB_MODES\.indexOf\(cm\.value\)>=0 \? cm\.value : 'off';/.test(src), 'the select is validated too');
  assert(/id="a11yCbMode"/.test(html) && /id="a11yCbStr"/.test(html), 'both rows exist in the comfort fold');
  assert(/cs\.disabled=\(cbMode==='off'\)/.test(src), 'the strength slider is dead while the mode is off');
  assert(/cbMode = 'off'; cbStrength = 1; applyColorBlind\(\); saveColorBlind\(\);/.test(extractFunction('a11yRestoreAll')),
    'and the fold’s Restore defaults covers it');
}

// ---------------------------------------------------------------- called where it cannot TDZ
{
  const call = src.indexOf('\napplyColorBlind();');
  const k = src.indexOf("const CB_MODE_KEY = 'breach_cbmode'");
  assert(k > 0 && call > k, 'the boot call is after the consts it reads (1127/1331/1333)');
}

done('build 1334 (platform audit 9, the last census entry): colour-vision CORRECTION — daltonization, not simulation, because a simulation shows a colour-blind player what they already see. Every step of the pipeline (RGB->LMS, drop the missing cone, back to RGB, redistribute the error the eye cannot carry) is linear, so the whole thing collapses to ONE 3x3 — which is why this is an feColorMatrix and not a shader chain. It is a CSS/SVG filter on <body> rather than a term in the composite, because the composite is only one of three passes that can present a frame and is absent entirely when post-processing is off — the low-end device most likely to need this — so one filter covers the 3D frame, the HUD, the menus and every render path present or future. Verified on real composited pixels by screenshot: grey moved by 0,0,0 under all three corrections and at half strength (a dichromat sees a neutral grey as neutral, so every row of the matrix sums to exactly 1 — recomputed here from the constants rather than restated), and red landed on exactly the sRGB-space prediction, 130 and 157, which is what proves color-interpolation-filters="sRGB" took: an SVG filter defaults to linearRGB and the grey invariant could not have caught that, because grey is invariant in either space');
