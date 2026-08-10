// build 1482 — does a second jump actually happen, and is it worth the height?
//
// Driven from the player's own KEYS through the real frame loop, following build 1463's air-dash probe
// exactly — including its own hard-won lesson: SETTLE FIRST, because the level loader and `matchWarmup`
// both gate the movement block and a trial run before they clear measures nothing while reading as "never
// jumped". The same key sequence with `airJumps` at 0 is the control in every row.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);

  const settle = await P(`(function(){ __drive(240);
    return { warmup: matchWarmup, loader: _levelLoaderActive, gameOn, JUMP, GRAV }; })()`);
  console.log('settled ', JSON.stringify(settle));

  // land somewhere clear, with every jump/dash timer reset
  const LAND = `
    player.pos.set(0, 3, 30); player.vel.set(0, 0, 0); player.onGround = false;
    _airJumpsUsed = 0; _dashUsed = false; _coyoteT = 0; _jumpBufT = 0; _jumpHeldPrev = false;
    player.jumpCd = 0; sliding = false;
    for(const k in keys) keys[k] = false;
    __drive(90);`;

  // press jump on the ground, then optionally again mid-air, and report the apex reached
  const trial = (n, second) => P(`(function(){
    worldCfg.airJumps = ${n}; applyWorldCfg();
    ${LAND}
    if(!player.onGround) return { landed:false };
    const groundY = player.pos.y;

    /* HOLD the first jump through its rise. A 2-frame tap is cut by build 1301's jumpCut to a 0.93 m hop
       that is over in ~13 frames, so the "mid-air" second press landed on the GROUND and every row read
       identically — which is a fixture measuring itself, not a null. */
    keys[BINDS.jump] = true; __drive(20); keys[BINDS.jump] = false;
    __drive(4);
    const vyBefore = +player.vel.y.toFixed(2), usedBefore = _airJumpsUsed;
    const airborne = !player.onGround;

    ${second ? 'keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false;' : '__drive(2);'}
    const vyAfter = +player.vel.y.toFixed(2);

    let apex = player.pos.y, f = 0;
    while(!player.onGround && f < 600){ __drive(1); f++; if(player.pos.y > apex) apex = player.pos.y; }
    return { landed:true, airJumps: AIR_JUMPS, airborne, vyBefore, vyAfter,
             rise: +(apex - groundY).toFixed(2), used: _airJumpsUsed, usedBefore, backOnGround: player.onGround };
  })()`);

  console.log('one press,  airJumps 0:', JSON.stringify(await trial(0, false)));
  console.log('TWO presses, airJumps 0:', JSON.stringify(await trial(0, true)), '  <- the control');
  console.log('one press,  airJumps 1:', JSON.stringify(await trial(1, false)), '  <- the other control');
  console.log('TWO presses, airJumps 1:', JSON.stringify(await trial(1, true)));
  console.log('one press,  airJumps 0:', JSON.stringify(await trial(0, false)), '  <- returns');

  // the refund, and that a held key is one press rather than a hover
  const more = await P(`(function(){
    worldCfg.airJumps = 3; applyWorldCfg();
    ${LAND}
    keys[BINDS.jump] = true; __drive(20); keys[BINDS.jump] = false; __drive(4);
    const beforeSecond = _airJumpsUsed;
    /* JUMP_CD is 0.5 s and the ground jump spent it, so a press at ~0.4 s BUFFERS and fires once the
       cooldown clears — which is the air jump inheriting the ordinary jump's rate limit rather than being
       spammable. Reading 3 frames after the press showed 0 and looked like a failure; it is the cooldown. */
    keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false; __drive(12);
    const afterOne = _airJumpsUsed;
    let f = 0; while(!player.onGround && f < 600){ __drive(1); f++; }
    const atTouchdown = _airJumpsUsed;
    /* the refund runs EARLIER in the frame than the ground test, so on the touchdown frame it still sees
       last frame's airborne state — the clear lands one frame later. Harmless (nothing can press jump
       between them) but the readout has to wait for it, or it reads as a refund that never happened. */
    __drive(3);
    const afterLanding = _airJumpsUsed;

    ${LAND}
    keys[BINDS.jump] = true; __drive(240); keys[BINDS.jump] = false;   // HELD the whole time
    const held = _airJumpsUsed;
    return { beforeSecond, afterOne, atTouchdown, afterLanding, heldUsed: held };
  })()`);
  console.log('refund + held key     :', JSON.stringify(more));

  await P(`(function(){ worldCfg.airJumps = 0; applyWorldCfg(); __release(); return 1; })()`);
}, { headless: true });
