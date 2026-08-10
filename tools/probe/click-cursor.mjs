// build 1480 — does the cursor actually change over a clickable prop?
//
// The claim is about what the BROWSER PAINTS, so it is read off `getComputedStyle(canvas).cursor` rather
// than off the flag that drives it. A non-clickable prop at the same distance is the control in every row,
// and the run returns to it at the end.

import { withGame } from './driver.mjs';

const P = (s) => s;

await withGame(async (probe) => {
  const setup = await probe(P(`(function(){
    const mk = (tag, clickable, x) => {
      spawnProp('box', [0,0,0, 0,0,0, 2,2,2]);
      const o = propModels[propModels.length-1];
      o.userData.tag = tag;
      o.userData.signals = [{ when: clickable ? 'clicked' : 'damaged', do:'emit', text:'e_'+tag }];
      o.position.set(200 + x, 1.7, 194); o.updateMatrixWorld(true);
      return o;
    };
    mk('clicky', true, 3.2);
    mk('plain', false, 0);
    // free-cursor state: the lock released and the game live, which is what gameCfg.freeCursor produces
    safeExitPointerLock();
    return { props: propModels.length };
  })()`));
  console.log('setup   ', JSON.stringify(setup));
  await new Promise(r => setTimeout(r, 400));

  // place, aim, move the pointer and read the PAINTED cursor — all in one eval, because the fixture sits
  // outside the arena where there is no ground and the player falls between round trips (build 1345)
  const hover = (tag, extra) => P(`(function(){
    paused = false;
    player.pos.set(200, EYE, 200); player.vel.set(0, 0, 0);
    camera.position.copy(player.pos);
    const o = propModels.find(x => x && x.userData && x.userData.tag === '${tag}');
    const dx = o.position.x - camera.position.x, dy = o.position.y - camera.position.y,
          dz = o.position.z - camera.position.z, L = Math.hypot(dx, dy, dz);
    player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.asin(dy / L);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    ${extra || ''}
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    const v = o.position.clone().project(camera);
    _clkMx = r.left + (v.x*0.5+0.5)*r.width; _clkMy = r.top + (-v.y*0.5+0.5)*r.height;
    // drive the real tick past both throttles
    for(let i = 0; i < 64; i++) _clkHoverTick();
    return { any:_clkAny, hot:_clkHot, bodyClass: document.body.classList.contains('clickHot'),
             painted: getComputedStyle(cv).cursor, locked: !!document.pointerLockElement };
  })()`);

  console.log('clicky  ', JSON.stringify(await probe(hover('clicky'))));
  console.log('plain   ', JSON.stringify(await probe(hover('plain'))));
  console.log('control ', JSON.stringify(await probe(hover('clicky'))));

  // a modal must take the cue down: a click there does not reach the world, so the cursor must not claim it
  console.log('modal   ', JSON.stringify(await probe(hover('clicky', `
    hudWidgets.length = 0;
    hudWidgets.push(_sanitizeHudWidgets([{ kind:'text', id:'t', label:'SHOP', anchor:'tc', modal:'shop' }])[0]);
    _hwRev++; _modalSet('shop');`))));
  console.log('after   ', JSON.stringify(await probe(hover('clicky', `_modalSet('');`))));

  // and a level with nothing clickable never casts a ray
  const none = await probe(P(`(function(){
    for(const o of propModels){ if(o && o.userData && Array.isArray(o.userData.signals))
      o.userData.signals = o.userData.signals.filter(x => x.when !== 'clicked'); }
    _clkTick = 0; _clkAny = false;
    let casts = 0; const real = _clkResolve;
    _clkResolve = function(){ casts++; return real.apply(this, arguments); };
    for(let i = 0; i < 120; i++) _clkHoverTick();
    _clkResolve = real;
    return { any:_clkAny, hot:_clkHot, raycasts: casts, painted: getComputedStyle(renderer.domElement).cursor };
  })()`));
  console.log('no-click', JSON.stringify(none));
}, { headless: true });
