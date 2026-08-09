// (build 186) Props get per-axis scale (Scale X/Y/Z) so non-uniform gizmo scaling survives editing a
// slider. The bug: apply() forced uniform scale (o.scale.setScalar(s.s)) on every field commit, flattening
// a stretched prop back to its original proportional shape. Now apply() uses o.scale.set(sx,sy,sz), sync()
// reads all three axes, and a gizmo drag pushes its result back into the sliders on drag-end.
import { gameSource, done, assert } from './harness.mjs';
const src = gameSource();

// prsTransform emits per-axis scale fields when asked, uniform otherwise
assert(/function prsTransform\(min,max,perAxisScale\)/.test(src), 'prsTransform takes a perAxisScale flag');
assert(/k:'sx', label:'Scale X'/.test(src) && /k:'sy', label:'Scale Y'/.test(src) && /k:'sz', label:'Scale Z'/.test(src), 'per-axis scale fields exist');

// props target uses per-axis scale end to end
assert(/fields: prsTransform\(-65,65,true\)/.test(src), 'props use per-axis scale fields');
assert(/state: \{ px:0, py:0, pz:0, rx:0, ry:0, rz:0, sx:1, sy:1, sz:1 \}/.test(src), 'props state carries sx/sy/sz');
assert(/o\.position\.set\(s\.px,s\.py,s\.pz\); o\.scale\.set\(s\.sx,s\.sy,s\.sz\);/.test(src), 'props apply() sets per-axis scale (no setScalar)');
assert(/this\.state\.sx=o\.scale\.x; this\.state\.sy=o\.scale\.y; this\.state\.sz=o\.scale\.z;/.test(src), 'props sync() reads all three scale axes');

// setSelScale (gizmo) keeps the per-axis state fields current
assert(/ps\.sx=v\.x; ps\.sy=v\.y; ps\.sz=v\.z;/.test(src), 'setSelScale writes per-axis scale state');

// gizmo drag-end pushes the result back into the sliders (mouse + touch)
// This asked for TWO copies of the sync, one per input — build 1280's own lesson, that a test which counts
// copies of a thing is a test of the copying: it would have gone green against two copies that had drifted
// apart. Build 1444 gave both inputs ONE press chain, so the property is now asserted directly.
const dragEnd = (src.match(/if\(_wg\)\{ const tg=editorTargets\[editorActive\]; if\(tg && typeof tg\.sync==='function'\) tg\.sync\(\); if\(typeof updateFieldDisplays==='function'\) updateFieldDisplays\(\); \}/g)||[]).length;
assert(dragEnd === 1, 'gizmo drag-end re-syncs the fields, in exactly one place (found '+dragEnd+')');
assert(/function _edPressUp\(e\)\{[\s\S]*?const _wg=gizmoDrag;/.test(src), '...which is _edPressUp');
assert(/if\(e\.button===0\)\{ _edPressUp\(e\);/.test(src), '...reached by the mouse');
assert(/if\(typeof _edPressUp==='function'\) _edPressUp\(e\);/.test(src), '...and by touch');

// proportional toggle: dragging one scale slider scales all three axes (ratio-preserving) when ON
assert(/if\(isScale && scaleProportional && editorActive==='props'\)/.test(src), 'scale sliders respect the proportional toggle');
assert(/tgt\.state\.sx = Math\.max\(0\.00001, tgt\.state\.sx\*ratio\)/.test(src), 'proportional slider scales all axes by the same ratio');

done();
