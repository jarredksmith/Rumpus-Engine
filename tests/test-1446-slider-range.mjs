// build 1446 — a slider never silently rewrites a value it cannot represent.
//
// The audit said the transform fields "clamp typed values back to +-65 while ARENA reaches 2000". Measured
// live, that is WRONG in a way that makes the real defect sharper: the typed value is not clamped at all —
// the commit takes it verbatim, as its own comment has always said — and what actually happens is silent
// and destructive one gesture later, because a `<input type=range>` clamps its OWN value:
//
//   type 300 into Pos X    state 300, prop at x=300, the number field reads 300
//                          ...and the slider reads 65
//   touch the slider       state 65, and the prop teleports 235 units
//
// Same for height (type 60, one touch, back to 20) and scale (type 40, one touch, back to 9.99). In an
// 800-unit arena the position sliders reached 8.1% of it.
//
// Two derivations, neither inventing a bound:
//   POSITION tracks ARENA, which is exactly how far the floor goes. At the default arena of 70 that is a
//   5-unit widening of a 65-unit slider, so nothing a creator has today moves.
//   ANY field widens to include the value it is showing — the general rule, and what fixes scale and
//   height without guessing new limits for them.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ---- EXECUTED: the range derivation --------------------------------------------------------------- */
const range = (fld, v, arena) => new Function('FLD', 'V', 'ARENA',
  extractFunction('_fieldRange', src) + '; return _fieldRange(FLD, V);')(fld, v, arena);

const PX = { k: 'px', min: -65, max: 65, step: 0.01 };
const PY = { k: 'py', min: -10, max: 20, step: 0.01 };
const SX = { k: 'sx', min: 0.00001, max: 10, step: 0.01 };
const RY = { k: 'ry', min: -180, max: 180, step: 0.1 };

{
  // the default arena is 70, so the position slider barely moves — nothing anyone has today changes
  const r = range(PX, 0, 70);
  eq(r.min, -70, 'at the default arena the position slider spans the floor');
  eq(r.max, 70, '...both ways');
  const big = range(PX, 0, 800);
  eq(big.max, 800, 'and in an 800-unit arena it spans 800, not 65');
  eq(big.min, -800, '...symmetrically');
  const tiny = range(PX, 0, 15);
  eq(tiny.max, 65, 'a SMALLER arena keeps the authored range — the rule only ever widens');
  eq(tiny.min, -65, '...so a small level does not get a cramped slider');
}
{
  // the general rule: whatever the field, the slider can show what the field holds
  eq(range(PY, 60, 70).max, 60, 'a height of 60 widens the height slider to reach it');
  eq(range(PY, -40, 70).min, -40, '...and downwards');
  eq(range(SX, 40, 70).max, 40, 'a scale of 40 widens the scale slider');
  eq(range(SX, 40, 70).min, 0.00001, '...without touching the epsilon that keeps zero out');
  eq(range(RY, 90, 70).max, 180, 'a value inside the range leaves it exactly alone');
  eq(range(RY, 90, 70).min, -180, '...on both ends');
}
{
  // rotation and scale must NOT follow the arena — only position means metres of floor
  eq(range(RY, 0, 2000).max, 180, 'a huge arena does not make the rotation slider huge');
  eq(range(SX, 1, 2000).max, 10, '...nor the scale slider');
  eq(range(PY, 0, 2000).max, 20, '...nor the height slider, which is not an arena width');
}
{
  // hostile / absent state must not produce NaN bounds, which would break every slider in the panel
  const noArena = new Function('FLD', 'V',
    extractFunction('_fieldRange', src) + '; return _fieldRange(FLD, V);')(PX, 0);
  eq(noArena.max, 65, 'with no ARENA in scope the authored range stands');
  eq(range(PX, NaN, 800).max, 800, 'a NaN value does not widen anything');
  eq(range(PX, Infinity, 800).max, 800, '...nor an infinite one');
  eq(range(PX, 0, Infinity).max, 65, '...and an absurd arena is ignored rather than believed');
}

/* ---- EXECUTED: the one writer --------------------------------------------------------------------- */
// A fake range element that behaves the way the real one does: assigning `value` OR `step` re-sanitises
// the value against min/max and the step lattice anchored at min. That behaviour is the whole bug.
const mkRange = () => {
  const el = { _min: 0, _max: 100, _step: 1, _v: 0 };
  const sane = () => {
    let v = Math.min(el._max, Math.max(el._min, el._v));
    if (el._step !== 'any') {
      const st = +el._step;
      v = el._min + Math.round((v - el._min) / st) * st;
      /* the real element steps DOWN to the last lattice value at or below max rather than clamping off it —
         measured live: min 0.00001, step 0.01, max 40, value 40 gives 39.99001, not 40. Modelling that
         wrongly is what made this rig disagree with the browser on the one case the build is about. */
      while (v > el._max + 1e-12) v -= st;
      while (v < el._min - 1e-12) v += st;
    }
    el._v = v;
  };
  return Object.defineProperties(el, {
    min: { get: () => String(el._min), set: (x) => { el._min = +x; sane(); } },
    max: { get: () => String(el._max), set: (x) => { el._max = +x; sane(); } },
    step: { get: () => String(el._step), set: (x) => { el._step = (x === 'any') ? 'any' : +x; sane(); } },
    value: { get: () => String(el._v), set: (x) => { el._v = +x; sane(); } },
  });
};
const show = (rng, fld, v, arena) => new Function('RNG', 'FLD', 'V', 'ARENA',
  extractFunction('_fieldRange', src) + extractFunction('_showOnRange', src) +
  '; _showOnRange(RNG, FLD, V);')(rng, fld, v, arena);

