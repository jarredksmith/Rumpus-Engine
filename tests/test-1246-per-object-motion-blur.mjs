import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1246: PER-OBJECT motion blur — the velocity G-buffer 1238 named as its own honest gap. Every
// mesh's world matrix is stashed per frame; the velocity pass renders the scene with an override
// material whose per-draw uniform is the mesh's LAST-frame matrix (onBeforeRender + uniformsNeedUpdate)
// against the camera's last-frame view-projection; the blur streaks along the buffer's true per-pixel
// velocity and falls back to 1238's rotation reprojection for unwritten pixels (sky) and shed rungs.
// The viewmodel writes its own near-zero velocities, so a flick leaves the weapon sharp.

const fx = extractFunction('_renderPostFX');

// --- executable: encode/decode round-trip ----------------------------------------------------------
// pin the exact GLSL, then run the same maths: the blur must decode exactly what the pass encoded
assert(src.includes("'  gl_FragColor = vec4(v * 4.0 + 0.5, 0.0, 1.0);'"), 'the pass encodes velocity rg = v*4+0.5 (byte-target safe)');
assert(src.includes("'    d = (vv.rg - 0.5) * 0.25 * uAmt * uShutter;',"), 'the blur decodes /4 then applies the same authored scaling');
for(const v of [-0.124, -0.03, 0, 0.0005, 0.05, 0.124]){
  const enc = v * 4.0 + 0.5;
  assert(enc >= 0 && enc <= 1, 'encoded velocity stays inside a byte target');
  near((enc - 0.5) * 0.25, v, 1e-12);
}
assert(src.includes("'  vec2 v = clamp((a - b) * 0.5, -0.124, 0.124);',"), 'velocity is clamped inside the encoding range before it goes in');

// --- executable: the per-draw hook ------------------------------------------------------------------
const hookSrc = extractFunction('_velObjHook');
const mkHook = new Function('_matVel', '_velStampF', hookSrc + '; return _velObjHook;');
function mat(){ return { uniforms:{ uPrevM:{ value:{ got:null, copy(m){ this.got=m; } } } }, uniformsNeedUpdate:false }; }
{ // fresh stash -> the stashed matrix is what the draw gets
  const m = mat(); const hook = mkHook(m, 41);
  const obj = { userData:{ _pvm:'PREV', _pvmF:41 }, matrixWorld:'CUR' };
  hook.call(obj, null, null, null, null, m);
  eq(m.uniforms.uPrevM.value.got, 'PREV', 'a fresh stash supplies the LAST-frame matrix');
  assert(m.uniformsNeedUpdate === true, 'and forces the uniform upload for this draw');
}
{ // stale stash (the pass was shed for a while) -> current matrix, zero object motion, no ghost streak
  const m = mat(); const hook = mkHook(m, 41);
  const obj = { userData:{ _pvm:'PREV', _pvmF:12 }, matrixWorld:'CUR' };
  hook.call(obj, null, null, null, null, m);
  eq(m.uniforms.uPrevM.value.got, 'CUR', 'a STALE stash is ignored — re-enabling the pass must not streak off history');
}
{ // never stashed (spawned this frame) -> current matrix
  const m = mat(); const hook = mkHook(m, 41);
  const obj = { userData:{}, matrixWorld:'CUR' };
  hook.call(obj, null, null, null, null, m);
  eq(m.uniforms.uPrevM.value.got, 'CUR', 'a just-spawned mesh gets zero object motion, not garbage');
}
{ // the hook fires on EVERY pass that draws the mesh — it must touch nothing for other materials
  const m = mat(); const hook = mkHook(m, 41);
  const obj = { userData:{ _pvm:'PREV', _pvmF:41 }, matrixWorld:'CUR' };
  hook.call(obj, null, null, null, null, { other:true });
  eq(m.uniforms.uPrevM.value.got, null, 'a different material (the main pass, shadows, AO) is left alone');
  assert(m.uniformsNeedUpdate === false, '...and no upload is forced');
}

