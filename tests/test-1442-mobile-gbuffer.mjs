// build 1442 — the G-buffer prepass takes a device-class decision, like everything else expensive here.
//
// `_AO_GEO_MAXSTEP` was a plain 2, so the half-res G-buffer prepass — an extra SCENE RENDER, plus build
// 1140's viewmodel pass into the same buffer — survived the top three quality rungs on every device. And
// `_prStepI` starts at 0 everywhere, so a phone opens at the most expensive configuration the engine has.
//
// Measured on the stock level with the ladder pinned (renderScene runs _adaptResTick, and under SwiftShader
// every frame is a slow frame, so an unpinned rung walks out from under the measurement):
//
//   rung 0   prepass on 185 calls   off 126   extra 59
//   rung 1              on 129      off  71   extra 58     <- it nearly DOUBLES the frame's draw calls
//   rung 2              on 129      off  71   extra 58
//   rung 3              shed already
//
// Every other expensive thing already asks what device it is on: point shadows 0 on a coarse pointer
// (1414), the sun's shadow map 1024 against 4096 (1346), the environment probe sky-only (1186), and the
// resolution ladder carries two EXTRA rungs there. This one never did.
import { gameSource, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ---- the constant is now a question, not a number ------------------------------------------------ */
const raw = extractConst('_AO_GEO_MAXSTEP', src);
assert(/IS_COARSE/.test(raw), 'the budget asks what device it is on — ' + raw);
const MAX_FINE = Function('const IS_COARSE=false; return ' + raw + ';')();
const MAX_COARSE = Function('const IS_COARSE=true; return ' + raw + ';')();
eq(MAX_FINE, 2, 'a fine pointer keeps build 1218/1364 exactly — nothing on desktop moves by a byte');
eq(MAX_COARSE, 0, 'a coarse pointer runs the prepass at rung 0 only');

/* ---- EXECUTED: the gate, per rung, per device ---------------------------------------------------- */
// _geoWant is the one expression that decides whether the extra scene render happens; _aoWant and the soft
// particle/shoreline flag are both derived from it, so proving the gate proves all three.
const gateSrc = src.match(/const _geoWant = [^;]+;/)[0];
const aoSrc = src.match(/const _aoWant = [^;]+;/)[0];
const wants = (rung, max, ssao = 0.9, ssr = 0.35) => Function(
  `const _ssaoAmt=${ssao}, _postSSR=${ssr}, _prStepI=${rung}, _AO_GEO_MAXSTEP=${max};
   const _aoGeoRT={}, cam={ isPerspectiveCamera:true };
   ${gateSrc} ${aoSrc}
   return { geo:_geoWant, ao:_aoWant };`)();

{
  const fine = [0, 1, 2, 3].map(r => wants(r, MAX_FINE).geo);
  eq(JSON.stringify(fine), JSON.stringify([true, true, true, false]),
    'desktop: the prepass survives the top three rungs, exactly as build 1218 shipped it');
  const coarse = [0, 1, 2, 3, 4].map(r => wants(r, MAX_COARSE).geo);
  eq(JSON.stringify(coarse), JSON.stringify([true, false, false, false, false]),
    'a phone: the very first downshift hands back the extra scene render — 58 draw calls');
}
{
  // and the AO sample follows its own buffer, which is build 1364's rule and must not have been broken
  eq(wants(0, MAX_COARSE).ao, true, 'a phone at full quality still gets the grounding cue');
  eq(wants(1, MAX_COARSE).ao, false, '...and loses it with the buffer it reads, not separately');
  eq(wants(1, MAX_FINE).ao, true, 'while the desktop median rung keeps it — 1364 intact where it argued');
}
{
  // the _ssaoAmt term is what stops an SSR-only level switching the AO sample on (build 1364)
  const ssrOnly = wants(0, MAX_FINE, 0, 0.35);
  eq(ssrOnly.geo, true, 'SSR alone still raises the prepass, since SSR marches this buffer');
  eq(ssrOnly.ao, false, '...without paying for the AO kernel');
  eq(wants(0, MAX_FINE, 0, 0).geo, false, 'and a level that authors neither pays nothing at all');
}

/* ---- what must NOT have changed -------------------------------------------------------------------- */
// The rungs a phone gets are untouched. Starting it below full resolution was considered and declined:
// _PR_STEPS already gives a coarse device two EXTRA rungs, and the ladder exists precisely to tell a
// capable phone from an incapable one — opening every phone at reduced resolution penalises the first to
// help the second, on evidence nobody has measured yet.
const steps = extractConst('_PR_STEPS', src);
assert(/IS_COARSE \? \[1, 0\.85, 0\.72, 0\.6, 0\.5\]/.test(steps),
  'the coarse resolution ladder still carries its two extra rungs');
assert(/let _prStepI = 0;/.test(src),
  'and every device still OPENS at full quality — the ladder decides, not the device class');

// the other rung-0-only gates are deliberately not touched: SSR and the velocity pass each keep their own
assert(/_ssrWant/.test(src), 'SSR keeps its own gate');
assert(/_AO_GEO_MAXSTEP/.test(src.match(/const _geoWant = [^;]+;/)[0]),
  'and the prepass is still decided in exactly one expression');
eq((src.match(/_AO_GEO_MAXSTEP/g) || []).length, 2,
  'which is read in one place — the declaration and the gate, nowhere else');

done('build 1442: the biggest single item in the post chain — an extra scene render worth 58 of a frame’s ' +
     '71 draw calls — is the FIRST thing a phone hands back rather than something it carries through three ' +
     'of its five rungs, while a desktop keeps builds 1218 and 1364 byte for byte');
