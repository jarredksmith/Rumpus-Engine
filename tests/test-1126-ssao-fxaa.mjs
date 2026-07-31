// build 1126: screen-space ambient occlusion, from a half-resolution G-buffer prepass.
//
// Before this the engine had NO ambient occlusion of any kind at runtime. Generated levels carried
// a baked lightmap, but a hand-authored level — which is what the editor makes, and what the
// default level is — had exactly two lights and no contact darkening anywhere, so every object
// read as composited onto the ground rather than standing on it.
//
// SSAO needs the scene's depth, and three r149 cannot attach a depth TEXTURE to a multisampled
// render target — which is where build 872's 4x MSAA lives, the only antialiasing this engine has.
// Reading the scene's own depth therefore means giving up MSAA, and that was MEASURED and rejected:
// on a pillar edge against the sky, MSAA produces a 1.02-pixel coverage gradient on 100 of 100
// scanlines, while FXAA in its place left a hard edge on 94 of 99. So AO gets its own half-resolution
// G-buffer prepass instead. It costs a second set of draw calls and buys back both MSAA and REAL
// normals, which are worth more to AO than any reconstruction from depth.
//
// FXAA survives in one place only: the DoF path, which rasterises into its own depth-carrying target
// and so could never be multisampled. That was a documented "known gap" where switching on depth of
// field silently switched off antialiasing. FXAA is a floor there, not a swap.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- depth is always available
{
  const ep = extractFunction('ensurePost');
  assert(/_aoGeoRT=mkRT\(hw,hh\); _aoRT=mkRT\(hw,hh,THREE\.UnsignedByteType\); _aoRT2=mkRT\(hw,hh,THREE\.UnsignedByteType\);/.test(ep),
    'a half-res G-buffer plus two 8-bit AO buffers — AO is one 0..1 term, not colour');
  assert(!/_postRT\.depthTexture = new THREE\.DepthTexture/.test(ep),
    'the scene target does NOT carry depth: that would cost the MSAA this engine measurably needs');
}
{
  const ds = extractFunction('_desiredPostSamples');
  assert(/return \(_prStepI===0 && \(typeof _hiFxOn==='undefined' \|\| _hiFxOn\)\) \? 4 : 0;/.test(ds),
    '4x MSAA is kept, on the same adaptive rung');
}
{
  // the G-buffer pass must reproduce three\'s skinning or an animated enemy writes its rest pose
  const ep = extractFunction('ensurePost');
  const geo = ep.slice(ep.indexOf('_matAOGeo=new THREE.ShaderMaterial'), ep.indexOf('_matAO=new THREE.ShaderMaterial'));
  for (const chunk of ['skinning_pars_vertex', 'skinbase_vertex', 'skinnormal_vertex', 'defaultnormal_vertex', 'skinning_vertex', 'project_vertex'])
    assert(geo.includes('#include <' + chunk + '>'), 'the prepass includes <' + chunk + '>');
  assert(/vAoN = normalize\(transformedNormal\); vAoZ = -mvPosition\.z;/.test(geo),
    'it writes the view normal and the view distance');
  assert(/gl_FragColor = vec4\(normalize\(vAoN\)\*0\.5\+0\.5, vAoZ\)/.test(geo), '...packed into rgb + a');
}
assert(/_aoGeoRT,_aoRT,_aoRT2/.test(extractFunction('disposePost')), 'a resize disposes the AO targets too');

