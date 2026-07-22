// (build 1037) SOFT JOINT BLENDING — author report: some auto-rigged models creased sharply at
// knees/elbows. The 1/d^4 skinning falloff gave a blend zone only ~one limb-girth wide, so verts
// snapped between parent/child bones across a bend. New kernel: w = 1/((d^2 + r^2)^2) with a
// per-bone blend radius r (build 1039: 30% of bone length clamped to 2.5%..10% of height) — unchanged
// tight falloff far away (no cross-limb bleed), smooth multi-girth ramp across every joint.
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

const env = new Function(
  extractFunction('_arBlendR', src) + '\n' + extractFunction('_arWeightKernel', src) + '\n' + extractFunction('_segDist2', src)
  + '\nreturn { r:_arBlendR, k:_arWeightKernel, d2:_segDist2 };')();

// ---- the blend-radius policy ----
near(env.r(0.4, 1.8), 0.12, 1e-9, 'r = 30% of the bone length in the normal range (build 1039: widened)');
near(env.r(0.05, 1.8), 0.045, 1e-9, 'stubby bones clamp UP to 2.5% of model height (joints still blend)');
near(env.r(2.0, 1.8), 0.18, 1e-9, 'lanky bones clamp DOWN to 10% of model height (no whole-limb mush)');
near(env.r(0.4, 18) / env.r(0.04, 1.8), 10, 1e-6, 'the radius scales with the model (same proportions x10 -> x10)');
assert(env.r(0.4, 0) > 0, 'a degenerate zero-height model still gets a positive radius');

// ---- knee scenario: thigh (0,1,0)-(0,0.5,0) over shin (0,0.5,0)-(0,0,0), girth 0.05 ----
const A = [0,1,0, 0,0.5,0], B = [0,0.5,0, 0,0,0];
const r = env.r(0.5, 1.0), r2 = r*r;
const RHO = 0.05;
const share = (t) => {   // shin's weight share at a vertex t above the knee on the thigh surface
  const p = [RHO, 0.5 + t, 0];
  const dA = env.d2(p[0],p[1],p[2], ...A), dB = env.d2(p[0],p[1],p[2], ...B);
  const wA = env.k(dA, r2), wB = env.k(dB, r2);
  return wB / (wA + wB);
};
const shareOld = (t) => {   // the pre-1037 kernel, for comparison
  const p = [RHO, 0.5 + t, 0];
  const dA = env.d2(p[0],p[1],p[2], ...A), dB = env.d2(p[0],p[1],p[2], ...B);
  const wA = 1/(dA*dA+1e-8), wB = 1/(dB*dB+1e-8);
  return wB / (wA + wB);
};

near(share(0), 0.5, 1e-6, 'a vertex level with the knee splits 50/50 between thigh and shin');
assert(share(2*RHO) > 0.12, 'two girths up the thigh the shin still holds a real share (the smooth ramp): ' + share(2*RHO).toFixed(3));
assert(shareOld(2*RHO) < 0.05, '...where the old kernel had already snapped to ~all-thigh (the crease): ' + shareOld(2*RHO).toFixed(3));
assert(share(2*RHO) > 2.5 * shareOld(2*RHO), 'the blend zone is materially wider than before');
assert(share(RHO) > share(2*RHO) && share(2*RHO) > share(4*RHO), 'the ramp falls off monotonically up the limb');
assert(share(5*RHO) < 0.08, 'mid-thigh the thigh bone is decisively dominant again (>92%) — softening is local to the joint');

// far-limb isolation: a vertex on the thigh must not pick up meaningful weight from a distant bone
{
  const ARM = [0.6,1.4,0, 0.3,1.4,0];
  const p = [RHO, 0.75, 0];
  const wThigh = env.k(env.d2(p[0],p[1],p[2], ...A), r2);
  const wArm = env.k(env.d2(p[0],p[1],p[2], ...ARM), r2);
  assert(wArm / (wThigh + wArm) < 0.01, 'far falloff is unchanged — no cross-limb bleed from the softening');
}

// ---- wiring: the rig builder actually uses it ----
assert(/const _br=_arBlendR\(_sl, _rigH\);/.test(src), 'each bone segment gets its blend radius');
assert(/segs\.push\(\{ bi, a:j\.pos, b:child\.pos, r2:_br\*_br,/.test(src), '...carried as r2 on the segment');
assert(/let w=_arWeightKernel\(d2, sg\.r2\);/.test(src), 'the per-vertex weight loop runs the soft kernel');
assert(!/1\/\(d2\*d2\+1e-8\)/.test(src), 'the old crease-prone kernel is gone');
assert(/weights blend smoothly across knees and elbows/.test(manual), 'the field manual mentions the smooth joints');

done('build 1037: knees and elbows blend across a real ramp — no more paper-fold creases');
