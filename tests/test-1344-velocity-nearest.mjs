// (build 1344) THE BLUR WAS INTERPOLATING A FLAG.
// Reported from play three times, and build 1343's readout is what finally located it: "AA MSAA x4,
// render 1.00/1.00, rung 0" — and still jagged. So MSAA WAS reaching the frame at native resolution, and
// whatever hardened the edge happened AFTER the resolve, in the post chain, with motion blur the only
// variable. That eliminated the ladder (1342), the render scale, WebGL1 and DoF in one line.
//
// `_matAfter` reads `_velRT` — a HALF-RES buffer whose rg is a direction and whose a is a written/not-
// written FLAG — at FULL-res uvs, and branches on `vv.a > 0.5`. Under LinearFilter every screen pixel
// samples a quarter of a texel off centre, so bilinear returns a 0.75/0.25 mix of two texels and NEVER a
// pure one. At a silhouette that hands the threshold a flag of 0.75 or 0.25, so adjacent pixels flip
// between the velocity path and the rotation path — which do not agree at all, since the rotation path
// knows nothing of camera translation or object motion.
//
// Measured on the default level in real motion (tools/probe/vel-discont2.mjs, vel-fixed.mjs), the blur's
// own direction field, with the same field minus the branch as the control:
//
//   control (no branch)          max adjacent jump  0.0 px      hard-jump pixels    0
//   LinearFilter (as shipped)                      15.3 px                        492    flag 0.74% invented
//   mix() by the flag                               6.6 px                        552
//   3x3 velocity DILATION                          35.1 px  <- the textbook fix, and WORSE here
//   NEAREST (build 1344)                            1.6 px                         38    flag 0.00% invented
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const ensure = extractFunction('ensurePost', src);

// ---- executed: WHY bilinear can never return a pure flag here ----
// A full-res pixel centre is at (x+0.5)/W. The half-res texture has W/2 texels, so that uv lands at
// (x+0.5)/2 in texel space, whose texel centres sit at i+0.5. Every pixel is therefore exactly a quarter
// of a texel off a centre, giving bilinear weights of 0.75 and 0.25 — for every pixel, at every position.
{
  const W = 640, HW = W / 2;
  const seen = new Set();
  for (let x = 0; x < W; x++) {
    const t = ((x + 0.5) / W) * HW;          // position in half-res texel space
    const w = Math.abs(t - (Math.floor(t) + 0.5));   // distance from the nearest texel centre
    seen.add(+w.toFixed(6));
  }
  eq(seen.size, 1, 'every full-res pixel sits the SAME distance off a half-res texel centre');
  near([...seen][0], 0.25, 1e-9, '...and that distance is a quarter of a texel');
  // so the sampled flag at a boundary between a written and an unwritten texel is:
  near(0.75 * 1 + 0.25 * 0, 0.75, 1e-9, 'bilinear invents 0.75 on one side of a silhouette');
  near(0.25 * 1 + 0.75 * 0, 0.25, 1e-9, '...and 0.25 on the other');
  assert(0.75 > 0.5 && !(0.25 > 0.5),
    'which the hard `vv.a > 0.5` test then resolves in OPPOSITE directions on adjacent pixels — the ' +
    'whole defect, in one comparison, quantised to 2 screen pixels');
}

// ---- the fix: the velocity buffer is sampled at texel centres ----
assert(/_velRT\s*=\s*new THREE\.WebGLRenderTarget\([\s\S]{0,200}?minFilter:THREE\.NearestFilter[\s\S]{0,60}?magFilter:THREE\.NearestFilter/.test(ensure),
  '_velRT is NEAREST on both filters — a data field is not an image');
assert(/_velRT\s*=\s*new THREE\.WebGLRenderTarget\([\s\S]{0,200}?type:_postRTType\(\)/.test(ensure),
  '...while keeping the same pixel type it always had, so nothing else about the buffer moved');
assert(!/_velRT\s*=\s*mkRT\(/.test(ensure),
  'and it no longer goes through mkRT, whose LinearFilter default is exactly what caused this');

// ---- everything that IS an image must still be linear ----
assert(/const mkRT = \(rw,rh,type\)=> new THREE\.WebGLRenderTarget\(rw, rh, \{ minFilter:THREE\.LinearFilter, magFilter:THREE\.LinearFilter/.test(ensure),
  'mkRT still builds linear-filtered targets');
for (const rt of ['_postRT', '_compRT', '_afterA', '_afterB', '_ssrRT', '_raysRT', '_aoGeoRT'])
  assert(new RegExp(rt + '=mkRT\\(').test(ensure.replace(/\s/g, '')) || new RegExp(rt + '\\s*=\\s*mkRT\\(').test(ensure),
    rt + ' is a colour/geometry image and keeps bilinear — this change is scoped to the one data buffer');

// ---- the only consumer, so nothing else can be surprised by the sampler change ----
{
  const uses = (src.match(/_velRT\.texture/g) || []).length;
  eq(uses, 1, '_velRT.texture is bound in exactly one place (the blur pass), so NEAREST reaches nothing else');
  assert(/mu\.tVel\.value = _velWant \? _velRT\.texture : _compRT\.texture/.test(src),
    '...and the bound-fallback rule still binds a real texture when the pass is shed (build 1242)');
}

// ---- the branch itself is unchanged, and that is deliberate ----
{
  const after = src.match(/_matAfter=new THREE\.ShaderMaterial\(\{[\s\S]{0,2600}?\}\);/)[0];
  assert(/if\(uVelOn > 0\.5 && vv\.a > 0\.5\)\{/.test(after),
    'the written-flag test is untouched: with NEAREST it reads a true 0 or 1, so a threshold is now the ' +
    'right shape for it. mix()-ing the two directions was measured and is 4x worse than this');
  assert(/vec4 vv = texture2D\(tVel, vUv\);/.test(after), 'and the sample itself is a plain full-res read');
  assert(/build 1344/.test(after),
    'the shader says why its sampler matters, because a filter mode is invisible from the code that ' +
    'depends on it — which is how this survived from build 1246');
}

// ---- the correction to build 1246, recorded where it happened ----
assert(/belonging to NEITHER|belongs to neither|NEITHER/i.test(ensure),
  'build 1246 recorded the bilinear mixing and accepted it as SOFTENING; what it never measured is that ' +
  'the same blend makes the direction field DISCONTINUOUS, which hardens edges instead');

done('build 1344: the velocity buffer is sampled as data, not as a picture');
