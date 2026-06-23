import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 662: the cinematic camera preview can be popped into its own window. Unlike the editor panel (pure
// DOM), the preview is WebGL, so we render the shot into an offscreen target, read the pixels back, and paint
// them onto a 2D canvas in the popup each frame.

// --- state + a pop-out button in the preview header ---
assert(/let _cinePvWin=null, _cinePvWinCanvas=null, _cinePvWinCtx=null, _cinePvPopBtn=null, _cinePvHeader=null;/.test(src), 'pop-out window state is declared');
assert(/const _CINEPV_RW=640, _CINEPV_RH=360;/.test(src), 'the off-screen preview resolution is fixed (16:9)');
const ep = extractFunction('_ensureCinePvPanel');
assert(/po\.onclick=\(\)=>\{ if\(_cinePvWin && !_cinePvWin\.closed\) _closeCinePvWindow\(\); else _openCinePvWindow\(\); \}/.test(ep), 'the header has a pop-out / re-dock toggle button');
assert(/hdr\.appendChild\(po\); hdr\.appendChild\(x\);/.test(ep), 'the pop-out button sits in the header next to close');

// --- the popup is a real separate window with a 2D canvas ---
const ow = extractFunction('_openCinePvWindow');
assert(/window\.open\('', 'breach-cine-preview'/.test(ow), 'opens a named separate window');
assert(/const c = w\.document\.createElement\('canvas'\); c\.width=_CINEPV_RW; c\.height=_CINEPV_RH;/.test(ow), 'creates a canvas at the preview resolution');
// build 664: the copied global `canvas{position:fixed;inset:0}` rule would cover the scrubber — reset it inline
assert(/c\.style\.cssText='position:static;top:auto;left:auto;z-index:auto;/.test(ow), 'the popup canvas is flow-positioned so it does not cover the header/scrubber');
assert(/_cinePvWinCtx=c\.getContext\('2d'\)/.test(ow), 'grabs a 2D context to paint frames into');
// build 663: the scrubber + buttons (the header) MOVE into the popup; the in-page panel is hidden
assert(/if\(_cinePvHeader\)\{ ctrl\.appendChild\(_cinePvHeader\); \}/.test(ow), 'the scrubber/buttons move into the popup window');
assert(/if\(_cinePvPanel\) _cinePvPanel\.style\.display='none';/.test(ow), 'the in-page panel is hidden while popped (nothing left in it)');
assert(/for\(const s of document\.querySelectorAll\('style'\)\)\{ const ns=w\.document\.createElement\('style'\); ns\.textContent=s\.textContent;/.test(ow), 'parent styles are copied so --accent resolves in the popup');
assert(/w\.addEventListener\('beforeunload'/.test(ow) && /_redockCineHeader\(\)/.test(ow), 'closing the popup moves the scrubber back to the in-page panel');
assert(/function _redockCineHeader\(\)\{ if\(_cinePvHeader && _cinePvPanel && _cinePvFrame && _cinePvHeader\.parentNode!==_cinePvPanel\)/.test(src), 're-dock puts the header back before the frame');

// --- the blit: render to target, read back, flip rows, putImageData ---
const blit = extractFunction('_blitCinePvToWindow');
assert(/_cinePvRT = new THREE\.WebGLRenderTarget\(RW,RH/.test(blit), 'renders into an off-screen target');
assert(/renderer\.render\(scene, _cinePvCam\)/.test(blit), 'renders the real scene through the cinematic camera');
assert(/renderer\.readRenderTargetPixels\(_cinePvRT, 0,0, RW,RH, _cinePvPix\)/.test(blit), 'reads the pixels back (reliable regardless of preserveDrawingBuffer)');
assert(/for\(let y=0;y<RH;y\+\+\)\{ const s=\(RH-1-y\)\*rowB, d=y\*rowB; dst\.set\(src\.subarray\(s, s\+rowB\), d\); \}/.test(blit), 'flips GL bottom-up rows into top-down ImageData');
assert(/_cinePvWinCtx\.putImageData\(_cinePvImg, 0, 0\)/.test(blit), 'paints the frame into the popup canvas');
assert(/try\{[\s\S]*?\}catch\(e\)\{/.test(blit), 'readback is guarded so a context loss cannot break the editor');
// build 663: restore the full viewport after the off-screen render, or the main window looks "resized"
assert(/const sz=renderer\.getSize\(new THREE\.Vector2\(\)\);\s*\n\s*renderer\.setScissorTest\(false\); renderer\.setViewport\(0,0,sz\.x,sz\.y\); renderer\.setScissor\(0,0,sz\.x,sz\.y\); renderer\.setRenderTarget\(null\);/.test(blit), 'the full-screen viewport/scissor is restored after the blit (fixes the squished main render)');

// --- the render path skips the in-page scissor draw while popped ---
const rw = extractFunction('_renderCinePvWindow');
assert(/const popped = !!\(_cinePvWin && !_cinePvWin\.closed\);/.test(rw), 'detects the popped state');
assert(/if\(popped\)\{ _cinePvPanel\.style\.display='none'; _blitCinePvToWindow\(\); return; \}/.test(rw), 'while popped the whole in-page panel hides + it blits to the window');
assert(/_cinePvSlider\.ownerDocument && _cinePvSlider\.ownerDocument\.activeElement!==_cinePvSlider/.test(rw), 'the scrubber-sync respects whichever document the slider lives in (popup while popped)');

// --- lifecycle: blanks when idle, closes with the editor ---
assert(/function _blankCinePvWindow\(\)\{/.test(src), 'idle frames blank the popup to avoid a frozen stale image');
assert(/if\(typeof _closeCinePvWindow==='function'\) _closeCinePvWindow\(\);   \/\/ build 662: close the camera-preview pop-out too/.test(src), 'closing the editor closes the preview pop-out');

done('build 662: the cinematic camera preview can pop into its own window');