{
  const rng = mkRange();
  show(rng, PX, 300, 800);
  eq(+rng.value, 300, 'the slider SHOWS a typed 300 rather than clamping it to 65');
  eq(+rng.max, 800, '...because its range grew to the arena');
  eq(rng.step, '0.01', '...keeping the authored 1 cm step, which 300 lands on');
}
{
  const rng = mkRange();
  show(rng, PY, 60, 70);
  eq(+rng.value, 60, 'a height outside the authored range is shown, not rewritten');
  eq(+rng.max, 60, '...by widening to it');
}
{
  // the step lattice is anchored at min, and scale's min is the 0.00001 epsilon — so 40 is NOT on it
  const rng = mkRange();
  show(rng, SX, 40, 70);
  eq(+rng.value, 40, 'a scale of 40 survives exactly');
  eq(rng.step, 'any', '...because the authored lattice could not hold it, so the step relaxed');
  // and this is the ordering that cost a run: setting `step` re-sanitises `value`, so RESTORING the
  // authored step after writing the value undid the whole fix
  const i = extractFunction('_showOnRange', src);
  assert(i.indexOf('rng.step = fld.step') < i.indexOf('rng.value = v'),
    'the authored step is set BEFORE the value, never restored after it');
}
{
  const rng = mkRange();
  show(rng, SX, 2, 70);
  eq(+rng.value, 2.00001, 'an ordinary value keeps the authored step — 1 cm nudges still feel like 1 cm');
  eq(rng.step, '0.01', '...so the step is only ever relaxed where it has to be');
  // and that 1e-5 is not a rounding accident: scale's min is the epsilon that keeps zero out, so its whole
  // lattice is offset from every round number. Relaxing for THAT would drop the authored step on nearly
  // every scale value — which is why the tolerance is half a step rather than an epsilon.
}
{
  // re-showing an in-range value after an out-of-range one must put the authored step BACK
  const rng = mkRange();
  show(rng, SX, 40, 70);
  eq(rng.step, 'any', 'relaxed for the odd value');
  show(rng, SX, 3, 70);
  eq(rng.step, '0.01', '...and restored for the next ordinary one');
  const fn = extractFunction('_showOnRange', src);
  assert(/\+fld\.step \* 0\.5/.test(fn),
    'the tolerance is HALF A STEP — the most a correct rounding can move a value — not an epsilon');
}

/* ---- one writer, and every site asks it ------------------------------------------------------------ */
// There were THREE places that assigned rng.value — the build, the commit's write-back, and the
// proportional siblings' refresh — plus updateFieldDisplays. Any one of them assigning an out-of-range
// number re-introduces the bug, which is why this counts rather than spot-checks.
eq((src.match(/_showOnRange\(/g) || []).length, 5,
  'one definition and four call sites — every place a value reaches a slider');
const build = src.slice(src.indexOf("const rng = document.createElement('input'); rng.type='range';"));
assert(!/\brng\.value\s*=/.test(build.slice(0, 2000)),
  'the field builder no longer writes rng.value itself');
const upd = extractFunction('updateFieldDisplays', src);
assert(/_showOnRange\(f\.rng, f, v\)/.test(upd) && !/f\.rng\.value\s*=/.test(upd),
  'and neither does updateFieldDisplays');
assert(/editorFieldInputs\.push\(\{ k:fld\.k, min:fld\.min, max:fld\.max, step:fld\.step, rng, num \}\);/.test(src),
  'the recorded inputs carry their own bounds and step — without them the re-derivation reads undefined');

/* ---- what must not have changed --------------------------------------------------------------------- */
assert(/tgt\.state\[fld\.k\] = v;\s+\/\/ typed numbers can exceed slider min\/max/.test(src),
  'a typed value is still taken verbatim — it was never the thing doing the clamping');
assert(/if\(isScale && !\(v > 0\)\) return;/.test(src), 'build 1437’s zero-scale refusal is untouched');

done('build 1446: the position sliders reach as far as the level does, every field widens to show what it ' +
     'holds, and the step only relaxes where the authored lattice cannot land on the value — so typing a ' +
     'number and then touching its slider stops teleporting the prop');
