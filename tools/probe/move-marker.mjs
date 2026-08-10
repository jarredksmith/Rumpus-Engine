// build 1484 — does the ground answer the click, and do the two answers LOOK different?
//
// The whole build is that a refused click and a click the game never heard stop being identical, so the
// probe is worthless unless it produces BOTH. The refusal is driven through a real engine state — the nav
// grid not built, which is exactly the condition `_cmGoTo` checks and exactly what a player clicking during
// a level load hits — rather than by stubbing the function under test.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);

  const settle = await P(`(function(){ __drive(240);
    return { gameOn, paused, nav: !!(typeof NAV!=='undefined' && NAV.built), locked: !!document.pointerLockElement }; })()`);
  console.log('settled  ', JSON.stringify(settle));

  /* The feature needs both switches AND a free pointer: the handler's second line refuses a captured one,
     so with the lock still held every row below reads `took:false` and measures the lock rather than the
     cue — which is what the first run of this probe did. `exitPointerLock` is ASYNC (it resolves through a
     pointerlockchange event), so the release needs its own round trip before anything is read, and that
     event pauses the game (build 1467's own handler), which `__gate()` then has to clear. */
  await P(`(function(){
    gameCfg.clickMove = true; gameCfg.freeCursor = true;
    if(document.exitPointerLock) document.exitPointerLock();
    return 1; })()`);
  const on = await P(`(function(){
    /* aimed SHALLOW on purpose: the first run looked steeply down, put the destination 1.6 m away, and the
       player arrived before the ping had even finished — so the HOLD row, the one that carries the whole
       success-vs-refusal distinction, measured an empty marker */
    player.pos.set(0, 3, 30); player.vel.set(0, 0, 0); player.pitch = -0.15; player.yaw = 0;
    __gate(); __drive(30);
    return { enabled: _cmEnabled(), locked: !!document.pointerLockElement, paused,
             nav: !!NAV.built, marker: !!_cmMark }; })()`);
  console.log('enabled  ', JSON.stringify(on), ' <- marker false here is the control: nothing exists before a click');

  // one real click at the centre of the canvas, through the shipped handler
  const READ = `(function(m){ return m ? { visible:m.visible, col:'#'+m.material.color.getHexString(),
      op:+m.material.opacity.toFixed(3), scale:+m.scale.x.toFixed(3),
      at:[+m.position.x.toFixed(1), +m.position.y.toFixed(2), +m.position.z.toFixed(1)] } : null; })(_cmMark)`;

  const click = (dx, dy) => `(function(){
    const r = renderer.domElement.getBoundingClientRect();
    const e = { clientX: r.left + r.width*(0.5 + (${dx})), clientY: r.top + r.height*(0.5 + (${dy})) };
    const took = _cmClickGround(e);
    return { took, moving: _cmOn, goalAway: +Math.hypot(player.pos.x-_cmGoalX, player.pos.z-_cmGoalZ).toFixed(1),
             mark: ${READ} };
  })()`;

  const hit = await P(click(0, 0));
  console.log('a good click     :', JSON.stringify(hit));

  const after = await P(`(function(){ __drive(6); return { mark: ${READ}, moving:_cmOn }; })()`);
  console.log('  ...6 frames on :', JSON.stringify(after), ' <- the ping is expanding and fading');

  /* CM_PING_S is 0.42 s = ~25 frames, so 24 more spends the ping exactly and leaves the walk running */
  const held = await P(`(function(){ __drive(24); return { mark: ${READ}, moving:_cmOn,
    dist:+Math.hypot(player.pos.x-_cmGoalX, player.pos.z-_cmGoalZ).toFixed(2) }; })()`);
  console.log('  ...the HOLD    :', JSON.stringify(held), ' <- scale is CM_ARRIVE: the ring IS the arrival radius');

  const arrived = await P(`(function(){ let f=0; while(_cmOn && f<900){ __drive(1); f++; }
    __drive(2); return { frames:f, moving:_cmOn, mark: ${READ} }; })()`);
  console.log('  ...on arrival  :', JSON.stringify(arrived), ' <- the marker goes with it; no second cue');

  /* THE REFUSAL, through a real engine state rather than a stub: with the nav grid not built there is
     nothing to route on, which is what `_cmGoTo` checks and what a player clicking mid-load meets. */
  const deny = await P(`(function(){
    const was = NAV.built; NAV.built = false;
    const r = ${click(0, 0)};
    NAV.built = was;
    return r;
  })()`);
  console.log('a REFUSED click  :', JSON.stringify(deny), ' <- red, and `took` false');

  const denyPing = await P(`(function(){ __drive(6); return { mark: ${READ}, moving:_cmOn }; })()`);
  console.log('  ...6 frames on :', JSON.stringify(denyPing), ' <- the refusal PINGS, in red, so it is heard');
  const denyAfter = await P(`(function(){ __drive(40); return { mark: ${READ}, moving:_cmOn }; })()`);
  console.log('  ...40 frames on:', JSON.stringify(denyAfter), ' <- and does NOT hold: the two answers differ');

  // the editor never shows it
  const ed = await P(`(function(){
    const r0 = ${click(0, 0)};
    editorOpen = true; __drive(2); const inEd = ${READ};
    editorOpen = false; __drive(2); const out = ${READ};
    return { clicked:r0.took, inEditor:inEd && inEd.visible, backOut: out && out.visible };
  })()`);
  console.log('editor gate      :', JSON.stringify(ed));

  await P(`(function(){ gameCfg.clickMove = false; gameCfg.freeCursor = false; _cmCancel(); __release(); return 1; })()`);
}, { headless: true });
