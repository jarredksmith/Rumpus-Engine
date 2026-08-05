// build 1388: a primitive's relief comes off the same sample as its colour.
//
// Build 1387 gave the two ENGINE surfaces an authored normal map correlated with their albedo — and the
// census that build's own tooling made possible said the engine floor plane is 3% of the stock frame while
// the instanced primitive deck is ~90%. Primitives cannot use those maps: build 1384's texture modulation
// is triplanar and object-space, and their `normalMap` slot holds build 1139's procedural value-noise,
// which is a different field from the one modulating their colour. Structure in the colour, unrelated
// micro-noise in the relief — 1387's defect, one layer down, on the surface that dominates the frame.
//
// The fix costs ZERO extra texture fetches: `_odTexL` is the luminance the albedo modulation already
// sampled, so the relief is correlated BY CONSTRUCTION rather than by a matching pair of files.
import { gameSource, extractFunction, assert, near, eq, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');
const fn = extractFunction('applyObjDetail');

// ---------------------------------------- the #if is what makes dFdx legal, and it is checked ----
// A shader that fails to compile takes every primitive in the level with it, SILENTLY. `dFdx` needs
// GL_OES_standard_derivatives on WebGL 1, and three emits that directive only under a specific set of
// conditions. Every define in the guard must be one of them — asserted against the real build, because if
// an upgrade changes either side the guard stops guarding and nothing errors.
{
  const gate = fn.match(/'#if defined\( ([^']+) \)',/);
  assert(gate, 'the derivative block is guarded by a #if');
  const defines = gate[1].split(/\s*\|\|\s*/).map(d => d.replace(/^defined\(\s*|\s*\)$/g, '').trim());
  eq(defines.length, 4, 'four defines: ' + defines.join(', '));

  // three's own condition, read out of the shipped library
  const lib = (await import('node:fs')).readFileSync(
    new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');
  const cond = lib.match(/parameters\.extensionDerivatives[^?]*\? '#extension GL_OES_standard_derivatives/);
  assert(cond, 'three ' + T.REVISION + ' still gates the derivative extension on a parameter list');
  const terms = cond[0];
  // each define -> the parameter that both emits it AND appears in the extension condition
  const MAP = {
    TANGENTSPACE_NORMALMAP: 'tangentSpaceNormalMap',
    USE_BUMPMAP: 'bumpMap',
    FLAT_SHADED: 'flatShading',
    PHYSICAL: "shaderID === 'physical'",
  };
  for(const d of defines){
    assert(MAP[d], d + ' is a define this test knows how to justify');
    assert(terms.includes(MAP[d]),
      d + ' -> `' + MAP[d] + '` is one of the terms that makes three emit GL_OES_standard_derivatives');
    if(d !== 'PHYSICAL')   // PHYSICAL comes from the shaderID, not from a `? '#define' :` line
      assert(new RegExp(d + "' : ''").test(lib), '...and three really emits #define ' + d);
  }
  assert(/#define STANDARD\s*\n#ifdef PHYSICAL/.test(T.ShaderLib.physical.fragmentShader),
    'and PHYSICAL is a real define in the physical shader');
}

// -------------------------------------------------- derivatives sit in UNIFORM control flow ----
{
  const blk = fn.slice(fn.indexOf("'#if defined("), fn.indexOf("'#endif',"));
  assert(/if\( uOdTexN > 0\.0 && uOdTexA > 0\.0 \)\{/.test(blk),
    'the only branch around a derivative is on TWO UNIFORMS — a dFdx inside non-uniform control flow is ' +
    'undefined in GLSL ES, which is why the degenerate case is a select and not an early out');
  const derivs = (blk.match(/dFd[xy]\(/g) || []).length;
  eq(derivs, 4, 'four derivatives: the surface position in x and y, and the height in x and y');
  // ...and none of them is inside the degeneracy test
  const after = blk.slice(blk.indexOf('_bN'));
  assert(!/dFd[xy]\(/.test(after), 'no derivative is taken after the degeneracy value is formed');
  assert(/normal = \( dot\( _bN, _bN \) > 1e-20 \) \? normalize\( _bN \) : normal;/.test(blk),
    'a degenerate surface gradient falls back to the unperturbed normal rather than to NaN');
}

// ------------------------------------------------------ the maths, ported and executed ----
// Mikkelsen's surface gradient, which is what three's perturbNormalArb computes. Ported here rather than
// asserted, because the sign and cross-product order are exactly the kind of thing that produces a
// plausible frame while being wrong.
{
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const mul = (a,k) => [a[0]*k, a[1]*k, a[2]*k];
  const norm = (a) => { const l = Math.hypot(...a); return l > 0 ? mul(a, 1/l) : a; };
  const perturb = (sx, sy, n, hx, hy) => {
    const R1 = cross(sy, n), R2 = cross(n, sx);
    const det = dot(sx, R1);
    const G = mul(add(mul(R1, hx), mul(R2, hy)), Math.sign(det));
    const N = sub(mul(n, Math.abs(det)), G);
    return dot(N, N) > 1e-20 ? norm(N) : n;
  };
  const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];

  // a flat surface facing +z, one pixel spanning 1 cm
  const sx = [0.01, 0, 0], sy = [0, 0.01, 0], n = [0, 0, 1];
  eq(JSON.stringify(perturb(sx, sy, n, 0, 0).map(v => +v.toFixed(9))), JSON.stringify([0, 0, 1]),
    'no height gradient leaves the normal exactly alone');

  const tilted = perturb(sx, sy, n, 0.001, 0);   // 1 mm of height across one pixel, in +x
  assert(tilted[0] < 0, 'a height rising in +x tilts the normal back toward -x (uphill faces away)');
  near(Math.hypot(...tilted), 1, 1e-9, '...and the result is unit length');
  const steeper = perturb(sx, sy, n, 0.004, 0);
  assert(Math.abs(steeper[0]) > Math.abs(tilted[0]), 'a steeper gradient tilts further');

  // the shipped relief depth, at a plausible on-screen scale: a few degrees, which is what micro-relief is
  const RELIEF = parseFloat(src.match(/const PROP_TEX_RELIEF = ([\d.]+);/)[1]);
  const dh = 0.35 * RELIEF;                        // ~a third of the luminance range across one pixel
  const real = perturb(sx, sy, n, dh, 0);
  const deg = Math.acos(Math.min(1, real[2])) * 180 / Math.PI;
  assert(deg > 0.5 && deg < 45, 'at the shipped depth a strong local gradient tilts ' + deg.toFixed(1) +
    ' degrees — relief, not a crumpled surface');

  // degenerate: an edge-on quad gives a zero determinant, which is where three's own version NaNs
  const dgn = perturb([0,0,0], [0,0,0], n, 0.01, 0.01);
  eq(JSON.stringify(dgn), JSON.stringify(n), 'a degenerate surface derivative returns the normal unchanged');
  assert(dgn.every(Number.isFinite), '...and never NaN');
}

// -------------------------------------------------------- correlation: the SAME sample ----
{
  assert(/'  _odTexL = _tl;'/.test(fn),
    'the height is the luminance the ALBEDO modulation already computed — one sample, two uses, so the ' +
    'relief and the colour cannot describe different surfaces');
  const alb = fn.indexOf('_odTexL = _tl;'), nrm = fn.indexOf('#include <normal_fragment_maps>');
  assert(alb > 0 && nrm > alb, 'and it is written before the normal patch reads it');
  // ...which is only safe because of three's own chunk order, asserted against the real build
  const frag = T.ShaderLib.physical.fragmentShader;
  assert(frag.indexOf('#include <map_fragment>') < frag.indexOf('#include <normal_fragment_maps>'),
    'three ' + T.REVISION + ' still emits map_fragment before normal_fragment_maps — get this backwards ' +
    'and the height is read before it is written, which is silent garbage rather than an error');
  assert(/float _odTexL;/.test(fn) && /vec3 _odP; float _odBase; float _odTexL;/.test(fn),
    'the height is a shader global beside the noise field\'s, so no extra evaluation is needed');
  eq((fn.match(/texture2D\(uOdTex/g) || []).length, 3,
    'still exactly three texture fetches — the relief adds NONE');
}

// ------------------------------------------------------- who gets it, and who does not ----
{
  assert(/\.replace\('#include <normal_fragment_maps>', \(albOnly && texOn\) \? \[/.test(fn),
    'the patch applies only to a material carrying the texture modulation');
  assert(fn.includes(": albOnly ? '#include <normal_fragment_maps>' : ["),
    '...an albedo-only material without it is byte-identical to build 1387');
  assert(/normal = normalize\(normal \+ _odG \* uOdBump\);/.test(fn),
    '...and build 1145\'s full-mode noise relief is untouched');
  // probed live: 16 of 16 materials carrying _odTex also carry a tangent-space normal map, so the #if is
  // satisfied for every one of them, and glGetError was 0 with 0 program diagnostics.
}

// ------------------------------------------------- one rung ladder, shared by reference ----
{
  assert(/shader\.uniforms\.uOdTexN = _odTexNU;/.test(fn),
    'the amplitude is the SHARED object (build 1181) — a rung change is one CPU write, never a recompile');
  assert(!/uOdTexN = \{ value:/.test(src), '...never a fresh literal, which would strand every built material');
  const sync = extractFunction('_syncOdBump');
  assert(/_odTexNU\.value = _odTexNBase \* _OD_BUMP_STEP\[i\];/.test(sync),
    'and it fades on build 1383\'s ladder — this is derivative-based bump, quantised to the 2x2 quad, so ' +
    'it is exactly the high-frequency normal detail that must not outrun a shedding antialiaser');
  assert(/_odBumpU\.value = _odBumpBase \* _OD_BUMP_STEP\[i\];/.test(sync), '...the SAME ladder, not a second one');

  // TDZ: _applyPixelRatio() runs at boot, thousands of lines above the constant
  const decl = src.indexOf('let _odBumpBase = 0, _odTexNBase = 0;');
  const konst = src.indexOf('const PROP_TEX_RELIEF =');
  const hand = src.indexOf('_odTexNBase = PROP_TEX_RELIEF;');
  const boot = src.indexOf('_applyPixelRatio();');
  assert(decl > 0 && konst > decl && hand > konst && boot > decl && boot < hand,
    'declared above the boot call, handed over at the constant\'s own site after it initialises');
  assert(!/PROP_TEX_RELIEF/.test(sync), 'and the sync never names the constant — reading it there is the TDZ');
  const R = parseFloat(src.match(/const PROP_TEX_RELIEF = ([\d.]+);/)[1]);
  assert(R > 0.002 && R < 0.2, 'the depth is a real distance in metres (' + R + '), because the surface ' +
    'gradient divides a height derivative by a POSITION derivative — a gain would be meaningless');
}

done('build 1388: the deck that is 90% of the stock frame gets relief off its own colour, for no extra fetches');
