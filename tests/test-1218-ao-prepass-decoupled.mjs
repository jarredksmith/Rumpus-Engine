// build 1218: the G-buffer prepass and the AO sample no longer live or die together.
//
// The rendering critic's HIGH: `_aoWant = _ssaoAmt>0.001 && _prStepI===0 && ...` gated BOTH the half-res
// G-buffer prepass and the expensive AO kernel+blur, and the soft-particle / soft-shoreline fade read the
// same flag — so the FIRST adaptive downshift (85% res, a common mid-range steady state) shed SSAO, soft
// particles AND soft shorelines at once, and the image most players actually see lost its grounding while
// still paying for bloom, fog and the grade. Now `_geoWant` runs the prepass across the top three rungs
// (soft particles ride it); `_aoWant` keeps the AO SAMPLE on rung 0 only.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the two gates, evaluated
{
  const MAX = +src.match(/const _AO_GEO_MAXSTEP = (\d+);/)[1];
  eq(MAX, 2, 'the prepass survives the top 3 rungs (0/1/2 = 100/85/72% resolution)');
  const geo = (ssao, step) => ssao > 0.001 && step <= MAX && true /* rt + perspective */;
  const ao = (ssao, step) => geo(ssao, step) && step === 0;

  // rung 0: both on (unchanged from before)
  assert(geo(0.9, 0) && ao(0.9, 0), 'rung 0: prepass AND AO sample both run — the full-quality frame is unchanged');
  // rung 1 (the common downshift): prepass stays, AO sample sheds
  assert(geo(0.9, 1) && !ao(0.9, 1), 'rung 1 (85%): the prepass runs so SOFT PARTICLES survive, but the AO kernel is shed');
  assert(geo(0.9, 2) && !ao(0.9, 2), 'rung 2 (72%): still keeps soft particles');
  // deepest rung: everything sheds (soft anyway)
  assert(!geo(0.9, 3) && !ao(0.9, 3), 'rung 3 (66%): even the prepass goes — the whole frame is soft there');
  // AO off entirely: neither runs (a creator who disabled AO gets no depth effects, as before)
  assert(!geo(0, 0) && !ao(0, 0), 'AO turned off: no prepass, no sample — the depth effects are opt-out');
}

// ---------------------------------------------------------------- the wiring: prepass vs sample split
{
  const fn = extractFunction('_renderPostFX');
  assert(/const _geoWant = _ssaoAmt > 0\.001 && _prStepI <= _AO_GEO_MAXSTEP && _aoGeoRT && cam && cam\.isPerspectiveCamera;/.test(fn),
    'the G-buffer prepass gate spans the top rungs');
  assert(/const _aoWant = _geoWant && _prStepI === 0;/.test(fn),
    'the AO sample gate is a STRICT subset — rung 0 only');
  assert(/_SOFT_P\.value\.x = _geoWant \? 1 : 0;/.test(fn),
    'soft particles ride the prepass gate (the buffer they read), not the AO sample');

  // structurally: the prepass render is inside `if(_geoWant){`, the AO kernel inside a LATER `if(_aoWant){`
  const geoBlock = fn.indexOf('if(_geoWant){');
  const prepassRender = fn.indexOf('renderer.setRenderTarget(_aoGeoRT); renderer.render(scn, cam);');
  const aoBlock = fn.indexOf('if(_aoWant){   /* build 1218');
  const aoKernel = fn.indexOf('_postQuad.material=_matAO;');
  assert(geoBlock >= 0 && prepassRender > geoBlock, 'the G-buffer render is inside the _geoWant block');
  assert(aoBlock > prepassRender, 'the AO sample block opens AFTER the prepass finished');
  assert(aoKernel > aoBlock, 'the AO kernel pass is inside the _aoWant block');
  // the composite still only reads the AO texture when the sample actually ran
  assert(/cu\.tAO\.value = _aoWant \? _aoRT\.texture : null;/.test(fn),
    'the composite pulls the AO term only when the sample ran — a downshift composites without it, soft particles intact');
}

// ---------------------------------------------------------------- build 1135's intent survives
{
  const fn = extractFunction('_renderPostFX');
  assert(!/_ssaoAmt > 0\.001 && _hiFxOn/.test(fn),
    'the AO sample still does NOT die with MSAA (build 1135) — it rides the resolution step, not the FX rung');
}

done('build 1218: the AO prepass and sample are decoupled — evaluated across the rungs proving the prepass (and with it soft particles/shorelines) survives the common first downshift while only the AO kernel sheds, the deepest rung drops both, AO-off opts out of everything, and the split is structural (prepass render in _geoWant, kernel in a later _aoWant, composite reads AO only when sampled); build 1135\'s below-MSAA intent is preserved');
