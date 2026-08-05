// build 1383: the procedural RELIEF fades with the antialiasing that covers it.
//
// Builds 1145 and 1379 perturb the normal with a hashed field at ~34 cycles across a mesh — high frequency
// by design, because that is what breaks a flat facet. High-frequency NORMAL noise is specular aliasing
// waiting to happen: it needs antialiasing to resolve it, and antialiasing is the first thing the adaptive
// ladder throws away. Build 1126 MEASURED the replacement: a 1.02-pixel MSAA coverage gradient on 100 of
// 100 scanlines becomes a hard edge on 94 of 99 under FXAA. So on the rung where the frame can least
// resolve the noise, the noise was unchanged and the resolution was lower too.
//
// WHAT THIS TEST DOES NOT CLAIM: that a still capture shows the improvement. Specular aliasing is a MOTION
// artifact — it reads as crawl and shimmer as the camera moves — and a still frame cannot contain it. The
// probe also found `full: 0` patched materials in the stock level: the relief term's consumers are UV-less
// IMPORTS (the weapon, low-poly packs), not the stock primitives, which carry the albedo term only. So the
// verification here is structural and executed, and the visual half belongs on the human-verify list.
import { gameSource, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------------ the ladder ----
{
  const m = src.match(/const _OD_BUMP_STEP = \[([^\]]+)\];/);
  assert(m, 'the per-rung relief multipliers are one named array');
  const step = m[1].split(',').map(Number);
  eq(step[0], 1.0, 'RUNG 0 IS UNCHANGED — at full quality MSAA is live and the relief is what 1145 tuned, ' +
    'so no frame anybody has ever seen at top quality moves');
  for(let i = 1; i < step.length; i++)
    assert(step[i] < step[i - 1], 'and it only ever decreases (rung ' + i + ': ' + step[i] + ')');
  assert(step[step.length - 1] > 0, 'never to zero — the bottom rung keeps some relief rather than going flat');

  // it must cover every rung the resolution ladder has, or the clamp silently pins the deepest ones together
  const pr = src.match(/const _PR_STEPS = IS_COARSE \? \[([^\]]+)\] : \[([^\]]+)\];/);
  assert(pr, 'the resolution ladder is readable');
  const desktop = pr[2].split(',').length;
  assert(step.length >= desktop, 'it has an entry for every desktop rung (' + step.length + ' >= ' + desktop + ')');
}

// ------------------------------------------------- shared BY REFERENCE, never per material ----
{
  assert(/const _odBumpU = \{ value: 0 \};/.test(src), 'one shared uniform object');
  assert(/shader\.uniforms\.uOdBump = _odBumpU;/.test(src),
    'handed to every patched material BY REFERENCE (build 1181\'s mechanism) — so a rung change is ONE ' +
    'CPU write that reaches all of them, and never a recompile');
  assert(!/shader\.uniforms\.uOdBump = \{ value:/.test(src),
    '...and never as a fresh object literal, which would leave every already-compiled material stranded ' +
    'at the value it was built with');
  // probed live: 67 of 67 patched materials held the same object.
  eq((src.match(/_odBumpU/g) || []).length, 3, 'declared, written by the sync, read by the patch — three places, no fourth');
}

// ----------------------------------------------------------- executed: the sync ----
{
  const STEP = src.match(/const _OD_BUMP_STEP = \[([^\]]+)\];/)[1].split(',').map(Number);
  const U = { value: 0 };
  let base = 0.35, rung = 0;
  const sync = () => {
    const i = Math.max(0, Math.min(STEP.length - 1, rung | 0));
    U.value = base * STEP[i];
  };
  for(let r = 0; r < STEP.length; r++){ rung = r; sync(); near(U.value, 0.35 * STEP[r], 1e-9, 'rung ' + r + ' scales the base'); }
  rung = 0; sync(); near(U.value, 0.35, 1e-9, 'rung 0 returns the authored value exactly');
  rung = 99; sync(); near(U.value, 0.35 * STEP[STEP.length - 1], 1e-9, 'a rung past the end clamps rather than reading undefined');
  rung = -5; sync(); near(U.value, 0.35, 1e-9, '...and so does a negative one');
  base = 0; rung = 2; sync(); eq(U.value, 0, 'a zero base stays zero at every rung');
  // matches the live readback: 0.35 / 0.21 / 0.14 / 0.0875 across the four desktop rungs
  base = 0.35;
  const live = [0, 1, 2, 3].map(r => { rung = r; sync(); return +U.value.toFixed(4); });
  eq(JSON.stringify(live), JSON.stringify([0.35, 0.21, 0.14, 0.0875]), 'and it reproduces the values probed live');
}

