// build 1502 — the deploy radial declines to open in a level that opted out, on every input door.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  /* control first: the default level still opens the radial on Tab */
  const c = await P(`(function(){
    dispatchEvent(new KeyboardEvent('keydown', { code:'Tab', bubbles:true, cancelable:true }));
    const r1 = radialOpen;
    dispatchEvent(new KeyboardEvent('keyup', { code:'Tab', bubbles:true }));
    if(typeof buildMode!=='undefined' && buildMode && typeof exitBuildMode==='function') exitBuildMode();
    return { defaultOn: gameCfg.buildMenu, opened: r1, closedAfter: radialOpen };
  })()`);
  console.log('control  ', JSON.stringify(c), ' <- default ON, Tab opens as always');

  /* the level opts out: Tab, the pad path and the touch button all go dead */
  const r = await P(`(function(){
    gameCfg.buildMenu = false;
    dispatchEvent(new KeyboardEvent('keydown', { code:'Tab', bubbles:true, cancelable:true }));
    const tab = radialOpen;
    dispatchEvent(new KeyboardEvent('keyup', { code:'Tab', bubbles:true }));
    openRadial();                                     // the pad and touch doors both end here
    const direct = radialOpen;
    /* the button lives in _touchCtxTick, gated on isTouch — fake the device for one tick */
    const _wasTouch = isTouch; isTouch = true; _tcxAt = 0; _touchCtxTick(performance.now()); isTouch = _wasTouch;
    const tb = document.getElementById('tBuild');
    return { tab, direct, tBuildShown: !!(tb && tb.style.display !== 'none') };
  })()`);
  console.log('opted out', JSON.stringify(r), ' <- nothing opens, the BUILD button is gone');

  /* it is level data: serialize -> restore keeps the off, and an old file stays ON */
  const r2 = await P(`(function(){
    const lv = serializeLevel();
    const emitted = lv.game.buildMenu;
    gameCfg.buildMenu = true;                          // dirty it so the restore has to land
    restoreLevel(JSON.parse(JSON.stringify(lv)));
    const off = gameCfg.buildMenu;
    const legacy = JSON.parse(JSON.stringify(lv)); delete legacy.game.buildMenu;
    restoreLevel(legacy);
    return { emitted, restoredOff: off, legacyOn: gameCfg.buildMenu };
  })()`);
  console.log('the file ', JSON.stringify(r2), ' <- false round-trips; an absent key means ON');

  /* and back on: the same level, one flag, the radial returns */
  const r3 = await P(`(function(){
    gameCfg.buildMenu = true; openRadial(); const on = radialOpen; if(on) closeRadial(false);
    return { reopens: on };
  })()`);
  console.log('back on  ', JSON.stringify(r3), ' <- the control returns');

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
