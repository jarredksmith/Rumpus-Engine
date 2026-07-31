// build 1184: the water family joins the colour pipeline.
//
// The water surface, the waterfall sheets and the plunge foam were the last raw ShaderMaterials writing
// straight gl_FragColor — no ACES, no exposure, no fog. So water ignored the filmic response, the
// creator's exposure, 1180's auto-exposure and 1181's height fog: a lake at dusk sat at its own private
// brightness inside a fogged, graded frame. Each now applies _ACES_GLSL (the dome's exact uTM/uExpo pair —
// uTM 0 is byte-identical to the old shader) and ends in the engine's own fog_fragment chunk via
// material.fog=true. The surface also gains a soft SHORELINE from 1183's G-buffer read.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- every water shader is in the pipeline
{
  const grab = (name) => src.match(new RegExp('const ' + name + ' = \\[[\\s\\S]{0,4600}?\\]\\.join\\(', 'm'))[0];
  for (const name of ['_WATER_FSH', '_FALL_FSH', '_FOAM_FSH']) {
    const s = grab(name);
    assert(/^const \w+ = \[\n  _ACES_GLSL,/.test(s), name + ' opens with the SHARED _ACES_GLSL — the dome\'s fit, never a re-typed copy');
    assert(s.includes("'#include <fog_pars_fragment>'"), name + ' declares the fog uniforms via the engine\'s own chunk');
    assert(s.includes("'#include <fog_fragment>'"), name + ' ends in the engine\'s fog — height falloff and sun inscatter included');
    const tone = s.indexOf('_aces('), fog = s.indexOf("'#include <fog_fragment>'");
    assert(tone > -1 && tone < fog, name + ' tone-maps BEFORE fogging — three\'s own order, so water fogs like every built-in');
  }
  for (const name of ['_WATER_VSH', '_FALL_VSH']) {
    const s = grab(name);
    assert(s.includes("'#include <fog_pars_vertex>'"), name + ' declares the fog varyings');
    assert(s.includes("'  vFogDepth = - mvPosition.z; vFogWorldPos = wp.xyz;'") && s.includes("'#ifdef USE_FOG'"),
      name + ' writes them directly (the shared fog_vertex chunk needs `transformed`, which these shaders do not have)');
  }
}

// ---------------------------------------------------------------- the fog uniform set, executed
{
  const sunDir = { x: 1, y: 2, z: 3 }, params = { x: 4, y: 5, z: 6 };
  const mk = new Function('THREE', '_fogSunDirU', '_fogParamsU', extractFunction('_waterFogUniforms') + '\nreturn _waterFogUniforms;')(
    { Color: function (h) { this.hex = h; } }, sunDir, params);
  const u = mk();
  assert(u.fogSunDirW.value === sunDir && u.fogHeightP.value === params,
    'the chunk\'s extra uniforms ride the SAME shared objects as 1181 — one CPU write per frame reaches the water too');
  assert(u.fogColor && u.fogColor.value && u.fogDensity && typeof u.fogDensity.value === 'number',
    'fogColor/fogDensity exist with real values — three\'s per-frame fog refresh writes into them and THROWS on a material that has fog:true but no fogColor uniform');
  assert(u.uTM && u.uExpo, 'the tone pair ships in the same set');
  assert(mk().fogColor !== u.fogColor, 'each material gets its own wrappers (only the sun/height VALUES are shared)');
}

// ---------------------------------------------------------------- the materials and the per-frame feed
{
  eq((src.match(/\.\.\._waterFogUniforms\(\)/g) || []).length, 3, 'surface, sheet and foam all spread the set');
  assert(/transparent: true, depthWrite: false, side: THREE\.DoubleSide, fog: true,\n  \}\);/.test(src), 'the surface material asks three for fog');
  eq((src.match(/side:THREE\.DoubleSide, fog:true \}\);/g) || []).length, 2, '...and both waterfall materials do');
  assert(/uSoftGeo: _SOFT_GEO, uSoftP: _SOFT_P,/.test(src),
    'the soft-shore read shares 1183\'s uniform WRAPPERS outright — same gate, same texture, zero extra bookkeeping');
  assert(/u\.uExpo\.value=renderer\.toneMappingExposure; u\.uTM\.value=\(typeof worldCfg!=='undefined' && worldCfg\.filmic!=null\)\?\+worldCfg\.filmic:1;/.test(src),
    'the surface reads the renderer\'s LIVE exposure — base × auto, so 1180\'s eye adaptation reaches the water');
  assert(/const _wfTone=\(m\)=>\{ if\(m && m\.uniforms && m\.uniforms\.uExpo\)\{ m\.uniforms\.uExpo\.value=_lExpo; m\.uniforms\.uTM\.value=_lTM; \} \};/.test(src) &&
    (src.match(/_wfTone\(g\.userData\./g) || []).length === 3,
    '...and all three waterfall materials get the same pair each frame');
}

// ---------------------------------------------------------------- the shoreline
{
  const s = src.match(/const _WATER_FSH = \[[\s\S]{0,4600}?\]\.join\(/m)[0];
  assert(s.includes("'    a *= clamp( ( _sd - vVZ ) * 1.4, 0.0, 1.0 );'"),
    'the rim fades over the band where ground sits just behind the surface — vVZ is view-Z, the SAME quantity the G-buffer stores (a euclidean distance here would tilt the band with view angle)');
  assert(s.includes("( _sg.r + _sg.g + _sg.b ) < 0.3 ? 1e6 : _sg.a"),
    'a cleared texel reads as infinitely far (1126\'s geometric sky test) — without it the whole surface fades against sky');
  assert(s.includes("'  if( uSoftP.x > 0.5 ){'"), 'gated on the same freshness flag as 1183 — AO off = the old hard rim, never stale depth');
  { // the maths: a shore pixel half-fades, deep water is untouched, and the fade direction is right
    const fade = (sd, vz) => Math.min(1, Math.max(0, (sd - vz) * 1.4));
    near(fade(10 + 0.5 / 1.4, 10), 0.5, 1e-9, 'ground half a band behind the surface = half faded');
    eq(fade(40, 10), 1, 'deep water (ground far below) keeps full opacity');
    eq(fade(9.5, 10), 0, 'geometry IN FRONT of the water (a pier post) blanks the fragment rather than shining through');
  }
}

done('build 1184: water surface, waterfall sheets and plunge foam all tone-map with the dome\'s shared ACES (live base × auto exposure, filmic-0 = old shader exactly), end in the engine\'s own height fog + inscatter via material.fog, and the surface gains a soft G-buffer shoreline — the last raw shaders outside the colour pipeline are in it');
