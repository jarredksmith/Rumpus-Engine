// build 1444 — a finger and a mouse run the same press chain.
//
// The editor audit reported that "single-finger drag does nothing on touch". HALF OF THAT WAS ALREADY
// FALSE, and checking cost nothing: `#tLook`'s editor branch has called `tryGizmoGrab` on press and
// `gizmoDragMove` on move for a long time, so dragging a gizmo handle and tap-to-select both work on a
// tablet today. What was genuinely unreachable is everything ELSE a press can start — the TERRAIN BRUSH
// and the MARQUEE — because that branch knew about the gizmo and nothing else.
//
// This is the second time an audit finding about touch has been partly wrong in the same way: build 1312's
// "taps on the stick half do nothing" turned out to be build 165's deliberate decision, caught by a test
// that was already asserting it. Read the handler before believing the report.
//
// The fix is not a second copy of the priority order. A priority chain is exactly the shape that drifts —
// the day somebody adds a fifth thing a press can claim, one input gets it — so `_edPress*` IS the chain
// and both inputs ask it first.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const down = extractFunction('_edPressDown', src);
const move = extractFunction('_edPressMove', src);
const up = extractFunction('_edPressUp', src);

/* ---- EXECUTED: the chain claims the right thing, in the right order ------------------------------ */
const run = (w) => {
  const out = { calls: [] };
  const log = (n) => (...a) => { out.calls.push(n); return w[n + 'Ret']; };
  const fn = new Function('W', 'OUT', `
    const _log = ${log.toString()};
    let editorDragMoved = false, _brushing = !!W.brushing, _altDupActive = !!W.altDupActive;
    let _marqueeOn = !!W.marqueeOn, gizmoDrag = W.gizmoDrag || null, _altDup = W.altDup || null;
    const terrainBrush = W.terrainBrush || { on:false, mode:'raise' };
    const editorTopView = !!W.topView, editorActive = 'props';
    const editorTargets = { props: { sync: () => OUT.calls.push('sync') } };
    const terrainPointUnderPointer = (e) => { OUT.calls.push('terrainPoint'); return W.overTerrain; };
    const pushUndoSnapshot = () => OUT.calls.push('undo');
    const _brushStroke = () => OUT.calls.push('stroke');
    const tryGizmoGrab = () => { OUT.calls.push('tryGrab'); if(W.grab) gizmoDrag = {}; return !!W.grab; };
    const gizmoDragMove = () => OUT.calls.push('gizmoMove');
    const _pickPropAt = () => W.propUnder || null;
    const _dupPropForDrag = () => OUT.calls.push('dup');
    const _marqueeStart = () => OUT.calls.push('marqueeStart');
    const _marqueeMove = () => OUT.calls.push('marqueeMove');
    const _marqueeFinish = () => OUT.calls.push('marqueeFinish');
    const groundPointUnderPointer = () => ({ x:1, z:2 });
    const _updateBrushRing = () => OUT.calls.push('ring');
    const updateFieldDisplays = () => {};
    const renderEditorFields = () => {};
    const _paintCommit = () => OUT.calls.push('paintCommit');
    let _scatLast = 1;
    ${down} ${move} ${up}
    const e = W.e || { altKey:false, preventDefault(){} };
    const r = W.phase === 'down' ? _edPressDown(e) : W.phase === 'move' ? _edPressMove(e) : _edPressUp(e);
    OUT.dragMoved = editorDragMoved; OUT.brushing = _brushing; OUT.marqueeOn = _marqueeOn;
    OUT.altDupActive = _altDupActive; OUT.gizmoDrag = !!gizmoDrag;
    return r;
  `);
  out.ret = fn(w, out);
  return out;
};

const alt = { altKey: true, preventDefault(){} };

/* the order is the whole point: brush beats gizmo beats alt-dup beats marquee */
{
  const r = run({ phase:'down', terrainBrush:{ on:true, mode:'raise' }, overTerrain:true, grab:true, topView:true });
  eq(r.ret, 'brush', 'a press with the brush live sculpts — it outranks everything else');
  eq(r.brushing, true, '...and arms the stroke');
  assert(r.calls.indexOf('stroke') >= 0 && r.calls.indexOf('tryGrab') < 0,
    '...without also grabbing a gizmo handle');
  assert(r.calls.indexOf('undo') < r.calls.indexOf('stroke'),
    '...taking its undo snapshot BEFORE the first stroke, or the stroke is unundoable');
}
{
  const r = run({ phase:'down', grab:true, topView:true, e:alt, propUnder:{} });
  eq(r.ret, 'gizmo', 'a press on an axis handle grabs it, ahead of the alt-duplicate and the marquee');
  eq(r.gizmoDrag, true, '...and the drag is live');
}
{
  const r = run({ phase:'down', e:alt, propUnder:{}, topView:true });
  eq(r.ret, 'altdup', 'Alt over a prop duplicates, ahead of the marquee');
  eq(r.altDupActive, true, '...and the copy is being dragged');
}
{
  const r = run({ phase:'down', topView:true });
  eq(r.ret, 'marquee', 'in top view a plain press starts a marquee');
}
{
  const r = run({ phase:'down' });
  eq(r.ret, '', 'and in a 3D view a plain press claims NOTHING — so the caller can look, orbit or pan');
  eq(r.dragMoved, false, '...leaving it a clean tap until something moves');
}
{
  // TOUCH SPECIFICALLY: no altKey exists, so that branch is simply never taken — nothing to invent
  const r = run({ phase:'down', propUnder:{}, topView:true, e:{ altKey:false, preventDefault(){} } });
  eq(r.ret, 'marquee', 'a finger over a prop in top view starts a marquee, never an Alt-duplicate');
}

