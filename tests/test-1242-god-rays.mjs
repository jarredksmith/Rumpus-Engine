// build 1242: god rays — screen-space light shafts, the rendering list's next item. A radial march of
// the bloom pyramid's own quarter-res bright field toward the sun's screen position. THREE capture
// rounds shaped it (each measured, two fixes forced): (1) the shed-gate held on SwiftShader's bottom
// rung — the null result was the GATE working, not the shader failing; (2) decay 0.94 over an
// unrestricted bright field measured as a +45% GLOBAL VEIL on far corners, because an open daytime sky
// clears the bloom threshold almost everywhere — so each tap is now weighted by a sun-centred disc
// (aspect-corrected) and decay tightened to 0.90; (3) final: sun-side band +9.6%, opposite band +0.8%
// — directional shafts, not a wash. Linear in and out; the composite adds them before the one encode.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the shader's load-bearing pieces
{
  const rays = src.slice(src.indexOf('build 1242: GOD RAYS'), src.indexOf('_matComp=new THREE.ShaderMaterial'));
  assert(/float sw = 1\.0 - smoothstep\(0\.0, 0\.40, length\(\(uv - uSunPos\) \* vec2\(uAspect, 1\.0\)\) \/ 1\.78\);/.test(rays),
    'each tap is weighted by a sun-centred, aspect-corrected disc — the whole bright sky marching from every direction measured as a +45% global veil');
  assert(/acc \+= texture2D\(tSrc, uv\)\.rgb \* w \* sw \* sw; wsum \+= w;/.test(rays), '...applied squared, normalised by the UNWEIGHTED sum so off-sun pixels darken to zero rather than renormalising the veil back in');
  assert(/w \*= 0\.90;/.test(rays), 'decay 0.90 — 24 taps end at ~8%, shafts hug the light');
  assert(!/uEncode/.test(rays), 'the rays pass never encodes — linear in, linear out (1115)');
}
{ // the composite adds them in LINEAR, tinted by the sun, before the encode
  const comp = src.slice(src.indexOf("'  c += texture2D(tBloom,vUv).rgb * uBloom * uBloomNorm;'"), src.indexOf("'  c=_out(clamp(c,0.0,1.0));'"));
  assert(/texture2D\(tRays,vUv\)\.rgb \* uRaysTint \* uRays \* 1\.2/.test(comp),
    'shafts add like light (before _out), tinted by the authored sun colour');
}

// ---------------------------------------------------------------- the frame gates
{
  const fx = src.slice(src.indexOf('// 2b) build 1242: god rays'), src.indexOf('// 3) composite'));
  assert(/!\( _adaptOn && _prStepI >= _PR_STEPS\.length-1 \)/.test(fx),
    'the bottom adaptive rung sheds the pass (measured doing exactly that under SwiftShader)');
  assert(/if\(fd > 0\.05\)/.test(fx), 'a sun behind the camera casts nothing');
  assert(/const edge = 1 - Math\.max\(0, Math\.min\(1, \(off - 1\.0\) \/ 0\.6\)\);/.test(fx),
    'shafts fade as the sun leaves the frame instead of popping at the border');
  assert(/ru\.tSrc\.value = _bloomMips\[1\]\.texture;/.test(fx), 'the source is the pyramid\'s existing quarter-res bright field — no extra bright pass');
  assert(/ru\.uAspect\.value = w \/ Math\.max\(1, h\);/.test(fx), 'the disc stays round at any viewport');
  assert(/cu\.tRays\.value = \(_raysAmt > 0\.005\) \? _raysRT\.texture : _bloomMips\[1\]\.texture;/.test(src),
    'a bound-but-unread texture beats an unbound sampler when the pass is off');
}
{ // CPU-side maths of the fades, executed
  const edge = (off) => 1 - Math.max(0, Math.min(1, (off - 1.0) / 0.6));
  eq(edge(0.5), 1, 'sun well inside the frame: full strength');
  near(edge(1.3), 0.5, 1e-9, 'half strength half-way out');
  eq(edge(1.7), 0, 'gone past the fade band');
  const fdRamp = (fd) => Math.min(1, (fd - 0.05) / 0.25);
  near(fdRamp(0.30), 1, 1e-9, 'facing the sun: full');
  near(fdRamp(0.10), 0.2, 1e-9, 'glancing: eased in, no pop');
}

// ---------------------------------------------------------------- lifecycle + authoring
{
  assert(/postThresh:0\.62, postRays:0\.45, lut:''/.test(src), 'postRays ships in DEFAULT_WORLD at 0.45');
  assert(/_postRays   = Math\.max\(0,   Math\.min\(1,    worldCfg\.postRays/.test(src), 'clamped 0..1 by the world sanitizer');
  assert(/w\.ssao=0; w\.postRays=0; w\.ssr=0; return w; \}/.test(src), '_postOffWorld zeroes it — the 1140 lesson (a first-time scene starts clean, and "the mood never reached the engine" stays impossible)');
  assert(/slider\(b,'God rays','postRays',0,1,0\.05\);/.test(src), 'the World panel slider exists');
  assert(/_raysRT=mkRT\(Math\.max\(1,hw>>1\), Math\.max\(1,hh>>1\)\);/.test(src) && /_aoRT2,_raysRT,_ssrRT\]\.concat/.test(src) && /_aoRT2=_raysRT=_ssrRT=null;/.test(src),
    'the quarter-res target allocates with the post targets and disposes with them (880\'s rung-change hygiene)');
}

done('build 1242: god rays — sun-disc-weighted radial march of the existing bloom bright field, capture-shaped in three measured rounds (the shed-gate null, the +45% veil that forced the disc weighting, the final +9.6% sun-side vs +0.8% far-side directionality), linear through the one encode, faded on facing and frame-exit, shed on the bottom rung, and authored via postRays with the off-world zero');