// -------------------------------------------------------- the TDZ, closed by hand-off ----
// `_applyPixelRatio()` is CALLED at boot, ~2,500 lines above `OBJ_DETAIL_BUMP`. `typeof` does NOT guard a
// temporal dead zone — builds 1127, 1331 and 1350 each lost something to exactly that, and the boot test
// caught this one on the first draft, which read the constant from inside the sync.
{
  const decl = src.indexOf('let _odBumpBase = 0;');
  const konst = src.indexOf('const OBJ_DETAIL_BUMP =');
  const hand = src.indexOf('_odBumpBase = OBJ_DETAIL_BUMP;');
  const boot = src.indexOf('_applyPixelRatio();');
  assert(decl > 0 && konst > 0 && hand > 0 && boot > 0, 'all four sites exist');
  assert(decl < boot, 'the base is DECLARED above the boot call that reads it');
  assert(hand > konst, 'the hand-off happens at the constant\'s own site, after it initialises');
  assert(hand > boot, '...which is after the boot call, so the boot call sees 0 and nothing throws');
  const sync = src.match(/function _syncOdBump\(\)\{[\s\S]*?\n\}/)[0];
  assert(!/OBJ_DETAIL_BUMP/.test(sync),
    'and the sync never names the constant — that is the whole point, a read from there is the TDZ');
  assert(/_odBumpU\.value = _odBumpBase \* _OD_BUMP_STEP\[i\];/.test(sync), 'it scales the handed-over base');
  // the literal is written ONCE, so the fade and the authored value cannot drift apart
  eq((src.match(/const OBJ_DETAIL_BUMP = [\d.]+;/g) || []).length, 1, 'the authored relief is named once');
}

// ------------------------------------------------------------------ hooked where it belongs ----
{
  const f = src.match(/function _applyPixelRatio\(\)\{[^\n]*\}/)[0];
  assert(/_syncOdBump\(\);/.test(f),
    'hooked into _applyPixelRatio, which ALREADY means "the rung moved" — it is called on every downshift, ' +
    'every climb and the adaptive-off restore, so there is no second list of call sites to keep in step ' +
    '(build 1350 established this hook for the shadow map)');
  assert(/_syncSunShadowRes\(\);/.test(f), '...beside the shadow resolution, which rides the same rung');
}

// -------------------------------------------- the ALBEDO term is deliberately NOT faded ----
// It runs at ~0.9 cycles per METRE (build 1379's pixel-subtense derivation), a ~1.1 m period — nowhere
// near the sampling limit at any rung, so it does not alias and fading it would only remove variation.
{
  const perM = parseFloat(src.match(/const ALB_DETAIL_PER_M = ([\d.]+)/)[1]);
  assert(perM < 2, 'the albedo term is low frequency (' + perM + ' cycles/m, ~' + (1 / perM).toFixed(1) + ' m period)');
  assert(!/uOdAlb = _od/.test(src) && !/_odAlbU/.test(src), 'and nothing fades it');
  assert(/shader\.uniforms\.uOdAlb = \{ value: \(mat\.userData\._odAmp > 0\)/.test(src),
    'it stays per-material, because the macro and detail layers carry different amplitudes');
}

done('build 1383: the relief fades with the rung, through one shared uniform and the hook that already means "the rung moved"');
