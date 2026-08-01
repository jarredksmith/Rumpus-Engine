import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1247: REAL BOKEH. The DoF's first pass is a 32-tap golden-angle (Vogel) DISC gather with a
// highlight weight so bright points bloom into discs instead of fading into mist; the second pass is
// a small CoC-scaled fill. 1241's guarantees survive: own-focus tap weights (the halo fix), a hard
// radius cap (banding impossible), and the encode-once invariant in the presenting pass.

const dof = src.slice(src.indexOf('build 1247: REAL BOKEH'), src.indexOf('_dofMatH = new THREE.ShaderMaterial'));
assert(dof.length > 100 && dof.length < 8000, 'the shader block is where expected');

// --- executable: the Vogel disc really is a uniform disc --------------------------------------------
// pin the exact GLSL, then run the same maths: N=32 golden-angle points
assert(dof.includes("'    float rr = sqrt((fi + 0.5) / 32.0) * radius;',"), 'radius grows as sqrt(i/N) — equal area per ring, a UNIFORM disc');
assert(dof.includes("'    float th = fi * 2.39996323;',"), 'golden-angle rotation — no spoke alignment');
const pts = [];
for (let i = 0; i < 32; i++) {
  const rr = Math.sqrt((i + 0.5) / 32);
  const th = i * 2.39996323;
  pts.push([rr * Math.cos(th), rr * Math.sin(th)]);
}
// all points inside the unit disc, none duplicated, and the mean sits near the centre (balance)
let maxR = 0, mx = 0, my = 0;
for (const [x, y] of pts) { maxR = Math.max(maxR, Math.hypot(x, y)); mx += x / 32; my += y / 32; }
assert(maxR <= 1.0001, 'every tap stays inside the aperture');
assert(Math.hypot(mx, my) < 0.08, 'the pattern is balanced — no directional bias to smear the image sideways');
// uniformity: quarter-disc (r<0.5) holds ~a quarter of the taps — a gaussian would hold far more
const inner = pts.filter(([x, y]) => Math.hypot(x, y) < 0.5).length;
assert(inner >= 6 && inner <= 10, `equal-area spacing: ${inner}/32 taps inside half the radius (~8 expected) — flat disc, not centre-weighted mist`);
// worst nearest-neighbour gap at the capped 14-texel radius is covered by bilinear + the fill pass
let worst = 0;
for (const p of pts) { let best = 9; for (const q of pts) { if (p === q) continue; best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1])); } worst = Math.max(worst, best); }
assert(worst * 14 < 4.5, 'the widest gap between taps at full radius stays under the fill pass reach');

// --- the highlight weight: linear-space, threshold, bounded -----------------------------------------
assert(dof.includes("'    float w = (1.0 + 5.0*max(0.0, lum - 0.7)) * (0.25 + 0.75*cocAt(uv2));',"),
  'each tap = highlight emphasis x its OWN CoC (1241 halo rule kept)');
const wOf = (lum, coc) => (1 + 5 * Math.max(0, lum - 0.7)) * (0.25 + 0.75 * coc);
near(wOf(0.5, 1), 1.0, 1e-9);                       // ordinary pixel: weight 1 — the disc is flat
assert(wOf(1.0, 1) / wOf(0.5, 1) === 2.5, 'a full-bright tap dominates 2.5x — the disc reads as a highlight, not a wash');
assert(wOf(2.0, 1) / wOf(0.5, 1) === 7.5, 'an HDR emissive dominates hard — bokeh circles come from the brightest points');
assert(wOf(1.0, 0) > 0, 'an in-focus bright tap never zeroes out (division safety)');
// the weight is computed BEFORE the encode: the disc pass carries no _out() on its main path
const discFrag = dof.slice(dof.indexOf('fragDisc'), dof.indexOf('fragFill'));
assert(!/_out\(sum|_out\(c\.rgb\)/.test(discFrag), 'the disc averages LINEAR light (the pass never presents; encode lives in the fill pass)');

// --- structure: disc feeds fill, fill presents ------------------------------------------------------
assert(/fragmentShader:fragDisc/.test(src) && /fragmentShader:fragFill/.test(src), 'the two passes ship as the H/V material pair (plumbing untouched)');
const fillFrag = dof.slice(dof.indexOf('fragFill'));
assert(/_out\(c0\.rgb\)/.test(fillFrag) && /_out\(r\.rgb\)/.test(fillFrag),
  'the fill pass encodes both its paths through the shared OETF — the 1115 invariant holds where the frame presents');
assert(dof.includes("'  if(radius < 0.35){ gl_FragColor = texture2D(tColor, vUv); return; }',"),
  'the disc early-out passes linear through untouched (uEncode is always 0 on a non-presenting pass)');
assert(/for\(int i=-1;i<=1;i\+\+\) for\(int j=-1;j<=1;j\+\+\)/.test(dof), 'the fill is a 3x3 tent');
assert(dof.includes("'    float w = ((i==0 && j==0) ? 2.0 : 1.0) * (0.25 + 0.75*cocAt(uv2));',"),
  'the fill weighs by own CoC too — sharp pixels are not dragged into the fill');

done('build 1247: real bokeh — Vogel disc executed (uniform, balanced, gap-covered), highlight weights computed, halo rule in both passes, encode invariant in the presenting pass');
