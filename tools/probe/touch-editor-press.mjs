// Can a finger sculpt terrain and marquee-select in the editor?
//
// The audit said "single-finger drag does nothing on touch". Half of that was already false — the #tLook
// pad has called tryGizmoGrab and gizmoDragMove for a long time — so this drives REAL PointerEvents at the
// real pad and reports what each gesture actually reached, rather than trusting either the report or me.
//
// Every gesture has a control: the same drag with the editor closed must do nothing at all.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(34) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    /* deliberately NOT paused: loop() early-returns past the camera chain while a UI gate is up, so the
       top orthographic camera is never positioned and every terrain raycast misses the floor from y=0.
       Nothing measured here is perturbed by the simulation running — a selection count, a DOM rect and a
       terrain height at a fixed world point. */
    /* the pad is only in the DOM for a touch session; build 165 keeps it in the editor on purpose */
    isTouch = true; document.body.classList.add('touch');
    if(!editorOpen) toggleEditor();
    /* #touchUI is display:none until the frame manager shows it, and that wants gameOn — so the pad had a
       ZERO rect on the first run. Dispatching straight at the element still exercised the handlers, but it
       would have proven nothing about whether a real finger LANDS there, so show it and measure. */
    const tu = document.getElementById('touchUI'); if(tu) tu.style.display = 'block';
    const look = document.getElementById('tLook');
    const r = look && look.getBoundingClientRect();
    /* The editing override widens the pad to everything but the 330px panel, and the stick — later in the
       DOM, no z-index — takes back its own circle. So the pad is NOT the right 58% here, which is what the
       first draft of this probe assumed. (No backticks in this comment: it lives inside a template
       literal, and that has closed one eleven times now.) */
    return { build: BUILD_VERSION, editorOpen, pad: r ? [r.left|0, r.top|0, r.width|0, r.height|0] : null,
             viewport: [innerWidth, innerHeight] };
  })()`));

  /* The top camera is positioned by the FRAME LOOP, not by renderScene — the first run switched to top
     view and raycast in the same synchronous eval, so every ray was cast from a camera still at y=0 and
     missed the floor entirely. Switch view, let real frames run, THEN measure. */
  await P(`(function(){ editorTopView = true; topPanX = 0; topPanZ = 0; topZoom = 60; return 1; })()`);
  await new Promise(r => setTimeout(r, 700));
  /* The top camera needs a few real frames after the view switch before its rays reach the floor; the
     brush row below is what proves it did, so no separate readout here — one that samples too early reads
     y=0 and looks like a defect. */
  console.log('\n--- the MARQUEE, which was unreachable on touch -------------------------------------');
  say('top view, drag across props', await P(`(function(){
    editorActive = 'props'; selProps.length = 0;
    const before = selProps.length;
    const w = innerWidth, h = innerHeight;
    /* the pad covers the right 58% — build 165 keeps the left 42% as the movement stick, which is a
       touch creator's only way to fly, so a marquee genuinely cannot start there */
    __drag(w*0.50, h*0.25, w*0.95, h*0.80, 8);
    return { before, after: selProps.length, marqueeLeftOpen: _marqueeOn, dragMoved: editorDragMoved };
  })()`));

  say('CONTROL: editor CLOSED', await P(`(function(){
    const wasTop = editorTopView; toggleEditor();
    selProps.length = 0;
    const w = innerWidth, h = innerHeight;
    __drag(w*0.50, h*0.25, w*0.95, h*0.80, 8);
    const out = { selected: selProps.length, marqueeOn: _marqueeOn };
    toggleEditor(); editorTopView = wasTop;
    return out;
  })()`));

  console.log('\n--- the TERRAIN BRUSH, likewise ------------------------------------------------------');
  say('brush off: a drag does not sculpt', await P(`(function(){
    terrainBrush.on = false;
    const h0 = (typeof terrainHeightAt === 'function') ? terrainHeightAt(0,0) : null;
    const w = innerWidth, hh = innerHeight;
    __drag(w*0.70, hh*0.5, w*0.75, hh*0.55, 6);
    return { before: h0, after: (typeof terrainHeightAt === 'function') ? terrainHeightAt(0,0) : null,
             brushing: _brushing };
  })()`));

  say('brush ON: a drag sculpts', await P(`(function(){
    terrainBrush.on = true; terrainBrush.mode = 'raise';
    if(terrainBrush.size == null) terrainBrush.size = 6;
    if(terrainBrush.strength == null) terrainBrush.strength = 1;
    const w = innerWidth, hh = innerHeight;
    /* aim at whatever world point the pad's centre maps to, then read THAT point back — reading (0,0)
       would be guessing where the drag landed */
    const probe = terrainPointUnderPointer({ clientX: w*0.72, clientY: hh*0.5 });
    const at = probe ? { x:probe.x, z:probe.z } : null;
    const h0 = at ? terrainHeightAt(at.x, at.z) : null;
    __drag(w*0.72, hh*0.5, w*0.74, hh*0.52, 8);
    const h1 = at ? terrainHeightAt(at.x, at.z) : null;
    terrainBrush.on = false;
    return { at, before: h0 != null ? +h0.toFixed(3) : null, after: h1 != null ? +h1.toFixed(3) : null,
             raised: (h0 != null && h1 != null) ? +(h1 - h0).toFixed(3) : null, brushingLeftOpen: _brushing };
  })()`));

  console.log('\n--- and the half the audit got wrong: these already worked ---------------------------');
  say('gizmo grab is still reached', await P(`(function(){
    editorTopView = false;
    let grabbed = 0; const real = tryGizmoGrab;
    tryGizmoGrab = function(e){ grabbed++; return real.apply(this, arguments); };
    const w = innerWidth, hh = innerHeight;
    __drag(w*0.70, hh*0.5, w*0.72, hh*0.52, 3);
    tryGizmoGrab = real;
    return { tryGizmoGrabCalls: grabbed };
  })()`));

  say('a clean tap still selects', await P(`(function(){
    let clicks = 0;
    const h = () => clicks++;
    renderer.domElement.addEventListener('click', h);
    const w = innerWidth, hh = innerHeight;
    __drag(w*0.70, hh*0.5, w*0.70, hh*0.5, 1);   // no movement at all
    renderer.domElement.removeEventListener('click', h);
    return { clickDispatched: clicks };
  })()`));
}, { settleMs: 5000, viewport: { width: 900, height: 700 } });

console.log('');