/* the move chain mirrors it exactly */
{
  const r = run({ phase:'move', brushing:true, gizmoDrag:{} });
  eq(r.ret, true, 'a live brush stroke continues, ahead of a gizmo drag');
  assert(r.calls.indexOf('stroke') >= 0 && r.calls.indexOf('gizmoMove') < 0, '...and only that');
  assert(r.calls.indexOf('ring') === 0, 'the brush ring tracks the pointer first, on every move');
}
{
  const r = run({ phase:'move', gizmoDrag:{} });
  eq(r.ret, true, 'a grabbed handle moves');
  assert(r.calls.indexOf('gizmoMove') >= 0, '...through gizmoDragMove');
  eq(r.dragMoved, true, '...and that is never a tap');
}
{
  const r = run({ phase:'move', marqueeOn:true });
  eq(r.ret, true, 'a marquee box follows the pointer');
  assert(r.calls.indexOf('marqueeMove') >= 0, '...through _marqueeMove');
}
{
  const r = run({ phase:'move' });
  eq(r.ret, false, 'and with nothing claimed the move is the caller’s — a look-drag, a pan or an orbit');
  eq(r.dragMoved, false, '...and does not by itself cancel a tap');
}

/* and the release finishes whatever was running */
{
  const r = run({ phase:'up', marqueeOn:true });
  assert(r.calls.indexOf('marqueeFinish') >= 0, 'releasing finishes the marquee — this is where it selects');
}
{
  const r = run({ phase:'up', brushing:true, terrainBrush:{ on:true, mode:'paint' } });
  eq(r.brushing, false, 'releasing ends the stroke');
  assert(r.calls.indexOf('paintCommit') >= 0, '...and a paint stroke commits');
  eq(r.dragMoved, true, '...and a stroke was never a tap, however still the finger was');
}
{
  const r = run({ phase:'up', gizmoDrag:{} });
  eq(r.gizmoDrag, false, 'releasing drops the gizmo drag');
  assert(r.calls.indexOf('sync') >= 0, '...and pushes the result back into the panel fields');
}
{
  const r = run({ phase:'up' });
  eq(r.calls.length, 0, 'and releasing after a clean tap does nothing at all — no stray sync, no undo');
}

/* ---- both inputs reach it, and neither has its own copy -------------------------------------------- */
eq((src.match(/_edPressDown\(e\)/g) || []).length, 3,
  'the chain is asked by the mouse and by the touch pad — and defined once');
eq((src.match(/_edPressMove\(e\)/g) || []).length, 3, '...same for the move half');
eq((src.match(/_edPressUp\(e\)/g) || []).length, 3, '...and the release half');

assert(/if\(_edPressDown\(e\)\) return;/.test(src), 'the mouse asks the chain before it starts a look-drag');
assert(/if\(typeof _edPressDown==='function'\)\{ if\(!_edPressDown\(e\)\) gizmoDrag=null; \}/.test(src),
  'and so does the touch pad — which is the whole build: the brush and the marquee are reachable there now');
assert(/if\(!\(typeof _edPressMove==='function' && _edPressMove\(e\)\)\)\{ touchLookDX\+=dx;/.test(src),
  'a touch move that the chain does not claim is still a look-drag, which is what the pad is for');

// the release must run BEFORE the tap test, or a marquee that just selected thirty props would then be
// read as a clean tap and select the one prop under the finger instead
const iUp = src.indexOf("if(typeof _edPressUp==='function') _edPressUp(e);");
const iTap = src.indexOf("if(!editorDragMoved){ renderer.domElement.dispatchEvent(new MouseEvent('click'");
assert(iUp >= 0 && iTap > iUp, 'on touch the chain finishes before the clean-tap test');

/* ---- what must NOT have changed --------------------------------------------------------------------- */
// The mouse keeps the three drags only it has; the pad keeps the look-drag only it has.
assert(/editorDragLook = false; editorDragPan = false; _edOrbit = null;/.test(src),
  'the mouse still clears its own look, pan and orbit on release');
assert(!/editorDragLook/.test(down) && !/editorDragPan/.test(down) && !/_edOrbitStart/.test(down),
  'and none of those leaked into the shared chain, which a finger has no use for');
assert(!/touchLookDX/.test(move), 'nor did the pad’s look accumulator');
// MEASURED, and the first draft of this had it wrong: `left:42%` is the IN-PLAY layout. In the editor the
// pad widens to everything but the panel, and the stick — later in the DOM, no z-index — takes back its own
// circle. So a press starts an edit anywhere on a tablet except that circle, which stays the only way a
// touch creator can fly the camera (build 165, confirmed by build 1312 trying to remove it).
assert(/#tLook \{ position:absolute; right:0; top:0; bottom:0; left:42%;/.test(html),
  'the in-play layout keeps the left 42% for the movement stick');
assert(/body\.editing #tLook \{ left:0; right:330px; \}/.test(html),
  '...and the EDITOR widens the pad to everything except the panel, which is what makes a press land');
assert(html.indexOf('id="tLook"') < html.indexOf('id="tStick"'),
  '...with the stick painted over it, so its own circle still flies rather than edits');

done('build 1444: the terrain brush and the marquee reach touch — through the SAME press chain the mouse ' +
     'runs, in the same order, so the two inputs cannot drift; the gizmo drag and tap-to-select the audit ' +
     'reported broken were already working, and that half of the finding is recorded as wrong');
