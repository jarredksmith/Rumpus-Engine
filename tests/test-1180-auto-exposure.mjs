// build 1180: auto-exposure — the camera's eye finally adapts.
//
// The rendering critic, verified: toneMappingExposure was a static authored value; walk from desert noon
// into a dark interior and nothing changed (UE/Unity/Godot all ship eye adaptation by default). The meter
// reads a 16x16 blit of _postRT (post-ACES, so the feedback loop converges), log-averages luminance at
// ~12Hz, and eases a MULTIPLIER around the AUTHORED exposure. Authorship survives three ways: ±1.5-stop
// clamp around the creator's value, a dead-zone against breathing, and a 0..1 strength slider where 0 is
// exactly the old static behaviour.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const KEY  = +src.match(/AE_KEY=([\d.]+)/)[1];
const CLMP = +src.match(/AE_CLAMP=([\d.]+)/)[1];
const DEAD = +src.match(/AE_DEAD=([\d.]+)/)[1];
const TAU  = +src.match(/AE_TAU=([\d.]+)/)[1];

// ---------------------------------------------------------------- the loop, replayed
{
  // replica of the metering maths + smoothing, driven with synthetic frame luminances
  const meter = (avg, strength) => {
    let ev = Math.log2(KEY / Math.max(0.001, avg));
    if (Math.abs(ev) < DEAD) ev = 0;
    ev = Math.max(-CLMP, Math.min(CLMP, ev)) * strength;
    return Math.pow(2, ev);
  };
  { // a dark interior brightens, clamped
    const t = meter(0.05, 1);
    near(t, Math.pow(2, CLMP), 1e-9, 'a very dark frame asks for the full +' + CLMP + ' stops — and no more');
    assert(meter(0.15, 1) > 1 && meter(0.15, 1) < Math.pow(2, CLMP), 'a moderately dark frame asks for a partial lift');
  }
  { // an overexposed frame darkens, clamped
    near(meter(0.98, 1), Math.pow(2, -Math.log2(0.98 / KEY)), 0.2, 'a blown-out frame is pulled down');
    assert(meter(3, 1) >= Math.pow(2, -CLMP) - 1e-9, '...never past -' + CLMP + ' stops');
  }
  { // the dead-zone: a balanced frame does not breathe
    eq(meter(KEY, 1), 1, 'a frame already at the key is left EXACTLY alone');
    eq(meter(KEY * 1.05, 1), 1, '...and small drift inside the dead-zone moves nothing');
  }
  { // strength scales the whole effect; 0 = the old engine
    eq(meter(0.05, 0), 1, 'strength 0 is a fixed exposure — byte-identical to pre-1180');
    const half = meter(0.05, 0.5), full = meter(0.05, 1);
    near(Math.log2(half), Math.log2(full) / 2, 1e-9, 'strength is in STOPS — 0.5 gives half the EV correction');
  }
  { // the smoothing: a step change eases with tau, never snaps
    let e = 1; const target = 2; const dt = 1 / 60;
    let frames = 0;
    while (e < target * 0.95 && frames++ < 600) e += (target - e) * (1 - Math.exp(-dt / TAU));
    const secs = frames / 60;
    assert(secs > 1.2 && secs < 4.5, 'a 1-stop adaptation takes ~' + secs.toFixed(1) + 's — an eye, not a light switch');
  }
}

// ---------------------------------------------------------------- the wiring
{
  assert(/_expBase = worldCfg\.exposure \* \(\(\(worldCfg\.colorV\|0\) >= 2\) \? 1 : LEGACY_EXPOSURE\);/.test(src),
    'the AUTHORED exposure (with the legacy factor) is remembered as the base');
  assert(/renderer\.toneMappingExposure = _expBase \* _expAuto;/.test(src),
    '...and what the renderer gets is base × the adaptive multiplier — authorship is multiplied around, never replaced');
  assert(/renderer\.toneMappingExposure=_expBase\*_expAuto;/.test(src), 'the frame loop applies the eased value');
  assert(/\} else if\(_expAuto!==1 \|\| _aeFence\)\{ _expAuto=1; _aeTargetMul=1; renderer\.toneMappingExposure=_expBase;/.test(src),
    'turning the slider to 0 snaps cleanly back to the static authored exposure (and since 1182, cleans up any in-flight read)');
  assert(/if\(!_aeFence && \(\+\+_aeFrame % 5\)===0\)/.test(src),
    'metering runs every 5th frame (~12Hz) — and since 1182, only when no read is already in flight');
  assert(/_matCopy\.uniforms\.tColor\.value=_postRT\.texture/.test(src),
    'the meter blits through _matCopy, which also RESOLVES a multisampled _postRT before the read');
  assert(/_gl\.getBufferSubData\(_gl\.PIXEL_PACK_BUFFER,0,_aeBuf\)/.test(src) && /catch\(e\)\{ _aeFence=null; _aePBO=null; _aeTargetMul=1; \}/.test(src),
    'the read is asynchronous since 1182 (PBO + fence — its own test), and a failed readback still falls back to neutral instead of throwing mid-frame');
  assert(/autoExp:0\.7,/.test(src), 'DEFAULT_WORLD ships adaptation on at 0.7 — bounded by the clamp, disabled by one slider');
  assert(/slider\(b,'Auto exposure','autoExp',0,1,0\.05\);/.test(src), 'the slider lives beside Exposure in Camera & view');
}

done('build 1180: auto-exposure — 16x16 post-ACES metering at ~12Hz, log-average, ±' + CLMP + '-stop clamp around the AUTHORED exposure, dead-zone against breathing, ~1s ease, strength slider where 0 is exactly the old engine. Dark interiors finally read as your eyes opening.');
