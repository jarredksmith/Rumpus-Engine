import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 581: post-processing (bloom + color grade + vignette + film grain + temporal motion blur), self-contained
// like the DoF path, wrapped in a fallback so any error reverts to a plain render (never a black screen).

// --- the pipeline builds its targets + passes ---
const ep = extractFunction('ensurePost');
assert(/if\(_postRT\) return true;/.test(ep) && /if\(!THREE\.WebGLRenderTarget\) return false;/.test(ep), 'lazy build, guarded on RT support');   // build 880: keys on targets (materials persist)
// build 1128: the single half-res bloom buffer became a five-level mip pyramid, base half-res.
assert(/_postRT=mkRT\(w,h\)/.test(ep) && /_bloomMips\.push\(mkRT\(mw,mh\)\)/.test(ep) && /_compRT=mkRT\(w,h\)/.test(ep) && /_afterA=mkRT\(w,h\); _afterB=mkRT\(w,h\)/.test(ep), 'full-res scene/comp, half-res bloom, two afterimage buffers');
assert(/let i=0, mw=hw, mh=hh; i<_BLOOM_MIPS/.test(ep), '...the pyramid starts at half resolution and halves per level');
assert(/_matBloomDown=new THREE\.ShaderMaterial/.test(ep) && /_matBloomUp=new THREE\.ShaderMaterial/.test(ep) && /_matComp=new THREE\.ShaderMaterial/.test(ep) && /_matAfter=new THREE\.ShaderMaterial/.test(ep) && /_matCopy=new THREE\.ShaderMaterial/.test(ep), 'five passes: bloom down, bloom up, composite, afterimage, copy');
assert(/uMbRot \* v/.test(ep) && /texture2D\(tNew, vUv \+ d\*t\)/.test(ep), 'motion blur is a rotational REPROJECTION streak — build 1238 replaced the afterimage max(new, old*damp) trail with real per-pixel camera velocity');
assert(/smoothstep\(0\.42,0\.78,r\)\*uVig/.test(ep), 'vignette darkens the edges');

// --- the per-frame chain order ---
const rp = extractFunction('_renderPostFX');
const order = ['setRenderTarget\\(_postRT\\); renderer.render\\(scn', 'setRenderTarget\\(_bloomMips\\[i\\]\\)', 'setRenderTarget\\(_compRT\\)', 'setRenderTarget\\(_afterB\\)'];
let last=-1; for(const pat of order){ const i=rp.search(new RegExp(pat)); assert(i>last, 'chain step in order: '+pat); last=i; }
assert(rp.lastIndexOf('setRenderTarget(null)') > last, 'the present-to-screen pass comes last in the motion-blur chain');
// build 810: with motion blur ~0 (or shed at the lowest adaptive step), the composite goes straight to screen — the
// motion-blend + copy passes (two full-res fullscreen draws) are skipped entirely.
assert(/const _mbOn = \(_postMotion \* \(\(typeof a11y!=='undefined'\) \? a11y\.blur : 1\)\)>0\.01 && !\(_adaptOn && _prStepI>=_PR_STEPS\.length-1\);/.test(rp), 'motion chain is skipped when motion is ~0 or adaptive res is at its floor');   /* build 1313 */
assert(/if\(!_mbOn\)\{[\s\S]{0,140}?_postQuad\.material=_matComp; renderer\.setRenderTarget\(null\); renderer\.render\(_postScene,_postCam\);\s*\n?\s*return;\s*\n?\s*\}/.test(rp), 'no-motion path composites straight to the screen (saves 2 full-res passes)');
assert(!/const t=_afterA; _afterA=_afterB; _afterB=t;/.test(rp) && /cut \? 0 : _postMotion/.test(rp), 'no accumulation ping-pong any more — one reprojection pass per frame, zeroed on a camera cut (build 1238)');
assert(/if\(_postRT\.width!==w \|\| _postRT\.height!==h \|\| \(_postRT\.samples\|\|0\)!==_desiredPostSamples\(\)\)\{ disposePost\(\); ensurePost\(\); \}/.test(rp), 'targets rebuild on resolution change (and on the MSAA step, build 880)');

// --- the fallback: renderScene tries post first, reverts on any throw, never re-tries after failure ---
const rs = extractFunction('renderScene');
assert(/if\(_postOn && !_postFail && typeof ensurePost==='function' && ensurePost\(\)\)\{/.test(rs), 'post path gated on toggle + not-failed + buildable');
assert(/catch\(e\)\{ _postFail=true;[^}]*renderer\.setRenderTarget\(null\)/.test(rs.replace(/\n/g,' ')), 'an error disables post-fx and restores the screen target');
assert(/renderer\.render\(scn, cam\)/.test(rs), 'falls through to the existing direct/DoF render');

// --- toggle: persisted, default on, frees VRAM when turned off ---
assert(/let _postOn = true;/.test(src) && /localStorage\.getItem\('breach_postfx'\)/.test(src), 'post-fx on by default, persisted');
assert(/getElementById\('postFxCb'\)/.test(src), 'pause menu wires the visual-effects toggle');
assert(/_postOn=pfx\.checked; _postFail=false;[^;]*localStorage\.setItem\('breach_postfx'/.test(src.replace(/\n/g,' ')), 'toggling persists + clears the failure latch');
assert(/if\(!_postOn && typeof disposePost==='function'\) disposePost\(\)/.test(src), 'turning it off frees the render targets');
assert(/resizePost\(\)/.test(extractFunction('_fitViewport')), 'resize rebuilds the post targets');

// build 582: look params live in worldCfg (save with the level) + tunable in the editor camera section
assert(/postBloom:0\.65/.test(src) && /postMotion:0\.62/.test(src) && /postThresh:0\.62/.test(src), 'DEFAULT_WORLD carries the post-fx look defaults');
const aw = extractFunction('applyWorldCfg');
assert(/_postBloom  = Math\.max\(0,   Math\.min\(2,/.test(aw) && /_postMotion = Math\.max\(0,   Math\.min\(0\.95,/.test(aw), 'applyWorldCfg drives the live look params from worldCfg (clamped)');
assert(/worldCfg\.postThresh == null \? DEFAULT_WORLD\.postThresh/.test(aw), 'old levels without post keys fall back to defaults');
const ef = src;   // the camera-section sliders write worldCfg keys via the shared slider() helper
assert(/slider\(b,'Bloom','postBloom',0,2,0\.05\)/.test(ef) && /slider\(b,'Motion blur','postMotion',0,0\.95,0\.02\)/.test(ef) && /slider\(b,'Bloom threshold','postThresh',0,1,0\.02\)/.test(ef), 'camera section exposes the look sliders');

done('post-processing: bloom + grade + vignette + grain + motion blur, mirrored on the DoF pattern with a hard fallback (build 581)');
