import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/o\.scale=\+sSlider\.value; applyTouchLayout\(\); _teClamp\(_teSel\)/.test(src), 'size slider sets per-control scale + clamps on-screen');
assert(/if\(id==='tStick'\)\{[\s\S]*?el\.style\.width=\(TSTICK_BASE\*sc\)/.test(src), 'stick scales by box size (keeps thumb-throw math)');
assert(/el\.style\.transform = sc!==1 \? \(_centered \? \('translateX\(-50%\) scale\('\+sc\+'\)'\) : \('scale\('\+sc\+'\)'\)\) : '';/.test(src), 'buttons scale via transform (centered elements keep their -50% — build 913)');
assert(/R=Math\.max\(36, r\.width\*0\.5\)/.test(src), 'stick throw radius scales with its size');
assert(/function _teClamp\(id\)/.test(src) && /function _teSyncSize\(\)/.test(src), 'clamp + size-sync helpers exist');
// drop must not wipe scale
assert(/o\.fx=r\.left\/innerWidth; o\.fy=r\.top\/innerHeight; saveTouchLayout\(\); _teDrag=null;/.test(src), 'drag-drop merges position without erasing scale');
done('touch-hud-size');
