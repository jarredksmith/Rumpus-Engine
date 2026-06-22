import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 611: DoF + post-FX were mutually exclusive (post returned first). Now DoF renders into the post
// pipeline's input target, so focus blur (incl. cinematic rack focus) survives with effects on.

// the shared DoF pass renders to an arbitrary target and reports success
const rd = extractFunction('_runDofTo');
assert(/function _runDofTo\(scn, cam, out\)\{/.test(rd), '_runDofTo takes an explicit output target');
assert(/if\(!ensureDof\(\)\)\{ renderer\.setRenderTarget\(out\); renderer\.render\(scn, cam\); return false; \}/.test(rd), 'falls back to a plain render into out when DoF is unavailable');
assert(/renderer\.setRenderTarget\(_dofRT\); renderer\.render\(scn, cam\);/.test(rd), 'pass 1 captures scene color + depth');
assert(/_dofMatV\.uniforms\.tColor\.value = _dofRT2\.texture; _dofMatV\.uniforms\.tDepth\.value = _dofRT\.depthTexture/.test(rd), 'final pass samples blurred color + original depth');
assert(/renderer\.setRenderTarget\(out\); renderer\.render\(_dofScene, _dofCam\);\n  return true;/.test(rd), 'final blur lands in out, returns true');

// renderScene: post path still wins (and now carries DoF); the no-post DoF path routes through _runDofTo to screen
const rs = extractFunction('renderScene');
assert(/if\(_postOn && !_postFail && typeof ensurePost==='function' && ensurePost\(\)\)\{/.test(rs), 'post pipeline is still chosen when enabled');
assert(/if\(!dofEnabled \|\| !ensureDof\(\)\)\{ renderer\.render\(scn, cam\); \}\n  else \{ _runDofTo\(scn, cam, null\); \}/.test(rs), 'no-post path: DoF to screen via _runDofTo');

// the bug fix proper: post pipeline runs DoF FIRST into its own color target
const pf = extractFunction('_renderPostFX');
assert(/if\(dofEnabled && ensureDof\(\)\)\{ _runDofTo\(scn, cam, _postRT\); \}\n  else \{ renderer\.setRenderTarget\(_postRT\); renderer\.render\(scn, cam\); \}/.test(pf), 'post step 1 = DoF into _postRT when active, else plain scene');
// and the rest of the chain reads _postRT, so bloom/grade operate on the focus-blurred image
assert(/_matBright\.uniforms\.tColor\.value=_postRT\.texture/.test(pf), 'bloom reads the (DoF-filled) post color target');

// the old inline DoF block is gone from renderScene (no duplicate pipeline)
assert(!/setRenderTarget\(_dofRT2\)/.test(rs), 'renderScene no longer inlines the DoF passes');

done('DoF now composes with post-FX: focus blur survives effects on (build 611)');