// ---------------------------------------------------------------- the AO pass itself
{
  const ep = extractFunction('ensurePost');
  // "nothing was drawn here" must be GEOMETRIC. Relying on the cleared alpha being ~0 is what shaded
  // the entire sky dark grey in the first working build: the clear leaves it near zero but not zero.
  assert(/bool _empty\(vec4 g\)\{ return \(g\.r\+g\.g\+g\.b\) < 0\.3; \}/.test(ep),
    'emptiness is tested on the packed normal, whose channels sum to at least 0.63 for ANY unit normal and to ~0 when cleared');
  assert(/if\(_empty\(g\) \|\| z >= uFar\*0\.995\)\{ gl_FragColor = vec4\(1\.0\); return; \}/.test(ep),
    'the sky is never occluded');
  assert(/if\(_empty\(sg\)\) continue;/.test(ep), '...and a SAMPLE that lands on sky is not an occluder either');
  assert(/float range = smoothstep\(0\.0, 1\.0, uRadius \/ max\(1e-4, abs\(z - sz\)\)\)/.test(ep),
    'occluders far outside the radius are ranged out — without this a wall behind a crate shadows the whole crate');
  assert(/float a = fract\(sin\(dot\(vUv, vec2\(12\.9898,78\.233\)\)\)\*43758\.5453\)\*6\.2831853;/.test(ep),
    'the fixed kernel is rotated per pixel, which is what turns 12 samples into a smooth field');
  // the blur must be depth-weighted or AO bleeds off silhouettes into the sky
  assert(/float wi=_empty\(gi\)==_empty\(g0\) \? exp\(-abs\(zi-z0\)\*3\.0\) : 0\.0;/.test(ep),
    'the blur is bilateral on view distance, and never mixes a surface with empty space');
  assert(/uDir\*uTexel\*float\(i\)/.test(ep), '...and separable, so it is 14 taps rather than 49');
}
{
  // the kernel: 12 fixed points, hemisphere-oriented, packed toward the origin
  const m = src.match(/const _AO_KERNEL = \(\(\)=>\{[\s\S]*?return k; \}\)\(\);/);
  assert(m, 'the kernel is built once at load');
  const fn = new Function('THREE', 'Math', 'return ' + m[0].replace(/^const _AO_KERNEL = /, '').replace(/;$/, ''))
    ({ Vector3: class { constructor(x,y,z){ this.x=x; this.y=y; this.z=z; } } }, Math);
  eq(fn.length, 12, 'twelve samples');
  for (const v of fn) {
    assert(v.z >= 0, 'every sample is in the +z hemisphere, so flipping it to the normal never crosses the surface');
    const l = Math.hypot(v.x, v.y, v.z);
    assert(l > 0 && l <= 1.0001, 'every sample is inside the unit radius (' + l.toFixed(3) + ')');
  }
  const near = fn.slice(0, 4).reduce((s,v)=>s+Math.hypot(v.x,v.y,v.z), 0) / 4;
  const far  = fn.slice(-4).reduce((s,v)=>s+Math.hypot(v.x,v.y,v.z), 0) / 4;
  assert(near < far, 'the set is packed toward the origin (' + near.toFixed(2) + ' vs ' + far.toFixed(2) + '), where occlusion actually varies');
}

