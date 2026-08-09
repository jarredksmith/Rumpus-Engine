// build 1463 — the air dash, driven from the player's own inputs in a running frame loop.
//
// The CONTROL is `airDash: 0`, which is every level authored before this build: the identical inputs must
// produce a byte-identical arc, or the opt-in is not an opt-in.
//
// Two things only a live run can settle: that the SLIDE KEY reaches the dash while airborne (it is
// buffered, gated on sprint, and consumed by the ground slide — any of which could swallow it), and that
// the gravity window is suspended in the real integrator rather than in my reading of it.
//
// Two probe faults are baked into the setup below because both cost a run. Spawn INSIDE +/-ARENA or there
// is no ground plane and the whole trial is freefall (build 1405). And a repeat dash cannot be seen in
// the SPEED — a second dash the same way leaves it at 18 either way — so the retry dashes the OTHER way
// and watches the direction.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);

  /* Settle FIRST: the level loader and matchWarmup both gate the movement block, so a trial run before
     they clear measures nothing and reads as "never landed" (which is exactly what the first run said). */
  const settle = await P(`(function(){ __drive(240);
    return { warmup: matchWarmup, loader: _levelLoaderActive, gameOn, JUMP, GRAV, SPEED, SPRINT }; })()`);

  const LAND = () => `
    player.pos.set(${open.x}, 3, ${open.z}); player.vel.set(0, 0, 0); player.onGround = false;
    _dashUsed = false; _dashT = 0; sliding = false; slideT = 0; slideCD = 0; _slideBufT = 0; _prevSlideKey = false;
    for(const k in keys) keys[k] = false;
    __drive(90);`;

  const trial = (dash, riseFrames) => P(`(function(){
    worldCfg.airDash = ${dash}; applyWorldCfg();
    ${LAND()}
    if(!player.onGround) return { landed:false };
    const groundY = player.pos.y;

    keys[BINDS.fwd] = true; __drive(20);
    const x0 = player.pos.x, z0 = player.pos.z, runSpd = Math.hypot(player.vel.x, player.vel.z);

    keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false;
    __drive(${riseFrames});
    const beforeSpd = Math.hypot(player.vel.x, player.vel.z), beforeVy = player.vel.y;

    keys[BINDS.slide] = true; __drive(1); keys[BINDS.slide] = false;
    const afterSpd = Math.hypot(player.vel.x, player.vel.z), afterVy = player.vel.y;
    const used = _dashUsed, dt0 = _dashT;

    const vyDuring = []; for(let i = 0; i < 12; i++){ __drive(1); vyDuring.push(+player.vel.y.toFixed(2)); }
    const rising = beforeVy > 0;

    let apex = player.pos.y, f = 0;
    while(!player.onGround && f < 600){ __drive(1); f++; if(player.pos.y > apex) apex = player.pos.y; }
    const dist = Math.hypot(player.pos.x - x0, player.pos.z - z0);

    for(const k in keys) keys[k] = false;
    return { landed:true, groundY:+groundY.toFixed(2), runSpd:+runSpd.toFixed(2),
             beforeSpd:+beforeSpd.toFixed(2), beforeVy:+beforeVy.toFixed(2),
             afterSpd:+afterSpd.toFixed(2), afterVy:+afterVy.toFixed(2), used, dashT:+dt0.toFixed(3),
             vyHeld: vyDuring.filter(v => v === 0).length, vyDuring,
             dist:+dist.toFixed(2), apex:+(apex - groundY).toFixed(2), air:f, rising };
  })()`);

  /* Find genuinely OPEN ground before trusting any arc: a control jump must reach ~JUMP^2/2g (2.82 m).
     The first spot tried gave 0.92, which is a ceiling, not a jump — and every distance measured under
     it would have been about a prop rather than about the dash. */
  const spots = await P(`(function(){
    const out = [];
    for(const [x, z] of [[40,40],[-40,40],[40,-40],[-40,-40],[55,0],[0,55],[-55,0],[0,-55]]){
      player.pos.set(x, 3, z); player.vel.set(0,0,0); player.onGround = false;
      for(const k in keys) keys[k] = false; __drive(90);
      if(!player.onGround){ out.push({ x, z, apex:null }); continue; }
      const g = player.pos.y;
      keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false;
      let a = player.pos.y, n = 0;
      while(!player.onGround && n < 300){ __drive(1); n++; if(player.pos.y > a) a = player.pos.y; }
      for(const k in keys) keys[k] = false;
      out.push({ x, z, apex:+(a - g).toFixed(2), air:n });
    }
    return out;
  })()`);
  const open = spots.filter(s => s.apex != null).sort((a, b) => b.apex - a.apex)[0];

  const off  = await trial(0, 8);
  const on   = await trial(18, 8);
  const late = await trial(18, 11);   /* tapped while FALLING: vy must be killed, never a rise cut */

  const charge = await P(`(function(){
    worldCfg.airDash = 18; applyWorldCfg();
    ${LAND()}
    if(!player.onGround) return { landed:false };
    const tapWith = (k) => { for(const q in keys) keys[q] = false; keys[k] = true; __drive(1);
                             keys[BINDS.slide] = true; __drive(1); keys[BINDS.slide] = false; __drive(1);
                             return { x:+player.vel.x.toFixed(2), z:+player.vel.z.toFixed(2), used:_dashUsed }; };
    keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false; __drive(6);
    const first  = tapWith(BINDS.fwd);
    const second = tapWith(BINDS.back);
    let n = 0; while(!player.onGround && n < 600){ __drive(1); n++; }
    __drive(4);
    const refunded = !_dashUsed;
    keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false; __drive(6);
    const afterLanding = tapWith(BINDS.back);
    for(const q in keys) keys[q] = false;
    return { landed:true, first, second, refunded, afterLanding };
  })()`);

  const slideRun = (dash) => P(`(function(){
    worldCfg.airDash = ${dash}; applyWorldCfg();
    ${LAND()}
    if(!player.onGround) return { landed:false };
    keys[BINDS.fwd] = true; keys[BINDS.sprint] = true; __drive(30);
    const onGround = player.onGround, spd = +Math.hypot(player.vel.x, player.vel.z).toFixed(2);
    keys[BINDS.slide] = true; __drive(1); keys[BINDS.slide] = false; __drive(2);
    const out = { landed:true, onGround, spd, sliding, dashUsed:_dashUsed };
    for(const k in keys) keys[k] = false;
    return out;
  })()`);
  /* ORDER is the cheap discriminator: if the result follows the sequence rather than the value, the
     fixture is carrying state between runs and the "regression" is mine, not the engine's. */
  const slideA = await slideRun(18), slideB = await slideRun(0);
  const slideC = await slideRun(0),  slideD = await slideRun(18);
  const slide = slideD, slideCtl = slideC;
  /* Is AIR_DASH_ARM load-bearing? Zero it and re-run the same warm slide. If the slide still fires, the
     flicker-steal is a hazard I reasoned about rather than one this fixture can produce, and the gate
     should be recorded as such rather than credited with a fix. */
  const armTest = await P(`(function(){
    /* AIR_DASH_ARM is a const, so the experiment is on _airT itself: force it past the gate every frame
       by pre-loading it, which is what a zero arm would do. */
    worldCfg.airDash = 18; applyWorldCfg();
    player.pos.set(${open.x}, 3, ${open.z}); player.vel.set(0,0,0); player.onGround=false;
    _dashUsed=false; _dashT=0; sliding=false; slideT=0; slideCD=0; _slideBufT=0; _prevSlideKey=false;
    for(const k in keys) keys[k]=false; __drive(90);
    keys[BINDS.fwd]=true; keys[BINDS.sprint]=true; __drive(30);
    const groundFrames = []; for(let i=0;i<8;i++){ __drive(1); groundFrames.push(player.onGround?1:0); }
    keys[BINDS.slide]=true; __drive(1); keys[BINDS.slide]=false; __drive(2);
    const out = { sliding, dashUsed:_dashUsed, airT:+_airT.toFixed(3), groundFrames };
    for(const k in keys) keys[k]=false; return out;
  })()`);

  const clamp = await P(`(function(){
    const r = {};
    for(const v of [null, 0, 0.5, 3, 18, 999, -5, 'x']){ worldCfg.airDash = v; applyWorldCfg(); r[JSON.stringify(v)] = AIR_DASH; }
    worldCfg.airDash = 0; applyWorldCfg();
    return r;
  })()`);

  console.log(JSON.stringify({ armTest, slideOrder:{ first18:slideA.sliding, then0:slideB.sliding, first0:slideC.sliding, then18:slideD.sliding }, settle, spots, open, off, on, late, charge, slide, slideCtl, clamp }, null, 1));
});
