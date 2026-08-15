// build 1505 — the pause button shows only where something can press it, measured on the real
// computed style through the real frame loop. The pointer-lock input is controlled via a
// configurable getter (the async exitPointerLock dance both pauses the game — build 1467's
// handler — and tests the browser rather than our code; the getter controls the INPUT the
// expression reads, like faking isTouch).
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(30); return 1; })()`);

  const READ = `
    const pb = document.getElementById('pauseBtn');
    return { disp: pb ? getComputedStyle(pb).display : 'missing', pbShow: _pbShow,
             locked: !!document.pointerLockElement, touch: isTouch, paused: paused, gameOn: gameOn };`;

  const boot = await P('(function(){' + READ + '})()');
  console.log('boot state', JSON.stringify(boot), ' <- whatever the headless session holds');

  /* row 1 — the report: pointer LOCKED, live desktop play -> hidden */
  const locked = await P(`(function(){
    Object.defineProperty(document, 'pointerLockElement', { get: () => window.__fakeLock || null, configurable: true });
    window.__fakeLock = document.body; isTouch = false;
    __drive(3); ${READ}
  })()`);
  console.log('LOCKED play', JSON.stringify(locked), ' <- the report: hidden');

  /* row 2 — a real free pointer (freeCursor level / released lock) -> shown */
  const free = await P(`(function(){ window.__fakeLock = null; __drive(3); ${READ} })()`);
  console.log('FREE pointer', JSON.stringify(free), ' <- clickable, so shown');

  /* row 3 — paused hides it even with a free pointer. Cannot go through __drive (it clears the UI
     gates at its head, by design) or real frames (the rig holds _tabHidden, and loop() returns there
     BEFORE the visibility block). A manual mini-drive keeps the gate: neutralise draw + rAF re-arm,
     drop _tabHidden, run the real loop with paused held true. */
  const MINI = `
    const rr = renderer.render, raf = window.requestAnimationFrame, th = _tabHidden;
    renderer.render = function(){}; window.requestAnimationFrame = function(){ return 0; }; _tabHidden = false;
    try { loop(); loop(); } finally { renderer.render = rr; window.requestAnimationFrame = raf; _tabHidden = th; }`;
  const pz = await P(`(function(){ openPause(); ${MINI} ${READ} })()`);
  console.log('paused    ', JSON.stringify(pz), ' <- the menu owns the screen');
  const rz = await P(`(function(){ resumeGame(); ${MINI} ${READ} })()`);
  console.log('resumed   ', JSON.stringify(rz), ' <- back');

  /* row 4 — touch keeps its only pause control even with the lock held */
  const tch = await P(`(function(){ isTouch = true; window.__fakeLock = document.body; __drive(3); ${READ} })()`);
  console.log('TOUCH+lock', JSON.stringify(tch), ' <- a finger can always press it');

  /* row 5 — the control returns: desktop + lock -> hidden again */
  const ctl = await P(`(function(){ isTouch = false; __drive(3); ${READ} })()`);
  console.log('control   ', JSON.stringify(ctl), ' <- locked desktop hidden again');

  await P(`(function(){ delete document.pointerLockElement; window.__fakeLock = undefined; __release(); return 1; })()`);
}, { headless: true });
