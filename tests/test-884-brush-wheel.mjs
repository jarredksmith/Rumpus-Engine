// (build 884) WHEEL SIZES THE BRUSH — "can the mouse scroll wheel adjust the size of the brush?"
// With the brush armed and the pointer over the 3D canvas, the wheel scales the radius multiplicatively
// (quick at any size), clamped to the slider's own 2–40 range, with instant ring feedback. Over the
// editor panel the wheel still scrolls it, and with the brush off the top-view zoom is untouched.
import { gameSource, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

const block = src.match(/if\(terrainBrush\.on && e\.target===renderer\.domElement\)\{[\s\S]{0,700}?e\.preventDefault\(\); return;\s*\}/);
assert(!!block, 'the brush-wheel branch exists, gated on brush ON + pointer over the canvas');
const b = block ? block[0] : '';
assert(/terrainBrush\.radius = Math\.round\(Math\.max\(2, Math\.min\(40, terrainBrush\.radius \* \(1 - Math\.sign\(e\.deltaY\)\*0\.12\)\)\)\*2\)\/2;/.test(b),
  'multiplicative step, clamped to the Brush size slider range (2–40), snapped to halves');
assert(/_brushRingT=0; if\(typeof _updateBrushRing==='function'\) _updateBrushRing\(e\);/.test(b), 'the cursor ring resizes instantly (throttle skipped)');
assert(/renderEditorFields\(\)/.test(b), 'the panel slider follows');
// ordering: the brush branch fires BEFORE top-view zoom, inside the editorOpen branch
const wheelAt = src.indexOf("addEventListener('wheel', e=>{\n  if(editorOpen){");
const brushAt = src.indexOf('if(terrainBrush.on && e.target===renderer.domElement){', wheelAt);
const zoomAt = src.indexOf('if(editorTopView){ topZoom', wheelAt);
assert(wheelAt > -1 && brushAt > wheelAt && zoomAt > brushAt, 'brush sizing wins over top-view zoom only while the brush is armed');

// the math, executed: multiplicative up/down + clamps
const step = (r, dy) => Math.round(Math.max(2, Math.min(40, r * (1 - Math.sign(dy) * 0.12))) * 2) / 2;
near(step(12, -100), 13.5, 1e-9, 'scroll up grows the brush ~12%');
near(step(12, 100), 10.5, 1e-9, 'scroll down shrinks it');
eq(step(2, 100), 2, 'floor clamp at the slider minimum');
eq(step(40, -100), 40, 'ceiling clamp at the slider maximum');

done('build 884: the wheel sizes the brush under the cursor — ring feedback live, panel slider in sync');
