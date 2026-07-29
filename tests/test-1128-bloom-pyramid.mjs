// build 1128: bloom is a mip pyramid, not a box gather.
//
// What it was: one 5x5 box at half resolution with a 1.5-texel step — a radius of about six
// full-resolution pixels. That is a rim, not a glow; a bright window in a real engine spills a
// quarter of the screen. And the gather was not even a filter: it weighted each tap by that tap's
// own excess brightness and then divided by the tap COUNT rather than the weight sum
//
//     for 25 taps: s += c * max(0, L(c) - thresh);  w += 1.0;   gl_FragColor = s/w
//
// so the output was a brightness-SQUARED term scaled by 1/25. Energy was neither conserved nor
// monotonic in radius, which is why the bloom slider never behaved like a strength control.
//
// What it is now, and what UE and Unity both do: threshold once with a soft knee, progressively
// downsample to a five-level pyramid with the 13-tap filter, then progressively tent-upsample back,
// adding each level into the one above. Every level contributes a different scale of glow. The whole
// chain costs about 1.33x the base mip in pixels, because each level is a quarter of the one above.
//
// The total is normalised by the level count so postBloom keeps its authored meaning — five levels
// each carry roughly the same energy, so without that every level ever saved would come back washed
// out. Measured on the arena, same seed: frame mean 140.67 -> 144.16, i.e. the exposure is preserved
// and the change is in the SHAPE of the glow.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const ep = extractFunction('ensurePost');

// ---------------------------------------------------------------- the pyramid
assert(/const _BLOOM_MIPS = 5;/.test(src), 'five levels');
assert(/let _bloomMips=\[\], _matBloomDown=null, _matBloomUp=null;/.test(src), 'the pyramid is an array of targets');
assert(/_bloomMips=\[\]; for\(let i=0, mw=hw, mh=hh; i<_BLOOM_MIPS; i\+\+\)\{ _bloomMips\.push\(mkRT\(mw,mh\)\); mw=Math\.max\(1,mw>>1\); mh=Math\.max\(1,mh>>1\); \}/.test(ep),
  'it starts at half resolution and halves each level, never reaching zero');
