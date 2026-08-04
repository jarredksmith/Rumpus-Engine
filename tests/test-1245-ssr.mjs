import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1245: SCREEN-SPACE REFLECTIONS. A half-res march of the AO G-buffer (view normal rgb, linear
// view depth -mvPosition.z in a) sampling the LINEAR scene at the hit; the composite adds it before
// its one encode (1115's rule). Floors only — the G-buffer carries no roughness, so the honest look
// is a glossy ground. Rides the top adaptive rung (build 1364: stricter than the AO sample, which now
// rides all three prepass rungs at a reduced tap count), but keeps the G-buffer PREPASS
// alive on its own when AO is authored off.

const fx = extractFunction('_renderPostFX');

// --- executable: the three gates, driven off the REAL source lines ---------------------------------
const geoLine = fx.match(/const _geoWant = ([^;]+);/);
const aoLine  = fx.match(/const _aoWant = ([^;]+);/);
const ssrLine = fx.match(/const _ssrWant = ([^;]+);/);
assert(geoLine && aoLine && ssrLine, 'all three gates exist in the post pipeline');
const gates = new Function('_ssaoAmt','_postSSR','_prStepI','_AO_GEO_MAXSTEP','_aoGeoRT','cam','_ssrRT','_matSSR',
  `const _geoWant = ${geoLine[1]}; const _aoWant = ${aoLine[1]}; const _ssrWant = ${ssrLine[1]};
   return {geo:!!_geoWant, ao:!!_aoWant, ssr:!!_ssrWant};`);
const CAM={isPerspectiveCamera:true}, RT={}, MAT={};
let g = gates(0, 0.35, 0, 2, RT, CAM, RT, MAT);
assert(g.geo && !g.ao && g.ssr, 'SSR alone keeps the G-buffer prepass alive; the AO sample stays OFF (its own amount term)');
g = gates(0.9, 0, 0, 2, RT, CAM, RT, MAT);
assert(g.geo && g.ao && !g.ssr, 'AO alone: exactly the pre-1245 behaviour, SSR never runs');
g = gates(0, 0, 0, 2, RT, CAM, RT, MAT);
assert(!g.geo && !g.ao && !g.ssr, 'both off: no prepass at all — a level that wants neither pays for neither');
g = gates(0.9, 0.35, 1, 2, RT, CAM, RT, MAT);
assert(g.geo && g.ao && !g.ssr, 'first downshift: prepass AND the AO sample survive (build 1364 — 6 taps), while SSR still sheds');
g = gates(0.9, 0.35, 3, 2, RT, CAM, RT, MAT);
assert(!g.geo, 'past the prepass rungs everything is gone');

// --- executable: view reconstruction round-trips through projection --------------------------------
// pin the exact GLSL first, then run the same maths in JS: vuv(vpos(uv,z)) must be the identity
assert(src.includes("'vec3 vpos(vec2 uv, float z){ vec2 n=uv*2.0-1.0; return vec3(n.x*uProjScale.x*z, n.y*uProjScale.y*z, -z); }',"),
  'view position reconstruction matches the AO shader convention (linear -z depth in alpha)');
assert(src.includes("'vec2 vuv(vec3 p){ return (p.xy / (-p.z * uProjScale)) * 0.5 + 0.5; }',"),
  'the marched point projects back to UV with the same scale');
const ps = [Math.tan(78*Math.PI/360)*1.78, Math.tan(78*Math.PI/360)];   // fov 78, 16:9 — the stock camera
const vpos = (u,v,z)=>[(u*2-1)*ps[0]*z, (v*2-1)*ps[1]*z, -z];
const vuv  = (p)=>[ (p[0]/(-p[2]*ps[0]))*0.5+0.5, (p[1]/(-p[2]*ps[1]))*0.5+0.5 ];
for(const [u,v,z] of [[0.5,0.5,10],[0.1,0.9,3],[0.93,0.2,55]]){
  const r = vuv(vpos(u,v,z));
  near(r[0], u, 1e-9); near(r[1], v, 1e-9);
}

// --- the march: sky continues, hit compares linear depth, thickness grows with reach ---------------
assert(src.includes("'    if(_empty(g2)) continue;',"), 'a sky pixel mid-march is stepped OVER, not treated as a hit or a wall');
assert(src.includes("'    float d = -p.z - g2.a;',"), 'the hit test compares the ray depth against the G-buffer surface depth (both linear -z)');
assert(src.includes("'    if(d > 0.02 && d < 1.0 + t*0.08){',"), 'a thickness window rejects rays passing far BEHIND thin geometry');
assert(src.includes("'  float up = smoothstep(0.55, 0.85, dot(n, uUpView));',"), 'floors only — no per-pixel roughness exists, so walls do not mirror');
assert(src.includes("'      float edge = smoothstep(0.0, 0.08, min(e.x, e.y));',"), 'hits near the screen border fade instead of cutting');

// uUpView is the world up transformed into view space: column 1 of matrixWorldInverse (updated by the
// scene render that just ran) — no quaternion inversion allocations per frame
assert(/const _ie=cam\.matrixWorldInverse\.elements; su\.uUpView\.value\.set\(_ie\[4\], _ie\[5\], _ie\[6\]\);/.test(fx),
  'the up axis comes from the camera matrix the scene pass already updated');
assert(/su\.tScene\.value=_postRT\.texture; su\.tGeo\.value=_aoGeoRT\.texture;/.test(fx),
  'SSR samples the resolved scene target and marches the AO G-buffer — no new prepass');

// --- composite: added in LINEAR before the one encode (1115), with the bound-fallback rule (1242) ---
const compAdd = src.indexOf("'  if(uSSR > 0.001){ vec4 sr = texture2D(tSSR,vUv); c += sr.rgb * sr.a * uSSR; }'");
const encode = src.indexOf("'  c=_out(clamp(c,0.0,1.0));'");
assert(compAdd >= 0 && encode >= 0 && compAdd < encode, 'the reflection adds like light, in linear, BEFORE the display encode');
assert(/cu\.tSSR\.value = _ssrWant \? _ssrRT\.texture : _bloomMips\[1\]\.texture; cu\.uSSR\.value = _ssrWant \? _postSSR : 0;/.test(fx),
  'a bound-but-unread texture beats an unbound sampler (1242 rule), and strength is zeroed when the pass did not run');

// --- lifecycle + authoring ------------------------------------------------------------------------
assert(/_ssrRT=mkRT\(hw,hh\);/.test(src), 'the reflection target is half-res, same as the G-buffer it marches');
assert(/_aoRT2,_raysRT,_ssrRT,_velRT\]\.concat/.test(src) && /_aoRT2=_raysRT=_ssrRT=_velRT=null;/.test(src),
  'the target allocates with the post targets and disposes with them (880 hygiene)');
assert(/ssr:0\.35,/.test(src), 'DEFAULT_WORLD ships a subtle glossy floor');
assert(/_postSSR    = Math\.max\(0,   Math\.min\(1,    worldCfg\.ssr        == null \? DEFAULT_WORLD\.ssr        : \+worldCfg\.ssr\)\);/.test(src),
  'the world field sanitizes with a 0..1 clamp beside the other post knobs');
assert(/w\.ssao=0; w\.postRays=0; w\.ssr=0; return w; \}/.test(src),
  '_postOffWorld zeroes it — a first-time scene starts clean (1140 lesson)');
assert(/slider\(b,'Reflections','ssr',0,1,0\.05\);/.test(src), 'the editor exposes it beside the AO sliders; 0 = off');

done('build 1245: screen-space reflections — G-buffer march, floors-only, linear add before the encode, top-rung shed, authored via worldCfg.ssr');
