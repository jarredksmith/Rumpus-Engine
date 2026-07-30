// build 1182: the exposure meter stops stalling the pipeline.
//
// Reported from play the day 1180 shipped: any auto-exposure strength above 0 produced visible stutter on
// ALL visuals with no fps drop. That signature is a pipeline stall, not a load: readRenderTargetPixels is
// synchronous, so every 5th frame the CPU drained the ENTIRE queued GPU frame before copying 1KB — a 12Hz
// judder the frame counter cannot see, because the time is spent waiting, not working. The meter now reads
// into a PIXEL_PACK_BUFFER (returns immediately), marks completion with a fence, and polls clientWaitSync
// with timeout 0 — never blocking, harvesting the pixels a few frames late, which a ~1s eased eye cannot
// show. WebGL1 has no PBO/fence: auto-exposure is quietly inert there rather than stuttering.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const CLMP = +src.match(/AE_CLAMP=([\d.]+)/)[1];

// ---------------------------------------------------------------- the harness: real _aeMeter, stub GL
const mkGL = () => {
  const gl = {
    PIXEL_PACK_BUFFER: 1, STREAM_READ: 2, RGBA: 3, UNSIGNED_BYTE: 4, SYNC_GPU_COMMANDS_COMPLETE: 5,
    ALREADY_SIGNALED: 10, CONDITION_SATISFIED: 11, TIMEOUT_EXPIRED: 12, WAIT_FAILED: 13,
    signaled: false, fill: 128, nextWait: null,
    calls: { readPixels: [], reads: 0, waits: [], binds: [], fenceMade: 0, fenceDeleted: 0 },
    createBuffer: () => ({ pbo: true }),
    bindBuffer: (t, b) => gl.calls.binds.push(b),
    bufferData: () => {},
    readPixels: (...a) => gl.calls.readPixels.push(a),
    fenceSync: () => { gl.calls.fenceMade++; return { fence: true }; },
    deleteSync: () => gl.calls.fenceDeleted++,
    clientWaitSync: (f, flags, timeout) => { gl.calls.waits.push(timeout);
      if (gl.nextWait != null) { const w = gl.nextWait; gl.nextWait = null; return w; }
      return gl.signaled ? gl.ALREADY_SIGNALED : gl.TIMEOUT_EXPIRED; },
    getBufferSubData: (t, o, buf) => { gl.calls.reads++; buf.fill(gl.fill); },
  };
  return gl;
};
const build = (gl, webgl2, cfg) => {
  const renderer = { capabilities: { isWebGL2: webgl2 }, getContext: () => gl,
    setRenderTarget() {}, render() {}, toneMappingExposure: 1.25,
    readRenderTargetPixels() { throw new Error('SYNC READ — the stall is back'); } };
  let t = 0; const perf = { now: () => (t += 16.6) };
  const KEY = +src.match(/AE_KEY=([\d.]+)/)[1], DEAD = +src.match(/AE_DEAD=([\d.]+)/)[1], TAU = +src.match(/AE_TAU=([\d.]+)/)[1];
  return new Function('worldCfg', 'renderer', 'THREE', '_matCopy', '_postRT', '_postQuad', '_postScene', '_postCam', 'performance', 'AE_KEY', 'AE_DEAD', 'AE_CLAMP', 'AE_TAU',
    'let _aeRT=null,_aeFrame=0,_aeTargetMul=1,_expAuto=1,_expBase=1.25,_aeLastT=0,_aePBO=null,_aeFence=null;\n' +
    'const _aeBuf=new Uint8Array(16*16*4);\n' +
    extractFunction('_aeMeter') +
    '\nreturn { step:_aeMeter, get:()=>({ target:_aeTargetMul, auto:_expAuto, fence:_aeFence, exposure:renderer.toneMappingExposure }) };'
  )(cfg, renderer, { WebGLRenderTarget: function () {}, LinearFilter: 0 },
    { uniforms: { tColor: { value: null } } }, { texture: {} }, { material: 'pm' }, {}, {}, perf, KEY, DEAD, CLMP, TAU);
};

