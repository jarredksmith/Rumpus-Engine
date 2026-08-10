// build 1483 — does a real wall give a real jump, and can a single wall be climbed?
//
// Driven from the player's own keys through the real frame loop against a REAL prop, so the wall is found by
// the same `clearAt` the movement uses. `wallJump: 0` with the identical inputs is the control in every row.
//
// TWO fixture faults were paid for before any number here meant anything, both recorded so the next probe of
// a movement verb does not repeat them:
//   * The first draft stood the player at x=200 "well clear of the stock level" (build 1323's rule) — and the
//     engine's ground plane stops at +-ARENA (70), so they fell out of the world and every row read the fall
//     rather than the verb. Build 1405 hit the identical thing at 700.
//   * Giving them their OWN platform box fixed the fall and produced a player OSCILLATING around its top
//     (feet -0.30 / -0.03 / -0.65 / -0.18, never grounded) — resting exactly on a collider box boundary,
//     which is build 1094's recorded trap.
// So the fixture stands on the engine's own ground plane, at a column measured empty (nearest prop 41.9 m).

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);

  const settle = await P(`(function(){ __drive(240);
    return { warmup: matchWarmup, loader: _levelLoaderActive, gameOn, paused, JUMP, radius: player.radius }; })()`);
  console.log('settled  ', JSON.stringify(settle));

  // a tall wall on the real ground, in a column measured clear of the stock level
  const build = await P(`(function(){
    spawnProp('box', [0,0,0, 0,0,0, 1,20,10]);
    const w = propModels[propModels.length-1];
    w.position.set(61.5, 0, -60); w.updateMatrixWorld(true); refreshPropCollider(w);
    return { boxes:(w.userData.boxes||[]).length,
             spanX:[+w.userData.box.min.x.toFixed(2), +w.userData.box.max.x.toFixed(2)],
             ground:+groundHeightAt(60, -60).toFixed(2) };
  })()`);
  console.log('the wall ', JSON.stringify(build));

  // stand against its -X face: body 59.2..60.8, wall face at 61.0, probes reach 61.15
  const AT_WALL = `
    player.pos.set(60, 1.9, -60); player.vel.set(0, 0, 0); player.onGround = false;
    _airJumpsUsed = 0; _wallHas = false; _dashUsed = false; _coyoteT = 0; _jumpBufT = 0;
    _jumpHeldPrev = false; player.jumpCd = 0; sliding = false;
    for(const k in keys) keys[k] = false;
    __drive(120);`;

  // does the engine see the wall from there at all?
  const seen = await P(`(function(){ ${AT_WALL}
    const p = _wallPush(player.pos.y - EYE);
    return { grounded: player.onGround, at:+player.pos.x.toFixed(2), y:+player.pos.y.toFixed(2),
             wall: p ? { x:+p.x.toFixed(2), z:+p.z.toFixed(2) } : null }; })()`);
  console.log('probe    ', JSON.stringify(seen), ' <- a null here, or not grounded, and every row below measures that');

  const trial = (n) => P(`(function(){
    worldCfg.wallJump = ${n}; applyWorldCfg();
    ${AT_WALL}
    if(!player.onGround) return { landed:false };
    /* HOLD the first jump through its rise — a 2-frame tap is cut by build 1301's jumpCut to a hop that is
       over before the "mid-air" press lands, which is build 1482's own recorded fixture fault. */
    keys[BINDS.jump] = true; __drive(20); keys[BINDS.jump] = false;
    /* WHEN the press lands is the whole fixture, and two different wrong answers were measured first:
         frame 50 — the player has nearly landed, so the buffered key fires as an ordinary GROUND jump and the
                    CONTROL showed a full 12 of lift;
         frame 28 — 0.467 s after the ground jump, inside JUMP_CD (0.5 s), so nothing fires at all and every
                    row reads identically. That is build 1482's own recorded finding, one verb along.
       Frame 35 is 0.583 s: the cooldown has cleared and there is still ~2.5 m of air underneath. */
    __drive(15);
    const vyBefore = +player.vel.y.toFixed(2), vxBefore = +player.vel.x.toFixed(2);
    const hBefore = +(player.pos.y - EYE - groundHeightAt(player.pos.x, player.pos.z)).toFixed(2);
    const airborne = !player.onGround, wallThere = !!_wallPush(player.pos.y - EYE);

    /* read at the moment of the press: a longer tail lands the player again and vy reads the same in every
       row, which is a column measuring the ground rather than the verb */
    keys[BINDS.jump] = true; __drive(3); keys[BINDS.jump] = false;
    return { landed:true, wallJump: WALL_JUMP, airborne, hBefore, wallThere, vyBefore, vxBefore,
             vyAfter:+player.vel.y.toFixed(2), vxAfter:+player.vel.x.toFixed(2),
             used: _wallHas, spentAirJumps: _airJumpsUsed };
  })()`);

  console.log('wallJump 0 :', JSON.stringify(await trial(0)), '  <- the control');
  console.log('wallJump 12:', JSON.stringify(await trial(12)));
  console.log('wallJump 0 :', JSON.stringify(await trial(0)), '  <- returns');

  /* The same wall twice must NOT be an infinite ladder. Every attempt is handed the player airborne, at the
     wall, off cooldown — so the same-wall rule is the ONLY thing that can refuse, and `_wallHas` is
     deliberately not reset, because it is the state under test. Touching the ground between attempts is the
     positive control: 6 there proves the fixture can produce a 6. */
  const ladder = await P(`(function(){
    worldCfg.wallJump = 12; applyWorldCfg();
    const attempt = () => {
      player.pos.set(60, 5, -60); player.vel.set(0, 0, 0); player.onGround = false;
      _coyoteT = 0; _jumpBufT = 0; _jumpHeldPrev = false; player.jumpCd = 0; sliding = false;
      keys[BINDS.jump] = true; __drive(2); keys[BINDS.jump] = false; __drive(2);
      return Math.abs(player.vel.x) > 5;
    };
    ${AT_WALL}
    _wallHas = false;
    let same = 0; for(let i = 0; i < 6; i++) if(attempt()) same++;
    _wallHas = false;
    let refunded = 0;
    for(let i = 0; i < 6; i++){ if(attempt()) refunded++; player.onGround = true; __drive(2); }
    return { firedOffTheSameWall: same, firedWhenGroundTouchedBetween: refunded };
  })()`);
  console.log('same wall  :', JSON.stringify(ladder), ' <- 1 vs 6: the rule refuses, and the ground re-arms it');

  await P(`(function(){ worldCfg.wallJump = 0; applyWorldCfg(); __release(); return 1; })()`);
}, { headless: true });
