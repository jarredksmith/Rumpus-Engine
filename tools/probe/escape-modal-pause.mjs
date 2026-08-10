// build 1471 — Escape, when there is no pointer lock to give back.
//
// Two claims, and the second is a defect I shipped in build 1467:
//   1. an open modal closes on Escape, before anything behind it gets the key;
//   2. a SOLO player with a free cursor can pause — they had no route to the pause menu at all, because
//      solo pausing has only ever happened as a side effect of releasing the pointer lock.
//
// The events are dispatched on `document` as real KeyboardEvents, so what is measured is the engine's own
// handler chain rather than a function called by name. The CONTROL is the same key in the same session with
// the modal shut and the cursor captured.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    hudWidgets = [
      { id:'keep',  kind:'text', label:'HUD', anchor:'tl', size:16, modal:'' },
      { id:'panel', kind:'text', label:'THE FAIR', anchor:'tc', size:22, modal:'fair' }
    ];
    gameCfg.view = 'top'; gameCfg.freeCursor = true; _applyFreeCursorClass();
    _hwRev++; _hwRebuild(); updateHudWidgets();
    return { gameOn, view:_viewNow(), free:_cursorFreeNow(), members:_modalWidgets('fair') };
  })()`);

  const esc = () => P(`(function(){
    document.dispatchEvent(new KeyboardEvent('keydown', { code:'Escape', key:'Escape', bubbles:true }));
    return true;
  })()`);

  const shot = (label) => P(`(function(){
    const vis = {}; for(const r of _hwEls) if(r && r.el) vis[r.w.id] = r.el.style.display !== 'none';
    return { label:${JSON.stringify(label)}, open:_modalOpen, paused:!!paused,
             backdrop: !!document.getElementById('modalBack'), widgets: vis };
  })()`);

  // ---- 1. an open modal closes on Escape, and the pause menu does NOT open behind it
  await P(`(function(){ paused=false; _modalSet('fair'); updateHudWidgets(); return 1; })()`);
  const modalUp = await shot('modal open');
  await esc();
  const afterEsc = await P(`(function(){ updateHudWidgets(); return { open:_modalOpen, paused:!!paused,
    backdrop: !!document.getElementById('modalBack'),
    widgets: (()=>{ const v={}; for(const r of _hwEls) if(r && r.el) v[r.w.id]=r.el.style.display!=='none'; return v; })() }; })()`);

  // ---- 2. a SECOND Escape, with nothing covering the screen, pauses (the build-1467 hole)
  await esc();
  const afterSecond = await shot('second Escape, nothing open');

  // ---- 3. THE CONTROL: the same key with the cursor CAPTURED must not take this path
  const captured = await P(`(function(){
    paused = false;
    gameCfg.freeCursor = false; _applyFreeCursorClass();
    document.dispatchEvent(new KeyboardEvent('keydown', { code:'Escape', key:'Escape', bubbles:true }));
    const out = { free:_cursorFreeNow(), paused:!!paused };
    gameCfg.freeCursor = true; _applyFreeCursorClass();
    return out;
  })()`);

  // ---- 4. a modal beats a driven car / a mounted turret for the key
  const beatsCar = await P(`(function(){
    paused = false; _modalSet('fair'); updateHudWidgets();
    const wasDriving = !!drivingCar;
    drivingCar = { fake:1 };                       /* enough for the branch's truthiness test */
    document.dispatchEvent(new KeyboardEvent('keydown', { code:'Escape', key:'Escape', bubbles:true }));
    const out = { modalClosed: _modalOpen === '', stillDriving: !!drivingCar, paused: !!paused };
    drivingCar = wasDriving ? drivingCar : null;
    return out;
  })()`);

  // ---- 5. entering the editor closes it, and leaving does not bring it back
  const editorClears = await P(`(function(){
    paused = false; _modalSet('fair'); updateHudWidgets();
    const before = _modalOpen;
    toggleEditor();
    const inEditor = { open:_modalOpen, editorOpen, backdrop: !!document.getElementById('modalBack') };
    toggleEditor();
    updateHudWidgets();
    return { before, inEditor, afterLeaving:_modalOpen, editorOpen };
  })()`);

  console.log(JSON.stringify({ setup, modalUp, afterEsc, afterSecond, captured, beatsCar, editorClears }, null, 1));
});
