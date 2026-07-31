// build 1198: auto-exposure stops flashing — the dead-zone was a discontinuity.
//
// Reported from play: with an HDRI sky, auto-exposure "flashes like crazy". Not a fighting writer (the
// meter is the only toneMappingExposure writer) and not broken feedback (r149 backgrounds tone-map —
// verified against the real build below). The oscillator was the METER's own dead-zone: inside it the
// target snapped to neutral; one step outside it re-applied the FULL measured correction (up to ±1.5
// stops). A bright HDRI parks the frame average exactly at that boundary — the ACES shoulder makes a
// near-white sky insensitive to exposure, so the loop hunts across it — turning the snap into a square
// wave through the 0.9s ease: rhythmic flashing. The dead-zone is now a SOFT KNEE (|ev| shrinks by
// AE_DEAD, response 0 AT the boundary, growing continuously past it), and a median-of-3 harvest buffer
// rejects one-frame outliers (PMREM rebuilds, upload blips) outright.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

const KEY = +src.match(/AE_KEY=([\d.]+)/)[1];
const CLMP = +src.match(/AE_CLAMP=([\d.]+)/)[1];
const DEAD = +src.match(/AE_DEAD=([\d.]+)/)[1];

// ---------------------------------------------------------------- the feedback premise, real build
{
  assert(/tonemapping_fragment/.test(THREE.ShaderLib.backgroundCube.fragmentShader) &&
    /tonemapping_fragment/.test(THREE.ShaderLib.background.fragmentShader),
    'HDRI backgrounds DO tone-map in this three build — the feedback loop was never broken; the meter itself was the oscillator');
}

// ---------------------------------------------------------------- the soft knee, replayed
{
  const target = (avg, s) => {
    let ev = Math.log2(KEY / Math.max(0.001, avg));
    const mag = Math.abs(ev) - DEAD; ev = mag > 0 ? Math.sign(ev) * mag : 0;
    ev = Math.max(-CLMP, Math.min(CLMP, ev)) * s;
    return Math.pow(2, ev);
  };
  eq(target(KEY, 1), 1, 'a frame at the key is untouched');
  eq(target(KEY * 1.05, 1), 1, '...and small drift inside the dead-zone still moves nothing (the dead-zone survives as a deadBAND)');
  { // THE FIX: continuity across the boundary — the old snap jumped a full stop here
    const inside = target(KEY * Math.pow(2, DEAD * 0.999), 1);
    const outside = target(KEY * Math.pow(2, DEAD * 1.001), 1);
    near(inside, 1, 1e-6, 'a hair inside the band: neutral');
    assert(Math.abs(outside - 1) < 0.001,
      'a hair OUTSIDE the band: still ~neutral (' + outside.toFixed(4) + ') — the response is CONTINUOUS at the boundary, so a frame average hunting across it cannot square-wave the target');
    // and the old behaviour, for contrast: snapping would have applied the full measured ev here
    const oldSnap = Math.pow(2, -(DEAD * 1.001));
    assert(Math.abs(oldSnap - 1) > 0.09, '(the pre-1198 snap jumped ' + ((1 - oldSnap) * 100).toFixed(1) + '% at this same boundary — the flash)');
  }
  { // far from the boundary the correction still arrives, merely softened by the band width
    const t = target(0.05, 1);
    near(t, Math.pow(2, CLMP), 1e-9, 'a very dark frame still asks for the full clamp (the knee subtraction saturates against it)');
    assert(target(0.15, 1) > 1.9, 'a moderately dark frame still gets a strong lift'); }
}

// ---------------------------------------------------------------- the median, executed through _aeMeter
{
  const mkGL = () => { const gl = { PIXEL_PACK_BUFFER: 1, STREAM_READ: 2, RGBA: 3, UNSIGNED_BYTE: 4, SYNC_GPU_COMMANDS_COMPLETE: 5,
    ALREADY_SIGNALED: 10, CONDITION_SATISFIED: 11, TIMEOUT_EXPIRED: 12, WAIT_FAILED: 13, signaled: true, fill: 128,
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, readPixels() {}, fenceSync: () => ({ f: 1 }), deleteSync() {},
    clientWaitSync: () => 10, harvests: 0, getBufferSubData: (t, o, buf) => { gl.harvests++; buf.fill(gl.fill); } }; return gl; };
  const gl = mkGL();
  const renderer = { capabilities: { isWebGL2: true }, getContext: () => gl, setRenderTarget() {}, render() {}, toneMappingExposure: 1.25 };
  let t = 0; const perf = { now: () => (t += 16.6) };
  const api = new Function('worldCfg', 'renderer', 'THREE', '_matCopy', '_postRT', '_postQuad', '_postScene', '_postCam', 'performance', 'AE_KEY', 'AE_DEAD', 'AE_CLAMP', 'AE_TAU',
    'let _aeRT=null,_aeFrame=0,_aeTargetMul=1,_expAuto=1,_expBase=1.25,_aeLastT=0,_aePBO=null,_aeFence=null;\n' +
    'const _aeAvg3=[];\nconst _aeBuf=new Uint8Array(16*16*4);\n' +
    extractFunction('_aeMeter') + '\nreturn { step:_aeMeter, get:()=>_aeTargetMul };'
  )({ autoExp: 1 }, renderer, { WebGLRenderTarget: function () {}, LinearFilter: 0 },
    { uniforms: { tColor: { value: null } } }, { texture: {} }, { material: 'pm' }, {}, {}, perf, KEY, DEAD, CLMP, 0.9);
  const untilHarvest = (n) => { const want = gl.harvests + n; let guard = 0; while (gl.harvests < want && guard++ < 200) api.step(); };
  gl.fill = 110; untilHarvest(6);                                    // settle the median buffer on a steady scene
  const settled = api.get();
  gl.fill = 4; untilHarvest(1);                                      // ONE anomalous near-black harvest (a PMREM rebuild frame)
  near(api.get(), settled, 1e-9, 'a single dark outlier harvest moves the target NOT AT ALL — the median of three throws it away');
  gl.fill = 4; untilHarvest(2);
  assert(api.get() > settled * 1.5, '...but a SUSTAINED dark scene (two+ harvests) still adapts — the median rejects transients, not reality');
}

// ---------------------------------------------------------------- the wiring
{
  const fn = extractFunction('_aeMeter');
  assert(/_aeAvg3\.push\(_avg0\); if\(_aeAvg3\.length>3\) _aeAvg3\.shift\(\);/.test(fn) &&
    /const _avg = _aeAvg3\.length===3 \? \[\.\.\._aeAvg3\]\.sort\(\(a,b\)=>a-b\)\[1\] : _avg0;/.test(fn),
    'the median buffer holds the last three harvests');
  assert(/const _mag=Math\.abs\(_ev\)-AE_DEAD; _ev = _mag>0 \? Math\.sign\(_ev\)\*_mag : 0;/.test(fn),
    'the soft knee replaces the snap');
  assert(!/if\(Math\.abs\(_ev\)<AE_DEAD\) _ev=0;/.test(fn), 'the discontinuity is GONE');
  assert(/_aeAvg3\.length=0; renderer\.toneMappingExposure=_expBase;/.test(src),
    'disabling the meter clears the buffer — stale harvests must not shape the first correction after re-enable');
}

done('build 1198: the auto-exposure flash is structurally dead — the dead-zone is a continuous soft knee (boundary response proven ~0 where the old snap jumped a tenth), a median-of-3 buffer rejects single-frame outliers outright while sustained change still adapts (driven through the real _aeMeter), and the HDRI-backgrounds-tone-map premise is pinned against the real three build');