assert(!/_bloomRT/.test(src), 'the single half-res bloom buffer is gone');
{
  // the whole pyramid costs ~1/3 more than its base level
  let px = 0; for (let i = 0, w = 640, h = 360; i < 5; i++) { px += w * h; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
  const base = 640 * 360;
  assert(px / base < 1.4, 'the five levels together are ' + (px / base).toFixed(2) + 'x the base level, not 5x');
}
assert(/_bloomMips=\[\];/.test(extractFunction('disposePost')), 'a resize disposes them');

// ---------------------------------------------------------------- threshold: once, with a knee
{
  const down = ep.slice(ep.indexOf('_matBloomDown=new THREE.ShaderMaterial'), ep.indexOf('_matBloomUp=new THREE.ShaderMaterial'));
  assert(/if\(uFirst < 0\.5\) return c;/.test(down), 'the threshold is applied on the FIRST downsample only');
  assert(/du\.uFirst\.value = \(i===0\) \? 1 : 0;/.test(extractFunction('_renderPostFX')),
    '...and the frame loop says which pass that is');
  // a hard cut makes bloom pop in and out as a surface crosses the threshold — visible as flicker
  assert(/float soft = clamp\(l - uThresh \+ knee, 0\.0, 2\.0\*knee\);/.test(down) && /soft = soft\*soft\/\(4\.0\*knee \+ 1e-4\);/.test(down),
    'the knee is the standard quadratic ramp, so nothing pops');
  assert(/return c \* \(max\(soft, l - uThresh\) \/ max\(l, 1e-4\)\);/.test(down),
    'and it scales the colour by a RATIO — the old code multiplied by absolute excess brightness, which squared it');
  assert(!/s\+=c\*b; w\+=1\.0;/.test(src), 'the old divide-by-tap-count gather is gone');
  // executable: the knee is continuous and monotonic across the threshold
  const pre = (l, thresh) => { const knee = Math.max(1e-4, thresh * 0.5);
    let soft = Math.min(Math.max(l - thresh + knee, 0), 2 * knee); soft = soft * soft / (4 * knee + 1e-4);
    return Math.max(soft, l - thresh) / Math.max(l, 1e-4); };
  const T = 0.62;
  eq(pre(0.2, T), 0, 'well below the threshold contributes nothing');
  assert(pre(T, T) > 0, 'exactly at the threshold it is already ramping, not zero');
  let prev = -1;
  for (let l = 0; l <= 1.5; l += 0.02) { const v = pre(l, T); assert(v >= prev - 1e-9, 'monotonic in brightness at l=' + l.toFixed(2)); prev = v; }
  assert(pre(0.7, T) < pre(1.2, T), 'brighter surfaces bloom more');
  // and the ramp is smooth through the threshold, which is the whole point of a knee
  const a = pre(T - 0.05, T), b = pre(T + 0.05, T);
  assert(b - a < 0.2, 'no step at the threshold (' + a.toFixed(3) + ' -> ' + b.toFixed(3) + ')');
}

// ---------------------------------------------------------------- the filters conserve energy
{
  const down = ep.slice(ep.indexOf('_matBloomDown=new THREE.ShaderMaterial'), ep.indexOf('_matBloomUp=new THREE.ShaderMaterial'));
  assert(/vec3 o = e\*0\.125 \+ \(a\+c\+g\+i\)\*0\.03125 \+ \(b\+d\+f\+h\)\*0\.0625 \+ \(j\+k\+l\+m\)\*0\.125;/.test(down),
    'the 13-tap downsample (a plain 2x2 box aliases, and small bright details strobe as the camera moves)');
  const w = 1 * 0.125 + 4 * 0.03125 + 4 * 0.0625 + 4 * 0.125;
  near(w, 1, 1e-9, 'its 13 weights sum to exactly 1 — energy in equals energy out (got ' + w + ')');
}
{
  const up = ep.slice(ep.indexOf('_matBloomUp=new THREE.ShaderMaterial'), ep.indexOf('_matComp=new THREE.ShaderMaterial'));
  assert(/blending:THREE\.AdditiveBlending/.test(up), 'the upsample ADDS into the level above');
  const taps = [...up.matchAll(/\.rgb \* ([\d.]+)/g)].map(m => +m[1]);
  eq(taps.length, 9, 'nine taps');
  eq(taps.filter(v => v === 4).length, 1, 'a 4 at the centre');
  eq(taps.filter(v => v === 2).length, 4, 'four 2s on the edges');
  eq(taps.filter(v => v === 1).length, 4, 'four 1s on the corners');
  eq(taps.reduce((s, v) => s + v, 0), 16, 'a 3x3 tent, summing to 16');
  assert(/gl_FragColor = vec4\(s\/16\.0, 1\.0\);/.test(up), '...divided by 16, so it too conserves energy');
}

// ---------------------------------------------------------------- the chain
{
  const rp = extractFunction('_renderPostFX');
  assert(/let src=_postRT\.texture, sw=w, sh=h;/.test(rp), 'the pyramid is fed from the scene target (which is where DoF deposits its result)');
  assert(/for\(let i=0;i<_bloomMips\.length;i\+\+\)\{/.test(rp), 'downsample walks up the pyramid');
  assert(/for\(let i=_bloomMips\.length-1;i>0;i--\)\{/.test(rp), '...and the upsample walks back down');
  assert(/const ac=renderer\.autoClear; renderer\.autoClear=false;/.test(rp),
    'the upsample must NOT clear the level it is adding into');
  assert(/renderer\.autoClear=ac;/.test(rp), '...and restores it, or the next frame renders onto the last one');
  {
    // order matters: every downsample must finish before the first upsample reads a coarse level
    const dn = rp.indexOf('renderer.setRenderTarget(_bloomMips[i]); renderer.render');
    const upl = rp.indexOf('for(let i=_bloomMips.length-1;i>0;i--)');
    assert(dn > 0 && upl > dn, 'the full downsample chain runs before any upsample');
  }
  assert(/cu\.tBloom\.value=_bloomMips\[0\]\.texture;/.test(rp), 'the composite reads the top of the pyramid, which now holds every scale');
}
// ---------------------------------------------------------------- the knob keeps its meaning
assert(/uBloomNorm:\{value:1\/_BLOOM_MIPS\}/.test(ep), 'the add is normalised by the pyramid depth');
assert(/c \+= texture2D\(tBloom,vUv\)\.rgb \* uBloom \* uBloomNorm;/.test(ep),
  '...so a level saved before this build comes back at the strength its author chose, with a wider glow');
assert(/postBloom:0\.65,/.test(src), 'and the shipped default is unchanged, because it did not need to change');

done('build 1128: bloom is a five-level mip pyramid — a glow, not a rim, at the strength the level authored');
