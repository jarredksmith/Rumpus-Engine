// build 1479 — does a real mouse click on a real prop fire its signal?
//
// Driven with a real MouseEvent through the engine's own window-level mousedown handler, so what is measured
// is the shipped chain rather than a call to the resolver.
//
// THE LAYOUT IS THE EXPERIMENT. The clickable prop is placed OFF-CENTRE and a non-clickable one DEAD AHEAD,
// so the two cursor modes cannot give the same answer:
//   captured -> the ray goes through screen centre, hits the plain prop, and nothing fires whatever I click
//   free     -> the ray follows the pointer, so clicking the off-centre prop fires and the plain one does not

import { withGame } from './driver.mjs';

const P = (s) => s;

await withGame(async (probe) => {
  const setup = await probe(P(`(function(){
    const mk = (tag, clickable, x) => {
      spawnProp('box', [0,0,0, 0,0,0, 2,2,2]);
      const o = propModels[propModels.length-1];
      o.userData.tag = tag;
      o.userData.signals = [{ when: clickable ? 'clicked' : 'damaged', do:'emit', text:'fired_'+tag }];
      o.position.set(200 + x, 1.7, 194); o.updateMatrixWorld(true);
      return o;
    };
    // build 1323: put the fixture where NOTHING ELSE LIVES — the stock level has 59 props, and my
    // first run resolved every click to one of them standing between the camera and the target.
    player.pos.set(200, EYE, 200); player.yaw = 0; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, 0, 0); camera.updateMatrixWorld(true);

    mk('clicky', true, 3.2);    // OFF-CENTRE and clickable
    mk('plain', false, 0);      // DEAD AHEAD and not

    logicGraph.nodes = [ { id:'e1', type:'event', x:0, y:0,   p:{ name:'fired_clicky' } },
                         { id:'s1', type:'setvar', x:200, y:0,   p:{ name:'clicked', value:'1' } },
                         { id:'e2', type:'event', x:0, y:120, p:{ name:'fired_plain' } },
                         { id:'s2', type:'setvar', x:200, y:120, p:{ name:'plainfired', value:'1' } } ];
    logicGraph.wires = [ { a:'e1', o:0, b:'s1', i:0 }, { a:'e2', o:0, b:'s2', i:0 } ];
    logicStart();
    return { props: propModels.length, gameOn: gameOn };
  })()`));
  console.log('setup    ', JSON.stringify(setup));

  // a click AT a named prop's own projected screen point. `firing` is read BEFORE the mouseup that clears
  // it — my first draft read it after and it was false in every row, which is not a measurement.
  const clickAt = (tag) => P(`(function(){
    logicVars.clicked = 0; logicVars.plainfired = 0; firing = false;
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    const o = propModels.find(x => x && x.userData && x.userData.tag === '${tag}');
    const v = o.position.clone().project(camera);
    const cx = r.left + (v.x*0.5+0.5)*r.width, cy = r.top + (-v.y*0.5+0.5)*r.height;
    cv.dispatchEvent(new MouseEvent('mousedown', { button:0, buttons:1, clientX:cx, clientY:cy, bubbles:true }));
    const firingNow = !!firing;
    dispatchEvent(new MouseEvent('mouseup', { button:0, buttons:0, bubbles:true }));
    // which prop the ray actually reached, so a null row says WHY rather than only that nothing happened
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(document.pointerLockElement ? 0 : ((cx - r.left)/r.width)*2-1,
                                       document.pointerLockElement ? 0 : -((cy - r.top)/r.height)*2+1), camera);
    rc.far = 60;
    const h = _firstSolidHit(rc.intersectObjects(propModels.filter(Boolean), true));
    let hitObj = h && h.object; while(hitObj && propModels.indexOf(hitObj) < 0) hitObj = hitObj.parent;
    return { locked: !!document.pointerLockElement, at:[Math.round(cx), Math.round(cy)],
             ray: hitObj ? (hitObj.userData.tag || '(untagged prop)') : '(nothing)',
             clickFired: +logicVars.clicked||0, plainFired: +logicVars.plainfired||0, shotFired: firingNow };
  })()`);

  // forward is (-sin yaw, -cos yaw), so facing a point from the camera is atan2(-dx, -dz)
  // ONE eval: the fixture sits outside the arena where there is no ground, so the player falls between
  // round trips and a camera posed in a previous call is not the camera the ray is cast from (build 1345 —
  // know who else writes what you are setting).
  const aimThenClick = (aim, at) => P(`(function(){
    /* place AND aim in the same block: the fixture sits outside the arena, so there is no ground under it
       and the player falls between round trips — a camera posed in a previous eval is metres below the one
       the ray is cast from. Pitch matters for the same reason, so it is solved rather than left at 0. */
    { player.pos.set(200, EYE, 200); player.vel.set(0, 0, 0);
      camera.position.copy(player.pos);
      const o = propModels.find(x => x && x.userData && x.userData.tag === '${aim}');
      const dx = o.position.x - camera.position.x, dy = o.position.y - camera.position.y,
            dz = o.position.z - camera.position.z, L = Math.hypot(dx, dy, dz);
      player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.asin(dy / L);
      camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true); }
    return (${clickAt(at)});
  })()`);

  console.log('CAPTURED (the crosshair IS the cursor):');
  console.log('  aimed at it              ', JSON.stringify(await probe(aimThenClick('clicky', 'clicky'))));
  console.log('  aimed away, clicked on it', JSON.stringify(await probe(aimThenClick('plain', 'clicky'))));

  // Free-cursor state, constructed: the lock released and NOT paused. `safeExitPointerLock` alone trips the
  // pointerlockchange pause (build 1467's own note), which is a different state from the one this feature
  // runs in — gameCfg.freeCursor never TAKES the lock, so the game is live with a free pointer.
  await probe(P(`(function(){ safeExitPointerLock(); return 1; })()`));
  await new Promise(r => setTimeout(r, 400));
  await probe(P(`(function(){ paused = false; return { paused: paused, locked: !!document.pointerLockElement }; })()`));

  console.log('FREE cursor:');
  console.log('  clicky ', JSON.stringify(await probe(clickAt('clicky'))));
  console.log('  plain  ', JSON.stringify(await probe(clickAt('plain'))));
  console.log('  control', JSON.stringify(await probe(clickAt('clicky'))));

  const sky = await probe(P(`(function(){
    logicVars.clicked = 0;
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('mousedown', { button:0, buttons:1,
      clientX: r.left + 4, clientY: r.top + 4, bubbles:true }));
    dispatchEvent(new MouseEvent('mouseup', { button:0, buttons:0, bubbles:true }));
    return { clickFired: +logicVars.clicked||0 };
  })()`));
  console.log('  sky    ', JSON.stringify(sky));

  // the gate: a click must not reach the world through an open modal
  const modal = await probe(P(`(function(){
    hudWidgets.length = 0;
    hudWidgets.push(_sanitizeHudWidgets([{ kind:'text', id:'t', label:'SHOP', anchor:'tc', modal:'shop' }])[0]);
    _hwRev++; _modalSet('shop');
    logicVars.clicked = 0;
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    const o = propModels.find(x => x && x.userData && x.userData.tag === 'clicky');
    const v = o.position.clone().project(camera);
    cv.dispatchEvent(new MouseEvent('mousedown', { button:0, buttons:1,
      clientX: r.left + (v.x*0.5+0.5)*r.width, clientY: r.top + (-v.y*0.5+0.5)*r.height, bubbles:true }));
    dispatchEvent(new MouseEvent('mouseup', { button:0, buttons:0, bubbles:true }));
    const out = { modalOpen:_modalOpen, clickFired: +logicVars.clicked||0 };
    _modalSet('');
    return out;
  })()`));
  console.log('  modal  ', JSON.stringify(modal));

  console.log('AFTER the modal closes (the control returns):');
  console.log('  clicky ', JSON.stringify(await probe(clickAt('clicky'))));
}, { headless: true });
