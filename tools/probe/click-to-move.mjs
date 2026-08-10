// build 1481 — does a click on the ground actually walk the player there?
//
// Driven through the engine's own mousedown handler and its own frame loop, so what is measured is the
// shipped chain. The same click with the feature OFF is the control in every row.

import { withGame } from './driver.mjs';

const P = (s) => s;

await withGame(async (probe) => {
  const setup = await probe(P(`(function(){
    gameCfg.freeCursor = true; gameCfg.clickMove = true;
    safeExitPointerLock();
    return { nav: NAV.built, cell: NAV.cell, enabled: _cmEnabled() };
  })()`));
  console.log('setup   ', JSON.stringify(setup));

  // WAIT for the nav grid. Without this the first trials refuse because `NAV.built` is false — which is
  // correct behaviour and a completely different reason from the one under test, so the ON/OFF control
  // would be comparing two refusals and proving nothing.
  let nav = false;
  for (let i = 0; i < 40 && !nav; i++) {
    await new Promise(r => setTimeout(r, 500));
    // ...and keep it UNPAUSED while waiting: `safeExitPointerLock` trips the pointerlockchange pause, and a
    // paused frame loop never builds the grid — the wait would time out on a state I created myself.
    await probe(P(`(function(){ paused = false; return { p: paused }; })()`));
    nav = (await probe(P(`(function(){ return { built: !!NAV.built }; })()`))).built;   // an OBJECT: a bare boolean does not survive the round trip
  }
  console.log('nav grid', nav ? 'built' : 'NEVER BUILT — every row below is measuring that, not the feature');

  // click a point on the ground and let the REAL frame loop walk it. One eval per trial: pose, click, then
  // drive real frames, so nothing between round trips can move the camera out from under the ray (1345).
  const walk = (dx, dz, opts) => P(`(function(){
    paused = false;
    ${opts && opts.off ? 'gameCfg.clickMove = false;' : 'gameCfg.clickMove = true;'}
    player.pos.set(0, EYE, 30); player.vel.set(0, 0, 0);
    player.yaw = 0; player.pitch = -0.55;
    camera.position.copy(player.pos); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    _cmCancel();

    // aim the ray at a real world point rather than a guessed pixel
    const target = new THREE.Vector3(${dx}, 0, ${dz});
    const v = target.clone().project(camera);
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    const cx = r.left + (v.x*0.5+0.5)*r.width, cy = r.top + (-v.y*0.5+0.5)*r.height;
    const onScreen = v.x>-1 && v.x<1 && v.y>-1 && v.y<1;

    const from = { x:player.pos.x, z:player.pos.z };
    cv.dispatchEvent(new MouseEvent('mousedown', { button:0, buttons:1, clientX:cx, clientY:cy, bubbles:true }));
    dispatchEvent(new MouseEvent('mouseup', { button:0, buttons:0, bubbles:true }));
    const armed = _cmOn, goal = { x:+_cmGoalX.toFixed(2), z:+_cmGoalZ.toFixed(2) };
    return { onScreen, armed, goal, from };
  })()`);

  const settle = (frames) => P(`(function(){
    const a = { x:player.pos.x, z:player.pos.z };
    return new Promise(res=>{
      let n = 0;
      const step = ()=>{ if(++n >= ${frames}) return res({
        moved:+Math.hypot(player.pos.x-a.x, player.pos.z-a.z).toFixed(2),
        at:[+player.pos.x.toFixed(1), +player.pos.z.toFixed(1)],
        toGoal:+Math.hypot(player.pos.x-_cmGoalX, player.pos.z-_cmGoalZ).toFixed(2),
        stillOn:_cmOn });
        requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  })()`);

  console.log('ON  click (0,10):', JSON.stringify(await probe(walk(0, 10))));
  console.log('    after frames:', JSON.stringify(await probe(settle(40))));

  console.log('OFF click (0,10):', JSON.stringify(await probe(walk(0, 10, { off:true }))));
  console.log('    after frames:', JSON.stringify(await probe(settle(40))));

  console.log('ON  again      :', JSON.stringify(await probe(walk(0, 10))));
  console.log('    after frames:', JSON.stringify(await probe(settle(40))));

  // a key press takes control straight back
  const keyed = await probe(P(`(function(){
    paused = false; gameCfg.clickMove = true;
    player.pos.set(0, EYE, 30); player.vel.set(0,0,0);
    _cmGoalX = 0; _cmGoalZ = 10; _cmOn = true; _cmAgent.pos = player.pos; _cmAgent.path = null; _cmAgent.pathT = 0;
    _botRepath(_cmAgent, 0, 10, 0);
    const before = _cmOn;
    keys[BINDS.back] = true;
    return new Promise(res=>{ let n=0; const step=()=>{ if(++n>=6){ keys[BINDS.back]=false;
      return res({ before, after:_cmOn }); } requestAnimationFrame(step); }; requestAnimationFrame(step); });
  })()`));
  console.log('a key press    :', JSON.stringify(keyed));

  // a click on a CLICKABLE prop must not also be a move order
  const propWins = await probe(P(`(function(){
    paused = false; gameCfg.clickMove = true;
    spawnProp('box', [0,0,0, 0,0,0, 2,2,2]);
    const o = propModels[propModels.length-1];
    o.userData.tag='door'; o.userData.signals=[{ when:'clicked', do:'emit', text:'opened' }];
    o.position.set(0, 1.7, 24); o.updateMatrixWorld(true);
    logicGraph.nodes = [ { id:'e', type:'event', x:0, y:0, p:{ name:'opened' } },
                         { id:'s', type:'setvar', x:200, y:0, p:{ name:'opened', value:'1' } } ];
    logicGraph.wires = [ { a:'e', o:0, b:'s', i:0 } ];
    logicStart(); logicVars.opened = 0;
    player.pos.set(0, EYE, 30); player.yaw=0; player.pitch=0;
    camera.position.copy(player.pos); camera.rotation.set(0,0,0,'YXZ'); camera.updateMatrixWorld(true);
    _cmCancel();
    const v = o.position.clone().project(camera);
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('mousedown', { button:0, buttons:1,
      clientX: r.left + (v.x*0.5+0.5)*r.width, clientY: r.top + (-v.y*0.5+0.5)*r.height, bubbles:true }));
    dispatchEvent(new MouseEvent('mouseup', { button:0, buttons:0, bubbles:true }));
    return { opened:+logicVars.opened||0, movedOrder:_cmOn };
  })()`));
  console.log('prop wins      :', JSON.stringify(propWins));

  // the sky is not a destination
  const sky = await probe(P(`(function(){
    paused = false; gameCfg.clickMove = true; _cmCancel();
    player.pitch = 0.9; camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('mousedown', { button:0, buttons:1,
      clientX: r.left + r.width/2, clientY: r.top + 6, bubbles:true }));
    dispatchEvent(new MouseEvent('mouseup', { button:0, buttons:0, bubbles:true }));
    return { armed:_cmOn };
  })()`));
  console.log('clicked the sky:', JSON.stringify(sky));
}, { headless: true });