// ---------------------------------------------------------------- the full async loop, executed
{
  const gl = mkGL(); const m = build(gl, true, { autoExp: 1 });
  for (let i = 0; i < 4; i++) m.step();
  eq(gl.calls.readPixels.length, 0, 'frames 1-4: nothing issued (the 5-frame cadence survives)');
  m.step();   // frame 5: issue
  eq(gl.calls.readPixels.length, 1, 'frame 5 issues the readback');
  eq(gl.calls.readPixels[0][6], 0, '...readPixels\' last arg is a PBO OFFSET, not a client array — this is the non-blocking form');
  eq(gl.calls.binds[gl.calls.binds.length - 1], null, '...and PIXEL_PACK_BUFFER is unbound after, so three\'s own readbacks (cine preview, thumbnails) are untouched');
  eq(gl.calls.fenceMade, 1, '...and a fence marks completion');
  for (let i = 0; i < 6; i++) m.step();   // pending: covers the next 5th frame too
  eq(gl.calls.reads, 0, 'while the GPU has not signalled, the buffer is never mapped — mapping early IS the stall');
  eq(gl.calls.readPixels.length, 1, '...and no second read is issued while one is in flight');
  assert(gl.calls.waits.length >= 6 && gl.calls.waits.every((t) => t === 0), 'every poll uses timeout 0 — clientWaitSync can block exactly like readPixels if you let it');
  gl.signaled = true; gl.fill = 13;       // a dark frame arrives (13/255 ≈ 0.05 luminance)
  m.step();
  eq(gl.calls.reads, 1, 'the signal harvests the pixels');
  eq(gl.calls.fenceDeleted, 1, '...and the consumed fence is deleted, so the next 5th frame can issue again');
  near(m.get().target, Math.pow(2, CLMP), 1e-9, '...and a dark frame asks for the full +' + CLMP + ' stops, same maths as 1180');
  const a1 = m.get().auto; for (let i = 0; i < 30; i++) m.step();
  assert(m.get().auto > a1, 'the eased multiplier climbs toward it; the late arrival costs nothing a ~1s ease can show');
  assert(gl.calls.readPixels.length > 1, '...and metering continues cycle after cycle');
}
{ // WAIT_FAILED: recover, re-issue, never map
  const gl = mkGL(); const m = build(gl, true, { autoExp: 1 });
  for (let i = 0; i < 5; i++) m.step();
  gl.nextWait = gl.WAIT_FAILED; m.step();
  eq(gl.calls.reads, 0, 'a failed wait maps nothing');
  eq(gl.calls.fenceDeleted, 1, '...drops the fence');
  for (let i = 0; i < 5; i++) m.step();
  assert(gl.calls.readPixels.length >= 2, '...and the meter re-issues rather than wedging forever');
}
{ // WebGL1: inert, never stuttering
  const gl = mkGL(); const m = build(gl, false, { autoExp: 1 });
  for (let i = 0; i < 20; i++) m.step();
  eq(gl.calls.readPixels.length, 0, 'WebGL1 has no PBO/fence — auto-exposure goes quietly INERT instead of reintroducing the sync stall');
  eq(m.get().exposure, 1.25, '...and the exposure stays the authored base');
}
{ // strength 0 mid-flight: snap back, clean up the fence
  const cfg = { autoExp: 1 }; const gl = mkGL(); const m = build(gl, true, cfg);
  for (let i = 0; i < 5; i++) m.step();
  assert(m.get().fence, 'a read is in flight');
  cfg.autoExp = 0; m.step();
  eq(m.get().auto, 1, 'strength 0 snaps the multiplier home');
  eq(m.get().exposure, 1.25, '...and the renderer gets the plain authored exposure');
  eq(gl.calls.fenceDeleted, 1, '...and the in-flight fence is deleted, not leaked');
}

// ---------------------------------------------------------------- the wiring
{
  assert(!/readRenderTargetPixels\(_aeRT/.test(src), 'the synchronous read of the meter target is GONE from the engine');
  assert(/_aeMeter\(\);/.test(src), '_renderPostFX calls the meter where the inline block used to be');
  const fn = extractFunction('_aeMeter');
  assert(/renderer\.capabilities\.isWebGL2/.test(fn), 'the whole meter is gated on WebGL2');
  assert(/_gl\.readPixels\(0,0,16,16,_gl\.RGBA,_gl\.UNSIGNED_BYTE,0\);/.test(fn), 'readPixels targets the bound PBO by offset');
  assert(/_aeFence=_gl\.fenceSync\(_gl\.SYNC_GPU_COMMANDS_COMPLETE,0\);/.test(fn), 'a fence is issued behind it');
  assert(/_gl\.clientWaitSync\(_aeFence,0,0\)/.test(fn), 'the harvest polls with timeout 0');
  assert(/if\(!_aeFence && \(\+\+_aeFrame % 5\)===0\)/.test(fn), 'one read in flight at a time, on the 5-frame cadence');
  assert(/catch\(e\)\{ _aeFence=null; _aePBO=null; _aeTargetMul=1; \}/.test(fn), 'a lost context resets the GL objects instead of throwing mid-frame');
}

done('build 1182: auto-exposure metering is asynchronous — readPixels into a pixel-pack buffer, fence-signalled, polled with timeout 0, one read in flight, harvested frames late (invisible behind the ~1s ease), WAIT_FAILED recovery, WebGL1 quietly inert, strength-0 cleanup — the 12Hz pipeline stall reported from play is structurally gone');
