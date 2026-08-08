// build 1437 — typing a fractional scale no longer destroys the prop.
//
// A number input commits PER KEYSTROKE (`num.oninput = ()=>commit(num.value,false)`), so typing a value
// passes through every prefix of it — and for any scale-down written the way people write them, one of
// those prefixes is "0". Proportional scaling is ON by default.
//
// On a prop at scale (2,2,2), typing 0.8 into Scale X:
//
//   "0"    v=0  -> ratio 0    -> not (isFinite && >0) -> else branch -> sx := 0
//   "0."   parseFloat("0.")=0 -> the same             -> sx := 0
//   "0.8"  old = sx || 0.00001 = 0.00001 -> ratio 80000 -> sy,sz *= 80000
//
// The field reads 0.8 and the prop is 0.00001 x 160000 x 160000. Silent, in the default configuration,
// on the commonest edit in level building.
//
// Two changes, and the second is why the first is enough: a scale of zero is REFUSED (the proportional
// branch already clamps writes at 0.00001, so it is not a value anyone can hold — and therefore not a
// state to pass through on the way to one), and the ratio's base is never SUBSTITUTED, so no path can
// invent a denominator five orders of magnitude from the truth.
import { gameSource, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

/* ---- lift the REAL commit closure ---------------------------------------------------------------- */
const iC = src.indexOf('const commit = (raw, fromSlider)=>{');
assert(iC > 0, 'found the field commit');
const iEnd = src.indexOf('\n    };', iC);
assert(iEnd > iC, 'found its end');
const commitSrc = src.slice(iC, iEnd + 7);
assert(/_xfGroupApply\(fld\.k/.test(commitSrc), 'the slice reaches the end of the body (build 1368’s group apply)');

const mk = (bodySrc) => new Function('fld', 'tgt', 'ctx', `
  const scaleProportional = true, editorActive = 'props';
  const editorTargets = { props: tgt };   // so build 1368's group apply runs, exactly as it does in play
  const editorFieldInputs = ctx.inputs, rng = ctx.rng, num = ctx.num;
  const _fmtField = (v)=>String(v);
  const _xfGroupApply = (k, o, n2, u)=>{ ctx.group.push([k, o, n2, u]); };
  const updateGizmo = ()=>{}, updateEditorOut = ()=>{};
  ${bodySrc}
  return commit;
`);

const scene = (sx, sy, sz) => {
  const tgt = { state: { sx, sy, sz }, apply: () => {} };
  const ctx = { inputs: [], rng: { value: '' }, num: { value: '' }, group: [] };
  return { tgt, ctx };
};
/** Type a string one keystroke at a time, exactly as an <input type=number> fires oninput. */
const type = (commit, ctx, text) => {
  for (let i = 1; i <= text.length; i++) { ctx.num.value = text.slice(0, i); commit(ctx.num.value, false); }
};
const FLD = { k: 'sx', step: 0.001, min: 0.01, max: 20 };

/* ---- PREMISE: the reported destruction, reconstructed from the shipped text ----------------------- */
{
  const old = commitSrc
    .replace(/\/\* build 1437:[\s\S]*?\*\/\n\s*if\(isScale && !\(v > 0\)\) return;\n/, '')
    .replace(/\/\* \.\.\.and the base[\s\S]*?\*\/\n/, '')
    .replace('const old = tgt.state[fld.k], ratio = (old > 0) ? (v/old) : 0;',
             'const old = tgt.state[fld.k] || 0.00001, ratio = v/old;');
  assert(!/!\(v > 0\)\) return/.test(old) && /\|\| 0\.00001, ratio = v\/old/.test(old),
    'the pre-1437 form was reconstructed');
  const { tgt, ctx } = scene(2, 2, 2);
  type(mk(old)(FLD, tgt, ctx), ctx, '0.8');
  assert(tgt.state.sy > 1000,
    'PREMISE: typing 0.8 used to blow the other axes up — sy = ' + tgt.state.sy);
  near(tgt.state.sy, 160000, 1, '...to exactly the reported 160000');
  assert(tgt.state.sx < 0.001, '...while the axis being typed collapsed to nothing');
}

/* ---- EXECUTED: what it does now ------------------------------------------------------------------ */
const commit = mk(commitSrc)(FLD, { state: { sx: 0, sy: 0, sz: 0 }, apply: () => {} }, { inputs: [], rng: {}, num: {}, group: [] });
assert(typeof commit === 'function', 'the shipped commit builds');

const typeInto = (start, text, fld = FLD) => {
  const { tgt, ctx } = scene(...start);
  type(mk(commitSrc)(fld, tgt, ctx), ctx, text);
  return tgt.state;
};

{
  const st = typeInto([2, 2, 2], '0.8');
  near(st.sx, 0.8, 1e-9, 'typing 0.8 gives 0.8');
  near(st.sy, 0.8, 1e-9, '...and the other axes follow the proportion, not a phantom ratio');
  near(st.sz, 0.8, 1e-9, '...both of them');
}
{
  // the property that matters for proportional scaling: the RATIOS between axes survive
  const st = typeInto([2, 4, 6], '0.25');
  near(st.sx, 0.25, 1e-9, 'a non-uniform prop keeps the axis you typed');
  near(st.sy / st.sx, 2, 1e-9, '...and its shape: sy is still 2x sx');
  near(st.sz / st.sx, 3, 1e-9, '...and sz still 3x');
}
{
  const st = typeInto([2, 2, 2], '1.5');
  near(st.sx, 1.5, 1e-9, 'a value with no leading zero was never broken, and still is not');
  near(st.sy, 1.5, 1e-9, '...on every axis');
}
{
  const st = typeInto([2, 4, 6], '12');
  near(st.sx, 12, 1e-9, 'scaling UP through an intermediate prefix ("1" then "12")');
  near(st.sy / st.sx, 2, 1e-9, '...keeps the shape too');
}
{
  const st = typeInto([2, 2, 2], '0');
  eq(st.sx, 2, 'a bare zero is refused rather than written — it is not a scale anyone can hold');
  eq(st.sy, 2, '...and nothing else moves');
}
{
  const st = typeInto([2, 2, 2], '-3');
  eq(st.sx, 2, 'and neither is a negative, which would flip the winding and break the lighting');
}
{
  // a state that is already degenerate must not become a ratio base
  const st = typeInto([0, 5, 5], '4');
  near(st.sx, 4, 1e-9, 'from a zeroed axis, the typed value lands on that axis...');
  eq(st.sy, 5, '...and the others are left alone rather than multiplied by an invented denominator');
  eq(st.sz, 5, '...both');
}
{
  // position/rotation are untouched by any of this
  const st = typeInto([2, 2, 2], '0', { k: 'px', step: 0.01, min: -65, max: 65 });
  eq(st.px, 0, 'a position of zero is a real value and still commits');
}

/* ---- the shape, so neither half can quietly come back -------------------------------------------- */
assert(/if\(isScale && !\(v > 0\)\) return;/.test(commitSrc), 'the zero is refused for scale fields only');
assert(/const old = tgt\.state\[fld\.k\], ratio = \(old > 0\) \? \(v\/old\) : 0;/.test(commitSrc),
  'and the ratio base is the live value or nothing — never a substitute');
assert(!/tgt\.state\[fld\.k\] \|\| 0\.00001/.test(src), 'the substituted denominator is gone from the engine');
const iGuard = commitSrc.indexOf('!(v > 0)'), iRatio = commitSrc.indexOf('ratio = (old > 0)');
assert(iGuard > 0 && iRatio > iGuard, 'the refusal happens before anything reads or writes the state');
assert(/const _xfOld = tgt\.state\[fld\.k\];/.test(commitSrc) &&
  commitSrc.indexOf('const _xfOld') < iRatio,
  'build 1368’s group apply still captures the primary’s value before the commit changes it');

done('build 1437: a number field commits per keystroke, so typing 0.8 passed a zero through the ' +
     'proportional-scale path and the next keystroke divided by a 0.00001 stand-in — 160000x on two axes, ' +
     'silently, by default. A scale of zero is refused and the ratio base is never substituted');
