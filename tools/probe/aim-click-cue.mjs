// build 1485 — in FIRST PERSON, does the reticle say a prop is clickable?
//
// The headless session holds the pointer lock by default, which for once is the condition under test rather
// than the obstacle it was in build 1484's probe. Every row has the same prop with its `clicked` signal
// REMOVED as the control, because a cue that fires over everything is the same bug as a cue that never fires.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

/* The ring FADES (a 0.12 s CSS transition), and TWO clock faults had to be paid for before that column meant
   anything:
     * `__drive` advances the game's VIRTUAL clock only — no real time passes inside one eval — so the first
       run read opacity 0 in every row, lit ones included: a column measuring the transition's start value.
     * a wall-clock sleep then fixed it INTERMITTENTLY, because a CSS transition advances on FRAMES and
       SwiftShader renders about 1.5 a second. That is build 1344's recorded lesson — a probe that waits in
       wall-clock time is measuring the renderer's speed, not its output.
   So the read POLLS until two consecutive samples agree, and reports how long that took. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);

  const settle = await P(`(function(){ __drive(240);
    return { gameOn, paused, locked: !!document.pointerLockElement,
             ring: !!document.querySelector('#crosshair .xhHot') }; })()`);
  console.log('settled   ', JSON.stringify(settle), ' <- locked TRUE is the view this build is about');

  // a clickable prop planted straight ahead, in a column measured clear of the stock level
  const build = await P(`(function(){
    spawnProp('box', [0,0,0, 0,0,0, 3,3,3]);
    const o = propModels[propModels.length-1];
    o.position.set(60, 0, -55); o.updateMatrixWorld(true); refreshPropCollider(o);
    o.userData.signals = [{ when:'clicked', do:'toast', text:'hi' }];
    window.__box = o;
    // stand back and look straight at it: forward is (-sin yaw, -cos yaw), so yaw = PI faces +Z
    player.pos.set(60, 1.9, -65); player.vel.set(0,0,0); player.yaw = Math.PI; player.pitch = 0;
    __gate(); __drive(30);
    return { at:[o.position.x, o.position.z], clickable: _clkAnyClickable(),
             resolves: !!_clkResolve(0, 0) };
  })()`);
  console.log('the prop  ', JSON.stringify(build), ' <- resolves FALSE and every row below measures that');

  const READ = `(function(){ const b = document.body.classList, r = document.querySelector('#crosshair .xhHot');
    return { clickHot: b.contains('clickHot'), clickHotAim: b.contains('clickHotAim'),
             ringOpacity: r ? +getComputedStyle(r).opacity : null }; })()`;

  const settled = async () => {
    let prev = null;
    for(let i = 0; i < 14; i++){
      await sleep(160);
      const r = await P(READ);
      if(prev && prev.ringOpacity === r.ringOpacity) return Object.assign(r, { settledAfter: i + 1 });
      prev = r;
    }
    return Object.assign(prev || {}, { settledAfter: 'TIMEOUT' });
  };
  const look = async (yaw) => { await P(`(function(){ player.yaw = ${yaw}; __drive(40); return 1; })()`);
                                return settled(); };

  console.log('looking AT:', JSON.stringify(await look('Math.PI')), ' <- lit, at screen centre, pointer LOCKED');
  console.log('looking away:', JSON.stringify(await look(0)), ' <- and off again');

  // THE CONTROL: same prop, same aim, no `clicked` signal
  await P(`(function(){ window.__sig = window.__box.userData.signals;
    window.__box.userData.signals = [{ when:'damaged', do:'toast', text:'hi' }];
    player.yaw = Math.PI; __drive(60); return 1; })()`);
  console.log('the CONTROL:', JSON.stringify(await settled()), ' <- a prop that answers no click never lights it');
  await P(`(function(){ window.__box.userData.signals = window.__sig; __drive(60); return 1; })()`);
  console.log('  ...restored:', JSON.stringify(await settled()));

  // a blocking UI drops it, and the reticle cue is not the cursor cue
  await P(`(function(){ _modalOpen = 'x'; __drive(8); return 1; })()`);
  console.log('a modal   :', JSON.stringify(await settled()), ' <- a blocking UI drops it');
  await P(`(function(){ _modalOpen = ''; __drive(8); return 1; })()`);
  console.log('  ...closed :', JSON.stringify(await settled()));

  await P(`(function(){ removeProp(propModels.indexOf(window.__box)); __release(); return 1; })()`);
}, { headless: true });
