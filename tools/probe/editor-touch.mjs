// build 1312 (editor audit 4.6) — "Top view pan is mousedown button 1/2 and zoom is `wheel` -> top view is
// unreachable on a phone, and with it the marquee, which is top-view only. A touch creator has no
// multi-select at all beyond the outliner. No pinch-zoom anywhere in the viewport."
//
// Dispatches REAL TouchEvents at the real canvas and reads the real camera state back. A synthetic event is
// the right instrument here: the handler under test reads only `e.touches[].clientX/Y`, which is exactly
// what a browser delivers, and it lets the sweep be deterministic.
import { withGame } from './driver.mjs';

const TOUCH = `
window.__touch = (type, pts) => {
  const el = renderer.domElement;
  const mk = (p,i) => { try{ return new Touch({ identifier:i, target:el, clientX:p[0], clientY:p[1] }); }
                        catch(e){ return { identifier:i, target:el, clientX:p[0], clientY:p[1] }; } };
  const list = pts.map(mk);
  let ev;
  try{ ev = new TouchEvent(type, { touches:list, targetTouches:list, changedTouches:list, bubbles:true, cancelable:true }); }
  catch(e){ ev = new Event(type, { bubbles:true, cancelable:true }); ev.touches=list; ev.targetTouches=list; ev.changedTouches=list; }
  el.dispatchEvent(ev);
  return true;
};
'ready'`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    if(typeof toggleEditor==='function' && !editorOpen) toggleEditor();
    ${TOUCH};
    return { editorOpen:!!editorOpen, hasTouchEvent: (typeof TouchEvent!=='undefined') };
  })()`)));
  await page.waitForTimeout(600);

  console.log('\\n--- TOP VIEW ---');
  console.log('enter top :', JSON.stringify(await P(`(function(){
    editorTopView = true; editorFreeFly = false; topPanX = 0; topPanZ = 0; topZoom = 200;
    return { topZoom:+topZoom.toFixed(1), panX:topPanX, panZ:topPanZ };
  })()`)));

  console.log('2-finger pan right+down 100px:', JSON.stringify(await P(`(function(){
    __touch('touchstart', [[300,300],[400,300]]);
    __touch('touchmove',  [[400,400],[500,400]]);     /* centroid +100x +100y, distance unchanged */
    __touch('touchend',   []);
    return { panX:+topPanX.toFixed(2), panZ:+topPanZ.toFixed(2), zoom:+topZoom.toFixed(1) };
  })()`)));

  console.log('pinch OUT (x2) -> zoom in   :', JSON.stringify(await P(`(function(){
    topPanX = 0; topPanZ = 0; topZoom = 200;
    __touch('touchstart', [[300,300],[400,300]]);     /* 100 px apart */
    __touch('touchmove',  [[250,300],[450,300]]);     /* 200 px apart, same centroid */
    __touch('touchend',   []);
    return { zoom:+topZoom.toFixed(1), panMoved:(topPanX!==0||topPanZ!==0) };
  })()`)));

  console.log('pinch IN  (x0.5) -> zoom out:', JSON.stringify(await P(`(function(){
    topZoom = 200;
    __touch('touchstart', [[250,300],[450,300]]);
    __touch('touchmove',  [[300,300],[400,300]]);
    __touch('touchend',   []);
    return { zoom:+topZoom.toFixed(1) };
  })()`)));

  console.log('zoom clamps               :', JSON.stringify(await P(`(function(){
    topZoom = 200; for(let i=0;i<40;i++){ __touch('touchstart', [[300,300],[400,300]]); __touch('touchmove', [[200,300],[500,300]]); __touch('touchend', []); }
    const zin = +topZoom.toFixed(2);
    topZoom = 200; for(let i=0;i<40;i++){ __touch('touchstart', [[200,300],[500,300]]); __touch('touchmove', [[300,300],[400,300]]); __touch('touchend', []); }
    return { floor:zin, ceiling:+topZoom.toFixed(1), cap:+Math.max(110, ARENA*1.3).toFixed(1) };
  })()`)));

  console.log('\\n--- PERSPECTIVE ---');
  console.log('2-finger drag -> look     :', JSON.stringify(await P(`(function(){
    editorTopView = false; editorFreeFly = true;
    player.yaw = 0; player.pitch = 0; flyPos.set(0,5,0);
    __touch('touchstart', [[300,300],[400,300]]);
    __touch('touchmove',  [[350,320],[450,320]]);
    __touch('touchend',   []);
    return { yaw:+player.yaw.toFixed(4), pitch:+player.pitch.toFixed(4), flyMoved:(flyPos.x!==0||flyPos.z!==0) };
  })()`)));

  console.log('pinch -> dolly, symmetric :', JSON.stringify(await P(`(function(){
    player.yaw = 0; player.pitch = 0; flyPos.set(0,5,0);
    __touch('touchstart', [[300,300],[400,300]]); __touch('touchmove', [[250,300],[450,300]]); __touch('touchend', []);
    const fwd = +flyPos.z.toFixed(3);
    flyPos.set(0,5,0); player.yaw = 0; player.pitch = 0;
    __touch('touchstart', [[250,300],[450,300]]); __touch('touchmove', [[300,300],[400,300]]); __touch('touchend', []);
    const back = +flyPos.z.toFixed(3);
    return { forward:fwd, backward:back, symmetric: Math.abs(Math.abs(fwd)-Math.abs(back)) < 0.01 };
  })()`)));

  console.log('pitch clamps              :', JSON.stringify(await P(`(function(){
    player.pitch = 0;
    for(let i=0;i<60;i++){ __touch('touchstart', [[300,300],[400,300]]); __touch('touchmove', [[300,100],[400,100]]); __touch('touchend', []); }
    const up = +player.pitch.toFixed(3);
    for(let i=0;i<120;i++){ __touch('touchstart', [[300,300],[400,300]]); __touch('touchmove', [[300,500],[400,500]]); __touch('touchend', []); }
    return { maxUp:up, maxDown:+player.pitch.toFixed(3) };
  })()`)));

  console.log('\\n--- ONE FINGER IS UNTOUCHED ---');
  console.log('single touch does nothing :', JSON.stringify(await P(`(function(){
    editorTopView = true; topPanX = 7; topPanZ = -3; topZoom = 200;
    __touch('touchstart', [[300,300]]);
    __touch('touchmove',  [[420,380]]);
    __touch('touchend',   []);
    return { panX:topPanX, panZ:topPanZ, zoom:topZoom, unchanged:(topPanX===7 && topPanZ===-3 && topZoom===200) };
  })()`)));

  console.log('outside the editor        :', JSON.stringify(await P(`(function(){
    const wasOpen = editorOpen; if(typeof toggleEditor==='function' && editorOpen) toggleEditor();
    const z0 = topZoom, px0 = topPanX;
    __touch('touchstart', [[300,300],[400,300]]);
    __touch('touchmove',  [[250,400],[450,400]]);
    __touch('touchend',   []);
    const r = { zoomUnchanged: topZoom===z0, panUnchanged: topPanX===px0 };
    if(wasOpen && typeof toggleEditor==='function' && !editorOpen) toggleEditor();
    return r;
  })()`)));
}, { settleMs: 9000 });
