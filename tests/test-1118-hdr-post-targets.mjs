// build 1118: the post chain carries LINEAR light, so it cannot be 8-bit.
//
// Since build 1115 the sRGB encode happens at the END of the chain, which means every intermediate
// target holds scene-linear values. Eight bits of LINEAR is nowhere near enough at the bottom: one
// code step is 1/255 of full brightness, so everything below linear 0.0039 collapses to zero, and
// the encode then stretches those surviving steps into visible bands. The fingerprint is exact —
// whole regions drawn only from {OETF(n/255) : n <= 12} = {0,13,22,28,34,38,42,46,50,53,56,59,61}.
//
// Measured on the captured frames, half-float against 8-bit, same seed and camera:
//   arena-spawn  fingerprint 3.07% -> 0.26% of frame, unique dark colours 4,434 -> 7,106
//   play-stock   fingerprint 1.67% -> 0.07% of frame, unique dark colours 1,680 -> 1,939
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- both linear chains are half float
assert(/function _postRTType\(\)/.test(src), 'there is one place that decides the render-target precision');
{
  const fn = extractFunction('_postRTType');
  assert(/THREE\.HalfFloatType/.test(fn), 'it prefers half float');
  assert(/isWebGL2/.test(fn), '...only on WebGL2, which is where EXT_color_buffer_half_float is guaranteed');
  assert(/catch\(e\)\{ _rtType = THREE\.UnsignedByteType; \}/.test(fn),
    '...and falls back to 8-bit rather than losing the frame if the allocation throws');
  assert(/_rtType !== null/.test(fn), '...deciding once, not per target');
  // the probe must actually bind the target: allocating a WebGLRenderTarget never throws on its own,
  // the failure only surfaces when the driver is asked to make it a framebuffer
  assert(/renderer\.setRenderTarget\(probe\)/.test(fn), '...and the probe binds the target, since allocation alone never fails');
}
// no linear-carrying target may be left at 8 bits
{
  const dof = src.slice(src.indexOf('function ensureDof()'), src.indexOf('function _runDofTo'));
  const post = src.slice(src.indexOf('function ensurePost()'), src.indexOf('function disposePost()'));
  for (const [name, seg] of [['the DoF colour target', dof], ['the post chain targets', post]]) {
    assert(/_postRTType\(\)/.test(seg), name + ' uses the shared precision decision');
    assert(!/type:THREE\.UnsignedByteType/.test(seg), name + ' is not hardcoded to 8-bit');
  }
}

// ---------------------------------------------------------------- the arithmetic that makes it necessary
{
  const enc = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  // an 8-bit LINEAR buffer can only represent n/255; after encoding, the first few codes are far apart
  const codes = Array.from({ length: 13 }, (_, n) => Math.round(enc(n / 255) * 255));
  eq(codes[0], 0, 'linear code 0 encodes to 0');
  eq(codes[1], 13, '...and linear code 1 jumps straight to 13/255 — there is nothing in between');
  assert(codes[2] - codes[1] >= 8, '...and the next step is another ' + (codes[2] - codes[1]) + ' codes wide');
  // half float has ~11 bits of mantissa near these magnitudes: the same range gets hundreds of steps
  const halfStep = Math.pow(2, -14) / 1024;   // smallest subnormal spacing, far below anything we need
  assert(halfStep < 1e-6, 'half float resolves linear values three orders of magnitude finer');
  // and the shadow range this protects is exactly where a lit scene spends its pixels
  assert(enc(0.0039) * 255 < 14, 'everything under linear 0.0039 used to land in that first empty gap');
}

// ---------------------------------------------------------------- MSAA still applies to the scene pass
// The scene pass is the only one that rasterises geometry, so it carries the multisample count. A
// half-float target must not silently drop that, or build 872's aliasing fix regresses.
assert(/_postRT\.samples = _desiredPostSamples\(\);/.test(src), 'the scene target still requests MSAA');

done('build 1118: the post chain is half float — linear light needs more than 8 bits at the bottom end');
