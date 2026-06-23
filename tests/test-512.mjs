import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 662: the cinematic camera preview can be popped into its own window. Unlike the editor panel (pure
// DOM), the preview is WebGL, so we render the shot into an offscreen target, read the pixels back, and paint
// them onto a 2D canvas in the popup each frame.

// --- state + a pop-out button in the preview header ---
assert(/let _cinePvWin=null, _cinePvWinCanvas=null, _cinePvWinCtx=null, _cinePvPopBtn=null;/.test(src), 'pop-out window state is declared');
assert(/const _CINEPV_RW=640, _CINEPV_RH=360;/.test(src), 'the off-screen preview resolution is fixed (16:9)');
const ep = extractFunction('_ensureCinePvPanel');
assert(/po\.onclick=\(\)=>\{ if\(_cinePvWin && !_cinePvWin\.closed\) _closeCinePvWindow\(\); else _openCinePvWindow\(\); \}/.test(ep), 'the header has a pop-out / re-dock toggle button');
assert(/hdr\.appendChild\(po\); hdr\.appendChild\(x\);/.test(ep), 'the pop-out button sits in the header next to close');

// --- the popup is a real separate window with a 2D canvas ---
const ow = extractFunction('_openCinePvWindow');
assert(/window\.open\('', 'breach-cine-preview'/.test(ow), 'opens a named separate window');
assert(/const c = w\.document\.createElement\('canvas'\); c\.width=_CINEPV_RW; c\.height=_CINEPV_RH;/.test(ow), 'creates a canvas at the preview resolution');
assert(/_cinePvWinCtx=c\.getContext\('2d'\)/.test(ow), 'grabs a 2D context to paint frames into');
assert(/w\.addEventListener\('beforeunload'/.test(ow) && /if\(_cinePvFrame\) _cinePvFrame\.style\.display='block'/.test(ow), 'closing the popup restores the in-page preview frame');

// --- the blit: render to target, read back, flip rows, putImageData ---
const blit = extractFunction('_blitCinePvToWindow');
assert(/_cinePvRT = new THREE\.WebGLRenderTarget\(RW,RH/.test(blit), 'renders into an off-screen target');
assert(/renderer\.render\(scene, _cinePvCam\)/.test(blit), 'renders the real scene through the cinematic camera');
assert(/renderer\.readRenderTargetPixels\(_cinePvRT, 0,0, RW,RH, _cinePvPix\)/.test(blit), 'reads the pixels back (reliable regardless of preserveDrawingBuffer)');
assert(/for\(let y=0;y<RH;y\+\+\)\{ const s=\(RH-1-y\)\*rowB, d=y\*rowB; dst\.set\(src\.subarray\(s, s\+rowB\), d\); \}/.test(blit), 'flips GL bottom-up rows into top-down ImageData');
assert(/_cinePvWinCtx\.putImageData\(_cinePvImg, 0, 0\)/.test(blit), 'paints the frame into the popup canvas');
assert(/try\{[\s\S]*?\}catch\(e\)\{/.test(blit), 'readback is guarded so a context loss cannot break the editor');

// --- the render path skips the in-page scissor draw while popped ---
const rw = extractFunction('_renderCinePvWindow');
assert(/const popped = !!\(_cinePvWin && !_cinePvWin\.closed\);/.test(rw), 'detects the popped state');
assert(/if\(_cinePvFrame\) _cinePvFrame\.style\.display = popped \? 'none' : 'block';/.test(rw), 'hides the in-page video frame while popped (header/scrubber stay)');
assert(/if\(popped\)\{ _blitCinePvToWindow\(\); return; \}/.test(rw), 'while popped it blits to the window instead of the corner scissor');

// --- lifecycle: blanks when idle, closes with the editor ---
assert(/function _blankCinePvWindow\(\)\{/.test(src), 'idle frames blank the popup to avoid a frozen stale image');
assert(/if\(typeof _closeCinePvWindow==='function'\) _closeCinePvWindow\(\);   \/\/ build 662: close the camera-preview pop-out too/.test(src), 'closing the editor closes the preview pop-out');

done('build 662: the cinematic camera preview can pop into its own window');
