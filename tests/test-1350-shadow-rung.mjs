// (build 1350) THE SUN SHADOW MAP JOINS THE LADDER — closing debt build 1346 created.
// 1346 raised the near cascade to 4096 for a measured reason (the corner leak is a fixed number of texels
// wide, so halving the texel halved it) and gave the cost NO WAY OUT: `SUN_SHADOW_PX` was a constant, so
// the adaptive ladder could shed motion blur, then MSAA and SSAO, then a third of the pixels, while the
// biggest single draw in the frame stayed at 4096 the whole way down.
//
// That is build 1263's lesson from the other side: a perf change may not remove work something else relies
// on, and it may not ADD work with no shed path.
//
// Measured live, sweeping the rung and reading the real light list:
//   rung 0/1/2/3/0  ->  sunMap 4096 / 2048 / 2048 / 1024 / 4096
//   lights 35 and dirShadowCasters 2 at EVERY rung — the light count never moves
//   programs, warm, with the resize live: 69 / 69 / 69 / 69 / 69  (control, map pinned: also flat)
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the rung table ----
{
  const steps = JSON.parse(extractConst('_SUN_PX_STEP'));
  eq(steps.length, 4, 'one multiplier per resolution rung');
  eq(steps[0], 1.0, 'the top rung keeps build 1346’s full 4096 — the leak fix is not undone for anyone ' +
    'whose machine can afford it');
  assert(steps.every((v, i) => i === 0 || v <= steps[i - 1]), 'and it only ever goes down');
  assert(steps[3] < steps[0], 'the bottom rung genuinely sheds');
  const f = extractFunction('_sunShadowPxFor', src);
  assert(/Math\.max\(512,/.test(f), 'with a floor: a shadow map can get cheap, not useless');
  assert(/Math\.min\(_SUN_PX_STEP\.length-1/.test(f), 'and an out-of-range rung clamps rather than reading undefined');
}

// ---- resizing a TEXTURE is safe; changing a light is not ----
{
  const f = extractFunction('_syncSunShadowRes', src);
  assert(/moon\.shadow\.mapSize\.set\(want, want\)/.test(f), 'it resizes the map');
  assert(/moon\.shadow\.map\.dispose\(\)/.test(f), '...and disposes the old one so three reallocates');
  assert(!/castShadow/.test(f),
    'it NEVER touches castShadow — that is a #define (NUM_DIR_LIGHT_SHADOWS) and would recompile every ' +
    'material, which is the freeze of builds 636/977/1153/1155 and exactly why build 1348 could not do ' +
    'the same thing for point shadows');
  assert(!/\.visible/.test(f), 'and never .visible, which changes the count too (build 977’s trap)');
  assert(!/moonFar/.test(f),
    'the FAR cascade is deliberately left alone: its texel is 4x coarser by design, it covers geometry ' +
    'where a corner artifact is under a pixel, and dropping its shadow would change the caster count');
  assert(/if\(moon\.shadow\.mapSize\.x === want\) return;/.test(f),
    'the common case — nothing moved — costs one comparison and no allocation');
}

// ---- the TDZ, handled explicitly rather than behind a catch ----
// `_applyPixelRatio()` runs at boot, ~1,500 lines before `moon` and `SUN_SHADOW_PX` exist. `typeof` does
// NOT guard a temporal dead zone (build 1127 lost the sky for eight builds to exactly that, behind a catch
// that hid it), so a ready flag does the work and the catch is only a backstop.
{
  const f = extractFunction('_syncSunShadowRes', src);
  assert(/if\(!_sunShadowReady\) return;/.test(f), 'a ready flag gates it');
  assert(!/typeof moon/.test(f), '...and NOT a typeof guard, which would throw in the dead zone');
  const decl = src.indexOf('let _sunShadowReady = false;');
  const set = src.indexOf('_sunShadowReady = true;');
  const use = src.indexOf('function _applyPixelRatio()');
  const light = src.indexOf('moon.shadow.mapSize.set(SUN_SHADOW_PX, SUN_SHADOW_PX);');
  assert(decl >= 0 && decl < use, 'the flag is declared before the function that reads it');
  assert(set > light - 5 && set > decl, 'and raised only once the light actually exists');
}

// ---- it is wired to the one place that already means "the rung moved" ----
{
  const f = extractFunction('_applyPixelRatio', src);
  assert(/_syncSunShadowRes\(\)/.test(f),
    '_applyPixelRatio is called on every downshift, every climb and the adaptive-off restore, so hooking ' +
    'there needs no second list of call sites to keep in step');
  assert(/renderer\.setPixelRatio/.test(f), '...and its original job is unchanged');
}

// ---- build 1346's constant is untouched ----
assert(/const SUN_SHADOW_PX = IS_COARSE \? 1024 : 4096;/.test(src),
  'the top-rung value is still 1346’s measured one; this build adds a way DOWN, it does not retune it');

done('build 1350: the shadow map sheds with the ladder, and the light count never moves');
