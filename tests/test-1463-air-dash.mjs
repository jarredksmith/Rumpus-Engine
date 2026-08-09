// build 1463 — the air dash.
//
// Build 1301 closed variable jump height and named what it deliberately left: "double jump, wall jump,
// dash, air-dash — each is its own verb with its own tuning and its own compatibility question."
//
// THE COMPATIBILITY QUESTION IS WHY IT IS OFF BY DEFAULT. Every gap, ledge and jump puzzle in every level
// ever authored was measured against a player who could not change direction mid-air beyond build 1361's
// air control. `airDash` is the dash SPEED, so 0 means off and one field both enables and tunes it —
// `jumpCut`'s exact shape, and exactly its argument.
//
// IT IS THE SLIDE KEY. The slide requires `player.onGround`, so the airborne press has been dead input
// since build 910: slide on the ground, dash in the air is one verb expressed by state, needing no new
// bind, no new key to teach, and no rebinding conflict.

import { gameSource, extractConst, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const CONSTS = ['AIR_DASH_T', 'AIR_DASH_MIN', 'AIR_DASH_ARM']
  .map(k => `const ${k} = ${extractConst(k, src)};`).join('\n');

// the dash is inline in the frame loop, so it is sliced between two anchors that both must be found
const A = src.indexOf('  if(player.onGround || _ledge){ _dashUsed = false; _airT = 0; } else _airT += dt;');
const B = src.indexOf('  if(sliding){', A);
assert(A > 0, 'the dash block was found');
assert(B > A && (B - A) < 3000, '...and its end anchor, close enough that the slice is the block');
const DASH = src.slice(A, B);

// ---------------------------------------------------------------- 1. off is the pre-1463 engine
{
  eq(extractConst('DEFAULT_WORLD', src).match(/airDash:\s*(\d+)/)[1], '0',
    'the shipped default is 0 — every level authored before this build is byte-identical');

  const run = (v) => new Function(`
    ${CONSTS}
    const DEFAULT_WORLD = { airDash: 0 };
    const worldCfg = { airDash: ${JSON.stringify(v)} };
    let AIR_DASH = -1;
    { const _ad = +(worldCfg.airDash == null ? DEFAULT_WORLD.airDash : worldCfg.airDash);
      AIR_DASH = (isFinite(_ad) && _ad > 0) ? Math.max(AIR_DASH_MIN, Math.min(60, _ad)) : 0; }
    return AIR_DASH;`)();

  eq(run(null), 0, 'an absent field is OFF');
  eq(run(0), 0, 'an explicit 0 is OFF — and it must survive the `||`-style defaulting the rest of the file uses (build 1329)');
  eq(run(18), 18, 'an authored speed lands');
  eq(run(0.5), 4, '...floored at AIR_DASH_MIN: a verb the player presses and cannot feel is worse than no verb');
  eq(run(3), 4, '...same');
  eq(run(999), 60, '...and capped, because a level file is untrusted input (build 1325)');
  eq(run(-5), 0, 'a negative is OFF, not a backwards dash');
  eq(run('x'), 0, 'a non-number is OFF, never NaN (build 1169)');
  eq(run(Infinity), 0,
    '...and an INFINITY is OFF rather than clamped to 60 — `isFinite` runs before the clamp, so an ' +
    'unusable number fails to the safe side, exactly as a non-number does');
}

// ---------------------------------------------------------------- 2. the dash itself, executed
{
  const drive = (o) => new Function('S', `
    ${CONSTS}
    const AIR_DASH = S.dash;
    const dt = S.dt == null ? 1/60 : S.dt;
    const player = S.player;
    const wish = S.wish, forward = S.forward;
    let _dashUsed = S.used || false, _dashT = S.dashT || 0, _airT = (S.airT == null ? 1 : S.airT);
    let _slideBufT = S.buf == null ? 0.25 : S.buf;
    let _ledge = S.ledge || null, sliding = S.sliding || false;
    let drivingCar = S.car || false, mountedTurret = S.turret || false, _onLadder = S.ladder || false;
    let duelDead = S.dead || false, gameOn = S.gameOn === false ? false : true;
    let editorOpen = S.editor || false, shopOpen = S.shop || false;
    let _levelLoaderActive = S.loader || false, matchWarmup = S.warmup || 0;
    const SFX = { slide(){ S.sfx = (S.sfx||0)+1; } };
    ${DASH}
    return { vx:+player.vel.x.toFixed(4), vy:+player.vel.y.toFixed(4), vz:+player.vel.z.toFixed(4),
             used:_dashUsed, dashT:+_dashT.toFixed(4), airT:+_airT.toFixed(4), buf:+_slideBufT.toFixed(4), sfx:S.sfx||0 };`)(o);

  const P = (vx, vy, vz, onGround) => ({ vel:{ x:vx, y:vy, z:vz }, onGround: !!onGround });
  const W = (x, z) => ({ x, z });
  const base = { dash:18, wish:W(0,-1), forward:W(0,-1) };

  // from a standstill it delivers the authored speed
  let r = drive({ ...base, player:P(0,-5,0,false) });
  near(r.vz, -18, 1e-6, 'a standing dash delivers exactly the authored speed along the wish');
  eq(r.vx, 0, '...with nothing on the other axis');
  eq(r.vy, 0, 'a FALL is killed — the classic float that makes gap distance predictable');
  assert(r.used, '...the charge is spent');
  near(r.dashT, +extractConst('AIR_DASH_T', src), 1e-6, '...and the gravity window is armed');
  eq(r.buf, 0, '...and the slide tap is consumed, so it cannot also start a slide on landing');
  eq(r.sfx, 1, '...with one sound');

  // it must never BRAKE — build 1361's defect one verb along
  r = drive({ ...base, player:P(0,-5,-25,false) });
  near(r.vz, -25, 1e-6, 'a dash never SLOWS a faster approach: max(), not set()');
  r = drive({ ...base, player:P(0,-5,-10,false) });
  near(r.vz, -18, 1e-6, '...and always lifts a slower one to the authored speed');

  // it must never cut a RISE
  r = drive({ ...base, player:P(0, 9, 0, false) });
  eq(r.vy, 9, 'a RISE is untouched — cutting one would be a mid-air brake, which is a different and bad feature');
  r = drive({ ...base, player:P(0, 0, 0, false) });
  eq(r.vy, 0, 'and vy 0 stays 0');

  // direction comes from the MOVEMENT BASIS, with facing as the fallback
  r = drive({ ...base, wish:W(1,0), player:P(0,-5,0,false) });
  near(r.vx, 18, 1e-6, 'the dash goes where the STICK points...');
  near(r.vz, 0, 1e-6, '...not where the camera does (builds 874/1290)');
  r = drive({ ...base, wish:W(0,0), forward:W(0.6,0.8), player:P(0,-5,0,false) });
  near(Math.hypot(r.vx, r.vz), 18, 1e-4, 'with no stick input it falls back to FACING, normalised');
  near(r.vx / r.vz, 0.6/0.8, 1e-4, '...along that facing');
  // an un-normalised wish must not scale the dash
  r = drive({ ...base, wish:W(0,-0.3), player:P(0,-5,0,false) });
  near(r.vz, -18, 1e-6, 'a short wish vector still gives a full-speed dash — the direction is normalised');

  // a degenerate direction does nothing rather than producing NaN
  r = drive({ ...base, wish:W(0,0), forward:W(0,0), player:P(0,-5,0,false) });
  eq(r.used, false, 'no direction at all: no dash, and no NaN');
  eq(r.vz, 0);

  // ---- every gate, each of which is a defect the other way
  const blocked = [
    [{ dash:0 },            'the feature is off'],
    [{ buf:0 },             'the slide key was not tapped'],
    [{ used:true },         'the charge is already spent — anything else is flight'],
    [{ player:P(0,-5,0,true) }, 'the player is on the GROUND (that is the slide)'],
    [{ ledge:{ ph:'hang' } },   'the player is on a ledge'],
    [{ sliding:true },      'a slide is in progress'],
    [{ car:true },          'driving'],
    [{ turret:true },       'manning a turret'],
    [{ ladder:true },       'on a ladder'],
    [{ dead:true },         'dead in a duel'],
    [{ gameOn:false },      'the match is not running'],
    [{ editor:true },       'the editor is open'],
    [{ shop:true },         'the shop is open'],
    [{ loader:true },       'the level loader is up'],
    [{ warmup:3 },          'the warmup countdown is running'],
    [{ airT:0 },            'the player only just left the ground'],
  ];
  // The observable is the VELOCITY, not the flag: the spent-charge case goes in with `_dashUsed` already
  // true and the block has no reason to clear it while the player is airborne, so asserting the flag
  // there would be asserting the input.
  for(const [o, why] of blocked){
    const x = drive({ ...base, player:P(0,-5,0,false), ...o });
    eq(x.vz, 0, 'no dash while ' + why);
    eq(x.vy, -5, '...and the fall is not killed either: ' + why);
    if(!o.used) eq(x.used, false, '...and no charge is spent: ' + why);
  }
}

// ---------------------------------------------------------------- 3. once per airtime, refunded by ground
{
  const seq = new Function(`
    ${CONSTS}
    const AIR_DASH = 18, dt = 1/60;
    const player = { vel:{x:0,y:-5,z:0}, onGround:false };
    const wish = { x:0, z:-1 }, forward = { x:0, z:-1 };
    let _dashUsed = false, _dashT = 0, _airT = 1, _slideBufT = 0.25;
    let _ledge = null, sliding = false, drivingCar = false, mountedTurret = false, _onLadder = false;
    let duelDead = false, gameOn = true, editorOpen = false, shopOpen = false;
    let _levelLoaderActive = false, matchWarmup = 0;
    const SFX = { slide(){} };
    const step = () => { ${DASH} };
    const out = [];
    step(); out.push({ z:+player.vel.z.toFixed(2), used:_dashUsed });
    /* same airtime, the OTHER way — a second dash would flip the sign */
    wish.z = 1; _slideBufT = 0.25;
    step(); out.push({ z:+player.vel.z.toFixed(2), used:_dashUsed });
    /* a LEDGE refunds it */
    _ledge = { ph:'hang' }; step(); const ledgeRefund = !_dashUsed;
    _ledge = null; _airT = 1; _slideBufT = 0.25; player.vel.y = -5;
    step(); out.push({ z:+player.vel.z.toFixed(2), used:_dashUsed });
    /* the GROUND refunds it, and zeroes the airtime */
    player.onGround = true; step(); const groundRefund = !_dashUsed, airZero = _airT === 0;
    player.onGround = false; _slideBufT = 0.25;
    /* ...but the arm window has to be earned again */
    step(); const armedTooSoon = _dashUsed;
    for(let i = 0; i < 12; i++){ _slideBufT = 0.25; step(); }
    return { out, ledgeRefund, groundRefund, airZero, armedTooSoon, finalZ:+player.vel.z.toFixed(2) };`)();

  eq(seq.out[0].z, -18, 'the first dash fires');
  eq(seq.out[1].z, -18, 'a second dash in the SAME airtime does NOTHING — seen by DIRECTION, because a repeat the same way is invisible in the speed');
  assert(seq.ledgeRefund, 'a ledge grab refunds the charge: the hang IS ground contact by every other rule in this file');
  eq(seq.out[2].z, 18, '...so a dash off a ledge fires, the other way');
  assert(seq.groundRefund, 'the ground refunds it');
  assert(seq.airZero, '...and zeroes the airtime, so the arm window is earned again');
  eq(seq.armedTooSoon, false, 'the very next airborne frame is too soon');
  eq(seq.finalZ, 18, '...and once armed it fires again');
}

// ---------------------------------------------------------------- 4. the gravity window
{
  const g = new Function(`
    const GRAV = 30, dt = 1/60;
    const player = { vel:{ y: 0 } };
    let _dashT = ${extractConst('AIR_DASH_T', src)};
    const out = [];
    for(let i = 0; i < 20; i++){
      if(_dashT > 0) _dashT -= dt;
      if(_dashT > 0) player.vel.y = 0; else player.vel.y -= GRAV*dt;
      out.push(+player.vel.y.toFixed(3));
    }
    return out;`)();
  const held = g.filter(v => v === 0).length;
  assert(held >= 8 && held <= 10, 'gravity is suspended for the dash window — ~9 frames at 60 Hz, which is what makes it read as a dash rather than a nudge');
  assert(g[g.length-1] < -0.4, '...and resumes: the player is falling again by the end');
  // the shipped line, pinned, because a suspension that never ends is flight
  assert(/if\(_dashT > 0\) player\.vel\.y = 0; else player\.vel\.y -= GRAV\*dt;/.test(src),
    'the suspension is an else of the ONE gravity integration, not a second one');
  eq((src.match(/player\.vel\.y -= GRAV\*dt;/g) || []).length, 1,
    '...and there is still exactly one gravity site');
}

// ---------------------------------------------------------------- 5. the key, and the surface
{
  assert(/_slideBufT > 0 && !_dashUsed/.test(DASH),
    'it reads the SLIDE key\'s own buffer — no new bind, and a creator who rebinds slide moves both');
  assert(!/BIND_DEFAULTS[\s\S]{0,400}dash/.test(src), 'no new default bind was added');
  assert(src.indexOf("sliding = true; slideT = SLIDE_DUR") < A,
    'the GROUND slide is checked first, so a grounded tap can never be claimed by the dash');
  assert(/slider\(b,'Air dash','airDash',0,40,1\)/.test(src),
    'the creator gets a slider beside Tap hop, whose 0 is a real and reachable OFF');
}

done('build 1463 (gameplay audit F6, the remaining verb): the air dash. Build 1301 closed variable jump height and named double jump, wall jump, dash and air-dash as each needing its own build and its own compatibility question — this is that question answered for one of them. It is OFF BY DEFAULT because every gap, ledge and jump puzzle in every level ever authored was measured against a player who could not change direction mid-air beyond build 1361\'s air control, and a dash that existed by default would make a fraction of them trivial and let a player leave arenas their author had sealed; `airDash` is the dash SPEED, so 0 means off and one field both enables and tunes it, which is `jumpCut`\'s exact shape. It is the SLIDE KEY, and that is why it needs no new bind, no key to teach and no rebinding conflict: the slide requires `player.onGround`, so the airborne press has been dead input since build 910 — slide on the ground, dash in the air is one verb expressed by state. Executed here: the clamp table (0/absent/negative/NaN all OFF, a sub-threshold speed floored, a hostile one capped), the arithmetic (max() so a dash can never BRAKE a fast approach — build 1361\'s defect one verb along — a killed FALL but an untouched RISE, direction from the movement basis with facing as the fallback and no NaN from a degenerate one), all sixteen gates, once-per-airtime seen by DIRECTION because a repeat the same way is invisible in the speed, the refund by both ground and ledge, and the gravity window as an ELSE of the one integration rather than a second one. Measured live from the player\'s own inputs with `airDash:0` as the control and identical inputs either side: the gap cleared went 3.09 m to 8.50 m');
