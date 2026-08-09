// build 1467 — a free mouse cursor, asked for from play:
// "maybe a gameplay that allows point-click type navigation (which isn't possible today as the mouse is
// always the camera control) so that on-screen elements could be clicked."
//
// The claim to verify BEFORE the fix: it is not merely that the mouse is the camera in first person. The
// twin-stick and top-down views already draw a cursor — but it is a VIRTUAL one accumulated from
// pointer-locked movement deltas, so there is no OS pointer in any view and no DOM element is clickable
// anywhere in play.
//
// The control at every step is the SAME level with freeCursor off.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    /* a HUD button is the thing a creator wants clickable — build 1255's widget */
    /* the field is named event, not ev — _hwFire reads w.event. Read the consumer, do not guess. */
    hudWidgets = [{ id:'btn1', kind:'button', x:50, y:50, text:'PLAY CARD', event:'CARD', size:16 }];
    logicGraph.nodes = [
      { id:'e1', type:'event', x:0, y:0, p:{ name:'CARD' } },
      { id:'v1', type:'setvar', x:0, y:0, p:{ name:'played', value:7 } },   /* params are {name, value} */
    ];
    logicGraph.wires = [{ a:'e1', o:0, b:'v1', i:0 }];
    logicStart();
    _hwRev++; _hwRebuild();
    return { gameOn, view: gameCfg.view, widgets: hudWidgets.length, els: _hwEls.length, tag: (_hwEls[0] && _hwEls[0].el && _hwEls[0].el.tagName) || null };
  })()`);

  const state = (label) => P(`(function(){
    const cv = renderer.domElement;
    return { label:${JSON.stringify(label)},
      view: (typeof _viewNow === 'function') ? _viewNow() : gameCfg.view,
      cursorAim: (typeof cursorAimActive === 'function') ? cursorAimActive() : null,
      freeNow: (typeof _cursorFreeNow === 'function') ? _cursorFreeNow() : null,
      bodyClass: document.body.classList.contains('freeCursor'),
      canvasCursor: getComputedStyle(cv).cursor,
      locked: document.pointerLockElement === cv };
  })()`);

  const setView = (view, free) => P(`(function(){
    gameCfg.view = ${JSON.stringify(view)};
    gameCfg.freeCursor = ${free ? 'true' : 'false'};
    if(typeof _applyFreeCursorClass === 'function') _applyFreeCursorClass();
    return true;
  })()`);

  // 1. the lock is refused, and only when the setting says so
  const lockTest = await P(`(function(){
    const out = {};
    const tryIt = () => { const before = document.pointerLockElement === renderer.domElement;
      try{ tryPointerLock(); }catch(e){}
      return { before, requested: !before }; };
    gameCfg.view = 'top'; gameCfg.freeCursor = false; _applyFreeCursorClass();
    out.offRefuses = null;
    /* the honest test is STRUCTURAL: pointer lock cannot be granted without a user gesture in headless
       Chromium, so "did the lock happen" is unmeasurable. What IS measurable is whether the function
       returns before reaching requestPointerLock — instrument it. */
    let reached = 0;
    const el = renderer.domElement, real = el.requestPointerLock;
    el.requestPointerLock = function(){ reached++; return { catch(){} }; };
    gameCfg.freeCursor = false; _applyFreeCursorClass(); tryPointerLock(); out.withCursorCaptured = reached;
    reached = 0;
    gameCfg.freeCursor = true; _applyFreeCursorClass(); tryPointerLock(); out.withCursorFree = reached;
    reached = 0;
    gameCfg.view = 'fps'; gameCfg.freeCursor = true; _applyFreeCursorClass(); tryPointerLock(); out.freeButFps = reached;
    el.requestPointerLock = real;
    return out;
  })()`);

  const offTop  = await (async () => { await setView('top', false); return state('top, captured'); })();
  const onTop   = await (async () => { await setView('top', true);  return state('top, FREE'); })();
  const onFps   = await (async () => { await setView('fps', true);  return state('fps, free asked'); })();
  const backTop = await (async () => { await setView('top', false); return state('top, captured again'); })();

  // 2. the real pointer drives the aim cursor
  const aim = await P(`(function(){
    gameCfg.view = 'top'; gameCfg.freeCursor = true; _applyFreeCursorClass();
    const cv = renderer.domElement;
    const send = (x, y) => cv.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, clientX:x, clientY:y, movementX:0, movementY:0 }));
    const out = [];
    for(const [x, y] of [[innerWidth*0.5, innerHeight*0.5], [innerWidth*0.75, innerHeight*0.25], [10, 10]]){
      send(x, y);
      out.push({ at:[Math.round(x), Math.round(y)], vc:[Math.round(_vcX), Math.round(_vcY)] });
    }
    /* the CONTROL: with the cursor captured, the same events must move it by their DELTAS (which are 0
       here), not to their position — i.e. nothing moves */
    gameCfg.freeCursor = false; _applyFreeCursorClass();
    const before = [Math.round(_vcX), Math.round(_vcY)];
    send(5, 5);
    const after = [Math.round(_vcX), Math.round(_vcY)];
    gameCfg.freeCursor = true; _applyFreeCursorClass();
    return { out, capturedBefore: before, capturedAfter: after };
  })()`);

  // 3. THE ASK: is a HUD button actually clickable in play?
  const clickable = await P(`(function(){
    const run = (free) => {
      gameCfg.view = 'top'; gameCfg.freeCursor = free; _applyFreeCursorClass();
      logicVars.played = 0; _hwCd.btn1 = 0;   /* the 150 ms per-button cooldown would swallow the second run */
      /* the builder is _hwRebuild and the elements it made are in _hwEls — the first draft guessed a
         data-hw attribute that does not exist and reported the button MISSING in both conditions, which
         is a failed control, not a finding (build 1428) */
      _hwRev++; _hwRebuild();
      const rec = _hwEls.find(n => n && n.el && n.el.textContent === 'PLAY CARD') || _hwEls[0];
      const el = rec && rec.el;   /* _hwEls holds RECORDS ({w, el, ...}), not elements */
      if(!el) return { found:false };
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const top = document.elementFromPoint(cx, cy);
      const hits = !!(top && (top === el || el.contains(top)));
      el.dispatchEvent(new MouseEvent('click', { bubbles:true, clientX:cx, clientY:cy }));
      return { found:true, rect:[Math.round(r.width), Math.round(r.height)],
               pointerEvents: getComputedStyle(el).pointerEvents,
               /* NOT a discriminator: elementFromPoint and a synthetic click ignore pointer lock
                  entirely, so the DOM hit-test passes in both conditions. What actually decides whether a
                  player can click this is whether the pointer is CAPTURED, which the lock test measures.
                  Reported so the next reader does not mistake it for evidence. */
               topmostIsTheButton: hits, played: +logicVars.played || 0 };
    };
    return { free: run(true), captured: run(false) };
  })()`);

  console.log(JSON.stringify({ setup, lockTest, offTop, onTop, onFps, backTop, aim, clickable }, null, 1));
});