// --- executable: the stash ---------------------------------------------------------------------------
const stashSrc = extractFunction('_velStashOne');
const proto = function(){};
const mkStash = new Function('THREE', '_velProtoHook', '_velObjHook', '_frameNo', stashSrc + '; return _velStashOne;');
class M4 { copy(m){ this.from = m; return this; } }
const velHook = function(){};
{ const stash = mkStash({ Matrix4: M4 }, proto, velHook, 7);
  const o = { isMesh:true, onBeforeRender: proto, userData:{}, matrixWorld:'W' };
  stash(o);
  assert(o.userData._pvm instanceof M4 && o.userData._pvm.from === 'W', 'a mesh gets its world matrix stashed (one Matrix4, allocated once)');
  eq(o.userData._pvmF, 7, 'and stamped with the frame that stashed it');
  eq(o.onBeforeRender, velHook, 'the per-draw hook is installed');
  const prev = o.userData._pvm; o.matrixWorld='W2'; stash(o);
  eq(o.userData._pvm, prev, 're-stash reuses the matrix — no per-frame allocation (1168)');
  eq(o.userData._pvm.from, 'W2', '...and copies the new matrix');
}
{ const stash = mkStash({ Matrix4: M4 }, proto, velHook, 7);
  const own = function(){}; const o = { isMesh:true, onBeforeRender: own, userData:{}, matrixWorld:'W' };
  stash(o);
  eq(o.onBeforeRender, own, 'a mesh with its OWN hook (sky dome, flipbooks) is left untouched');
  assert(!o.userData._pvm, '...and not stashed — it is swept from the pass anyway');
  const l = { isMesh:false, onBeforeRender: proto, userData:{}, matrixWorld:'W' }; stash(l);
  assert(!l.userData._pvm, 'non-meshes (lights, groups) are skipped');
}

// --- executable: the gate ----------------------------------------------------------------------------
const velLine = fx.match(/const _velWant = ([^;]+);/);
assert(velLine, 'the velocity gate exists');
const gate = new Function('_postMotion','_prStepI','_velRT','_matVel','cam', `return !!(${velLine[1]});`);
const CAM={isPerspectiveCamera:true};
assert(gate(0.62, 0, {}, {}, CAM) === true, 'top rung with motion blur on: the pass runs');
assert(gate(0, 0, {}, {}, CAM) === false, 'motion blur authored off: no pass');
assert(gate(0.62, 1, {}, {}, CAM) === false, 'first downshift sheds it — lower rungs keep the 1238 rotation blur');
assert(gate(0.62, 0, {}, {}, {isPerspectiveCamera:false}) === false, 'ortho editor views go without');

// --- the frame block: hygiene envelope + freshness guards --------------------------------------------
assert(/renderer\.setClearColor\(0x808080, 0\);/.test(fx),
  'the buffer clears to rg 0.5 / alpha 0 — unwritten pixels decode to ZERO motion and fail the written test (1126 trap)');
assert(/renderer\.getClearColor\(_velCC\); const _ca=renderer\.getClearAlpha\(\);/.test(fx) && /renderer\.setClearColor\(_velCC, _ca\);/.test(fx),
  'the clear colour is saved and restored — the scene clear is not ours to change');
assert(/if\(_velVPF === _frameNo - 1\) vu\.uPrevVP\.value\.copy\(_velPrevVP\);/.test(fx),
  'a stale camera VP (the pass was shed) is not used — the first frame back has zero camera term');
assert(/vu\.uPrevVP\.value\.multiplyMatrices\(vmCam\.projectionMatrix, vmCam\.matrixWorldInverse\);/.test(fx),
  'the viewmodel renders against vmCam (static): only the weapon bob remains — the flick stays sharp');
const velBlock = fx.indexOf('const _velWant');
assert(fx.indexOf('_velStash(scn);', velBlock) > fx.indexOf('renderer.render(scn, cam);', velBlock),
  'the stash runs AFTER the pass — this frame is next frame’s history, never its own');
assert(/_velPrevVP\.multiplyMatrices\(cam\.projectionMatrix, cam\.matrixWorldInverse\); _velVPF=_frameNo;/.test(fx),
  'the camera VP is stashed and stamped beside the matrices');

// --- the blur pass: buffer when written, rotation fallback preserved ---------------------------------
assert(src.includes("'  if(uVelOn > 0.5 && vv.a > 0.5){',"), 'the blur takes the buffer only when the pass ran AND the pixel was written');
assert(src.includes("'    vec2 uvPrev = (vp.xy / max(0.05, -vp.z)) / uTanF * 0.5 + 0.5;',"),
  '1238’s rotation reprojection survives verbatim as the fallback (sky, shed rungs)');
assert(src.includes("'  float L = length(d); if(L > 0.05) d *= 0.05/L;',"), 'the streak cap holds for both paths');
assert(/mu\.tVel\.value = _velWant \? _velRT\.texture : _compRT\.texture; mu\.uVelOn\.value = _velWant \? 1 : 0;/.test(fx),
  'a bound-but-unread texture beats an unbound sampler (1242 rule)');

// --- lifecycle ---------------------------------------------------------------------------------------
assert(/_velRT=mkRT\(hw,hh\);/.test(src), 'the velocity target is half-res');
assert(/_raysRT,_ssrRT,_velRT\]\.concat/.test(src) && /_ssrRT=_velRT=null;/.test(src),
  'allocates with the post targets, disposes with them (880 hygiene)');

done('build 1246: per-object motion blur — velocity buffer executed end to end (encode round-trip, hook, stash, gate), rotation blur kept as the fallback, weapon sharp on flicks');
