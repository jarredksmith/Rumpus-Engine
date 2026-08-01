import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 1275: the top-view marquee can select LIGHTS. Laying out a row of lamps is exactly the job the
// marquee exists for and it was the one thing it could not do — worse, every marquee ended with
// `selLights = []`, so box-selecting anything silently threw a light selection away.
//
// The editor's selection is ONE TYPE AT A TIME (activeSel() returns selProps or selLights depending on
// editorActive), and a genuinely mixed selection would mean reworking the gizmo, the group ops and the
// inspector. So the marquee picks the type the box actually CAUGHT.

const fin = extractFunction('_marqueeFinish');

function rig(props, lights, opts = {}) {
  const state = {
    selProps: [], selLights: opts.selLights ? opts.selLights.slice() : [],
    editorActive: opts.active || 'props',
    targets: { props: { idx: -1 }, lights: { idx: -1 } },
    rendered: 0,
  };
  const body = [
    'const _marqueeV = new THREE.Vector3();',
    'let _marqueeOn=true, _marqueeX0=' + (opts.x0 != null ? opts.x0 : 0) + ', _marqueeY0=' + (opts.y0 != null ? opts.y0 : 0) + ', _marqueeEl=null;',
    'let editorDragMoved=false;',
    'let selProps=S.selProps, selLights=S.selLights, editorActive=S.editorActive;',
    'const editorTargets=S.targets;',
    'function activeCam(){ return camera; }',
    'function _groupMembers(o){ return [o]; }',
    'function syncModeToActive(){}',
    'function updateSelectionHighlight(){}',
    'function renderEditorFields(){ S.rendered++; }',
    fin,
    'return function(e){ _marqueeFinish(e); S.selProps=selProps; S.selLights=selLights; S.editorActive=editorActive; };',
  ].join('\n');
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const run = new Function('THREE', 'S', 'camera', 'propModels', 'lightModels', 'renderer', body)(
    THREE, state, camera, props, lights,
    { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) } });
  return { state, run };
}
// an object at world x/z; the ortho camera above maps world [-50,50] onto screen [0,200]
function at(x, z, ud = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.updateMatrixWorld(true);
  Object.assign(g.userData, ud); return g;
}
// a box covering world x,z in [-10,10] -> screen [80,120]
const BOX = { clientX: 120, clientY: 120 };
const boxOpts = { x0: 80, y0: 80 };

{ // THE GAP: working on props, box contains only lamps -> the lamps are selected
  const lampA = at(-5, -5), lampB = at(5, 5);
  const r = rig([], [lampA, lampB], Object.assign({ active: 'props' }, boxOpts));
  r.run(BOX);
  eq(r.state.editorActive, 'lights', 'a box containing only lights switches to the Lights area');
  eq(r.state.selLights.length, 2, '...and selects them all — the row-of-lamps case');
  eq(r.state.targets.lights.idx, 1, '...with a primary set, so the inspector has something to show');
}
{ // props still win when the box contains any
  const propA = at(-5, -5), lamp = at(5, 5);
  const r = rig([propA], [lamp], Object.assign({ active: 'props' }, boxOpts));
  r.run(BOX);
  eq(r.state.editorActive, 'props', 'a box containing props stays on props');
  eq(r.state.selProps.length, 1);
  eq(r.state.selLights.length, 0, '...and a PROP marquee clears the light selection, because only one type can be active');
}
{ // and the reverse: working on lights, a box of props switches to props
  const propA = at(-5, -5);
  const r = rig([propA], [], Object.assign({ active: 'lights' }, boxOpts));
  r.run(BOX);
  eq(r.state.editorActive, 'props', 'a box containing only props switches to Props even from the Lights area');
  eq(r.state.selProps.length, 1);
}
{ // working on lights, a box containing both keeps you on lights — you do not lose your place
  const propA = at(-5, -5), lamp = at(5, 5);
  const r = rig([propA], [lamp], Object.assign({ active: 'lights' }, boxOpts));
  r.run(BOX);
  eq(r.state.editorActive, 'lights', 'the type you are working in wins when the box caught some of them');
  eq(r.state.selLights.length, 1);
}
{ // shift adds to a light selection instead of replacing it
  const a = at(-5, -5), b = at(5, 5), keep = at(300, 300);
  const r = rig([], [a, b, keep], Object.assign({ active: 'lights', selLights: [keep] }, boxOpts));
  r.run(Object.assign({ shiftKey: true }, BOX));
  eq(r.state.selLights.length, 3, 'shift-marquee ADDS lights to the existing selection');
  assert(r.state.selLights.indexOf(keep) >= 0, '...keeping what was already selected');
  const r2 = rig([], [a, b, keep], Object.assign({ active: 'lights', selLights: [keep] }, boxOpts));
  r2.run(BOX);
  eq(r2.state.selLights.length, 2, '...and without shift it replaces');
}
{ // lights outside the box are not caught
  const inside = at(0, 0), outside = at(40, 40);
  const r = rig([], [inside, outside], Object.assign({ active: 'lights' }, boxOpts));
  r.run(BOX);
  eq(r.state.selLights.length, 1, 'only what the box actually covers');
  assert(r.state.selLights[0] === inside);
}
{ // locked and hidden lights dodge it, exactly as props do (build 1036)
  const locked = at(-5, -5, { edLock: true }), hidden = at(0, 0, { edHide: true }), free = at(5, 5);
  const r = rig([], [locked, hidden, free], Object.assign({ active: 'lights' }, boxOpts));
  r.run(BOX);
  eq(r.state.selLights.length, 1, 'a locked or hidden light is not swept up');
  assert(r.state.selLights[0] === free);
}
{ // an empty box on an empty area still clears, and never throws with no light list at all
  const r = rig([], [], Object.assign({ active: 'props' }, boxOpts));
  r.run(BOX);
  eq(r.state.selProps.length, 0, 'an empty box clears the selection (unchanged)');
  const noLights = new Function('THREE', extractFunction('_marqueeFinish') + '; return 1;')(THREE);
  eq(noLights, 1, 'and the function still parses standalone');
  assert(/typeof lightModels!=='undefined'/.test(fin),
    'the light sweep is guarded, so a context without lightModels cannot throw mid-drag');
}
{ // a negligible drag is still a click, not a marquee (unchanged)
  const lamp = at(0, 0);
  const r = rig([], [lamp], Object.assign({ active: 'lights' }, { x0: 118, y0: 118 }));
  r.run({ clientX: 120, clientY: 120 });
  eq(r.state.selLights.length, 0, 'a 2px drag falls through to the click handler as before');
}

done('build 1275: the top-view marquee sweeps lights as well as props — executed through the real _marqueeFinish over a real ortho projection, proving the row-of-lamps case, that props still win a mixed box, that the type you are working in is not taken away from you, shift-add, locked/hidden lights dodging it, and that a prop marquee no longer silently discards a light selection it never looked at');