// ---------------------------------------------------------------- wiring in the frame
{
  const rp = extractFunction('_renderPostFX');
  assert(/scn\.overrideMaterial=_matAOGeo;/.test(rp) && /renderer\.setRenderTarget\(_aoGeoRT\); renderer\.render\(scn, cam\);/.test(rp),
    'the G-buffer prepass runs over the real scene');
  assert(/scn\.overrideMaterial=_pv;/.test(rp), '...and restores whatever override was already set');
  assert(/if\(_skyMesh\) _skyMesh\.visible=false;/.test(rp),
    'the sky dome is hidden for the prepass — overrideMaterial would give it depthWrite and it would fill the buffer at the far plane');
  assert(/_weatherPts\.visible=false/.test(rp), '...and so is weather, which would pock the buffer with occluders');
  assert(/renderer\.shadowMap\.autoUpdate=false;/.test(rp) && /renderer\.shadowMap\.autoUpdate=_sa;/.test(rp),
    'the prepass cannot consume the frame\'s shadow-map refresh');
  {
    const scene = rp.indexOf('renderer.render(scn, cam); }'), pre = rp.indexOf('renderer.setRenderTarget(_aoGeoRT)');
    assert(scene > 0 && pre > scene, 'the prepass runs AFTER the main scene pass, for the same reason');
  }
  assert(/cam\.isPerspectiveCamera/.test(rp),
    'AO is skipped on an orthographic camera, whose view rays the tan-of-fov reconstruction cannot describe');
  // build 1135: AO is gated on the RESOLUTION step, not on the MSAA rung. It used to ride the same rung,
  // so the first hiccup threw away the engine's main grounding cue while keeping 4x multisampling on the
  // edges — the wrong trade. It now survives the MSAA shed and goes when resolution starts dropping.
  assert(/_prStepI === 0/.test(rp), '...and on the adaptive ladder, but a rung BELOW MSAA');
  assert(!/_ssaoAmt > 0\.001 && _hiFxOn/.test(rp), 'AO no longer dies with MSAA');
  // AO must multiply BEFORE bloom is added, or a crevice it darkened still glows out of the frame
  const ep = extractFunction('ensurePost');
  const comp = ep.slice(ep.indexOf('_matComp=new THREE.ShaderMaterial'));
  const aoAt = comp.indexOf('texture2D(tAO,vUv).r');
  const bloomAt = comp.indexOf('texture2D(tBloom,vUv).rgb * uBloom');
  assert(aoAt > 0 && bloomAt > aoAt, 'the composite applies AO, then adds bloom — not the other way round');
  assert(/if\(uAO > 0\.0\)/.test(comp), '...and skips the tap entirely when AO is off');
}
{
  // FXAA covers ONLY the path MSAA cannot reach, and must run on display-referred pixels
  const rp = extractFunction('_renderPostFX');
  assert(/_matFXAA\.uniforms\.tColor\.value=_compRT\.texture/.test(rp), 'the no-motion-blur path can present through FXAA');
  assert(/_matFXAA\.uniforms\.tColor\.value=_afterB\.texture/.test(rp), '...and so can the motion-blur path');
  assert(/const _fx = _matFXAA && \(_postRT\.samples\|\|0\) === 0;/.test(rp),
    'FXAA runs only when MSAA is not in effect — running both would cost a pass and soften texture for nothing');
  // ordering: the composite encodes, so everything after it is display-referred — FXAA's luminance
  // thresholds are perceptual and would be wrong on scene-linear values
  const enc = rp.indexOf('cu.uEncode.value=1;'), fx = rp.indexOf('_matFXAA');
  assert(enc > 0 && fx > enc, 'FXAA runs after the OETF, where its luminance thresholds mean something');
}

// ---------------------------------------------------------------- the adaptive rung was repurposed, not removed
{
  assert(/let _hiFxOn=true, _hiFxFails=0;/.test(src), 'the top rung is named for what it now carries: MSAA and SSAO together');
  assert(!/_msaaOn/.test(src), 'the old MSAA-only name is gone');
  const fn = extractFunction('_adaptResTick');
  // build 1141 added the majority-slow term beside the mean; the ORDER is what this asserts
  assert(/if\(avg > 20 && slowFrac >= 0\.5 && _prStepI===0 && _hiFxOn\)\{/.test(fn), 'it is still shed BEFORE any resolution drop');
  assert(/_hiFxFails\+\+/.test(fn) && /_hiFxFails < 3/.test(fn),
    '...and still locked off after three failed re-arms, which is the build-883 anti-thrash rule');
  assert(/else _hiFxOn=true;/.test(fn), '...and re-armed last on the way back up');
}

// ---------------------------------------------------------------- authorable, and saved with the level
assert(/ssao:0\.9, ssaoRadius:0\.9,/.test(src), 'AO amount and radius are world settings with defaults');
{
  const aw = src.slice(src.indexOf('_postThresh = Math.max(0'), src.indexOf('_postThresh = Math.max(0') + 900);
  assert(/_ssaoAmt    = Math\.max\(0,   Math\.min\(1,/.test(aw), 'the amount is clamped 0..1');
  assert(/_ssaoRadius = Math\.max\(0\.1, Math\.min\(4,/.test(aw), 'the radius is clamped to a sane metre range');
}
assert(/slider\(b,'Ambient occlusion','ssao',0,1,0\.05\); slider\(b,'AO radius','ssaoRadius',0\.1,4,0\.1\);/.test(src),
  'both are exposed in the editor beside the other post settings');
assert(/w\.ssao=0; w\.postRays=0; w\.ssr=0; return w; \}/.test(src), 'turning post-processing off turns AO off with it');   // build 1242: god rays join the zeroed set

done('build 1126: depth-aware post — screen-space ambient occlusion, and FXAA where MSAA could not go');
