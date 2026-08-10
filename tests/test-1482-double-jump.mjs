// build 1482 — the double jump.
//
// Build 1301 named four verbs it deliberately left — double jump, wall jump, dash, air-dash — and 1463 took
// the air dash. This is the most standard of the rest, and it takes 1463's shape for 1463's reason:
// OFF BY DEFAULT, because every gap and ledge in every level ever authored was measured against a player
// with ONE jump.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the jump chain, EXECUTED
{
  const a = src.indexOf('if(!_ledge && _jumpBufT>0 && (player.onGround || _coyoteT>0)');
  assert(a > 0, 'the jump chain is found');
  const end = src.indexOf('player.vel.y = JUMP; _airJumpsUsed++;', a);
  assert(end > a, 'and its air branch — an anchor that MISSES slices garbage rather than failing (1392)');
  const chain = src.slice(a, src.indexOf('}', end) + 1);
  assert(/else if\(AIR_JUMPS > 0/.test(chain), 'the air jump is an `else if` of the ground jump');

  const run = (st) => {
    const S = Object.assign({
      _ledge:false, _jumpBufT:0.15, onGround:false, _coyoteT:0, _airJumpsUsed:0, AIR_JUMPS:0,
      jumpCd:0, _levelLoaderActive:false, matchWarmup:0, mountedTurret:false, _onLadder:false,
      drivingCar:false, duelDead:false, gameOn:true, editorOpen:false, shopOpen:false, vy:-8, sliding:true,
    }, st);
    const O = { sfx:0 };
    const env = {
      player: { get onGround(){ return S.onGround; }, set onGround(v){ S.onGround = v; },
                get jumpCd(){ return S.jumpCd; }, set jumpCd(v){ S.jumpCd = v; },
                vel: { get y(){ return S.vy; }, set y(v){ S.vy = v; } } },
      JUMP: 13, JUMP_CD: 0.25, SFX: { jump: () => O.sfx++ },
    };
    const body = [
      'let _ledge=' + S._ledge + ', _jumpBufT=' + S._jumpBufT + ', _coyoteT=' + S._coyoteT + ';',
      'let _airJumpsUsed=' + S._airJumpsUsed + ', sliding=' + S.sliding + ';',
      'const AIR_JUMPS=' + S.AIR_JUMPS + ', _levelLoaderActive=' + S._levelLoaderActive +
        ', matchWarmup=' + S.matchWarmup + ', mountedTurret=' + S.mountedTurret +
        ', _onLadder=' + S._onLadder + ', drivingCar=' + S.drivingCar + ', duelDead=' + S.duelDead +
        ', gameOn=' + S.gameOn + ', editorOpen=' + S.editorOpen + ', shopOpen=' + S.shopOpen + ';',
      chain,
      'return { vy:player.vel.y, used:_airJumpsUsed, buf:_jumpBufT, onGround:player.onGround, cd:player.jumpCd, sliding:sliding };',
    ].join('\n');
    const r = new Function(...Object.keys(env), body)(...Object.values(env));
    return { ...r, sfx: O.sfx };
  };

  // OFF is the pre-1482 engine, byte for byte
  {
    const r = run({ AIR_JUMPS: 0, vy: -8 });
    eq(r.vy, -8, 'with airJumps 0 an airborne press does NOTHING — every level ever authored is unchanged');
    eq(r.used, 0); eq(r.sfx, 0); eq(r.buf, 0.15, '...and does not even eat the buffered press');
  }

  // the ordinary ground jump is untouched
  {
    const r = run({ onGround: true, AIR_JUMPS: 2 });
    eq(r.vy, 13, 'a grounded press is the ordinary jump...');
    eq(r.used, 0, '...and never spends an air jump');
    eq(r.onGround, false); eq(r.buf, 0); eq(r.sfx, 1);
  }

  // THE FLICKER: `onGround` blinks false mid-stride, but coyote is still live, so it is a GROUND jump
  {
    const r = run({ onGround: false, _coyoteT: 0.09, AIR_JUMPS: 2 });
    eq(r.vy, 13, 'inside the coyote window a press is still the ground jump...');
    eq(r.used, 0,
      '...and spends NO air jump — build 1160’s coyote is the arm window the dash needed a new constant for');
  }

  // genuinely airborne
  {
    const r = run({ AIR_JUMPS: 1, vy: -20 });
    eq(r.vy, 13, 'past the coyote window the air jump fires...');
    eq(r.used, 1, '...spending one');
    eq(r.buf, 0, '...consuming the press, so one press is one jump');
    eq(r.sfx, 1); eq(r.sliding, false, '...and it cancels a slide like the ground jump does');
  }
  {
    const r = run({ AIR_JUMPS: 1, _airJumpsUsed: 1, vy: -20 });
    eq(r.vy, -20, 'the last one spent, the next press does nothing');
    eq(r.used, 1);
  }
  {
    const r = run({ AIR_JUMPS: 3, _airJumpsUsed: 2, vy: -20 });
    eq(r.vy, 13, 'three authored, two spent: the third still fires'); eq(r.used, 3);
  }

  // it SETS the rise rather than adding — a recovery jump, not a nudge
  {
    eq(run({ AIR_JUMPS: 1, vy: -40 }).vy, 13, 'a fast fall is arrested to the full jump speed...');
    eq(run({ AIR_JUMPS: 1, vy: 5 }).vy, 13, '...and a rise is not stacked on top of itself');
  }

  // every refusal
  for (const [k, v, why] of [
    ['_ledge', true, 'not while hanging on a ledge'],
    ['_onLadder', true, 'not while on a ladder — that would be a hover, not a verb'],
    ['drivingCar', true, 'not while driving'],
    ['mountedTurret', true, 'not while manning a turret'],
    ['duelDead', true, 'not while waiting to respawn'],
    ['editorOpen', true, 'not in the editor'],
    ['shopOpen', true, 'not with the shop open'],
    ['gameOn', false, 'not outside a game'],
    ['_levelLoaderActive', true, 'not while the level is still loading'],
    ['matchWarmup', 1, 'not during the pre-match warmup'],
    ['jumpCd', 0.2, 'not before the cooldown clears'],
    ['_jumpBufT', 0, 'and not without a press'],
  ]) {
    const r = run(Object.assign({ AIR_JUMPS: 2, vy: -20 }, { [k]: v }));
    eq(r.vy, -20, why); eq(r.used, 0, '...spending nothing: ' + k);
  }
}

// ---------------------------------------------------------------- 2. the refund
{
  const line = src.match(/if\(player\.onGround \|\| _ledge\)\{ _dashUsed = false; _airJumpsUsed = 0; _airT = 0; \} else _airT \+= dt;/);
  assert(line, 'the refund rides build 1463’s own line...');
  const run = (onGround, ledge, used) => {
    const S = { used };
    new Function('player', '_ledge', 'dt', 'S',
      'let _dashUsed=false, _airT=0; let _airJumpsUsed=S.used;\n' + line[0] + '\nS.used=_airJumpsUsed;')(
      { onGround }, ledge, 0.016, S);
    return S.used;
  };
  eq(run(true, false, 2), 0, 'the ground refunds them');
  eq(run(false, true, 2), 0, '...and so does a ledge grab, because a hang IS ground contact by every other rule here');
  eq(run(false, false, 2), 2, '...and the air does not');
  // the first draft of this pin matched its own DECLARATION (`let _airJumpsUsed = 0;`) — a bare-name pin
  // counts the declaration too, which is this file's recorded trap one step along.
  const rest = src.replace(line[0], '').replace(/let _airJumpsUsed = 0;/, '');
  assert(!/_airJumpsUsed\s*=\s*0/.test(rest),
    'and that is the ONLY place they are refunded, so no landing edge can miss the flicker frames');
}

// ---------------------------------------------------------------- 3. the sanitizer, EXECUTED
{
  const blk = src.match(/\{ const _aj = \+\(worldCfg\.airJumps[\s\S]*?AIR_JUMPS = [^\n]*\}/);
  assert(blk, 'the derivation is found');
  const MAX = +extractConst('AIR_JUMP_MAX', src);
  eq(MAX, 3, 'past three it is a novelty rather than a verb');
  const derive = (v) => new Function('worldCfg', 'DEFAULT_WORLD', 'AIR_JUMP_MAX',
    'let AIR_JUMPS;\n' + blk[0] + '\nreturn AIR_JUMPS;')({ airJumps: v }, { airJumps: 0 }, MAX);

  eq(derive(undefined), 0, 'unset is OFF');
  eq(derive(null), 0, 'and so is null — the default is reached explicitly, not through `||` (build 1329)');
  eq(derive(0), 0, 'an authored 0 survives, which is the whole compatibility argument');
  eq(derive(1), 1, 'one extra jump'); eq(derive(3), 3);
  eq(derive(9), MAX, 'a hostile file clamps'); eq(derive(1e9), MAX);
  eq(derive(-4), 0, 'a negative is off, not a negative count');
  eq(derive(1.7), 1, 'half an extra jump is nothing — it floors');
  eq(derive(0.4), 1, '...but anything positive is at least one, or it would be a verb you cannot feel');
  eq(derive('x'), 0, 'junk is off'); eq(derive(NaN), 0);
  eq(derive(Infinity), 0,
    'and Infinity is OFF rather than clamped — `isFinite` rejects it before the clamp is reached, which is ' +
    'the fail-safe direction: an unreadable value must not become the most permissive one');
}

// ---------------------------------------------------------------- 4. it travels, and it has a door
{
  assert(/jumpCut:0\.5, airDash:0, airJumps:0,/.test(src),
    'the default is 0 — off — beside the two verbs whose shape it takes');
  // worldCfg is serialized whole, so no serializer line is needed — asserted rather than assumed
  assert(/world:\s+Object\.assign\(\{\}, worldCfg\)/.test(src),
    'the world block is written whole, which is why this needed no serializer change');
  assert(/slider\(b,'Air jumps','airJumps',0,3,1\);/.test(src),
    'the creator sets it beside Tap hop and Air dash, where the other jump verbs live');

  // jumpCut applies for free: it cuts a RISE and does not care which jump caused it
  const cut = src.match(/[^\n]*jumpCut[^\n]*vel\.y[^\n]*/);
  assert(!cut || !/onGround|_airJumps/.test(cut[0]),
    'build 1301’s tap-hop cut names neither the ground nor the air jump, so it covers both for free');
}

done('build 1482: THE DOUBLE JUMP. Build 1301 named four verbs it deliberately left — double jump, wall jump, dash, air-dash — and 1463 took the air dash; this is the most standard of the rest, and it takes 1463’s shape for 1463’s reason. OFF BY DEFAULT is the compatibility question answered: every gap, ledge and jump puzzle in every level ever authored was measured against a player with ONE jump, so a second that existed by default would make a fraction of them trivial and would let a player leave arenas their author had sealed — `airJumps` is the COUNT, so 0 means off and one field both enables and tunes it, exactly `jumpCut`’s and `airDash`’s shape. It is the JUMP KEY, so there is no new bind and a creator who rebinds jump moves both together. It needs NO ARM WINDOW unlike the dash, and that is the interesting part: `onGround` flickers false mid-stride, but build 1160’s coyote is refreshed on every grounded frame, so a flicker still satisfies the ground branch and the air branch’s `_coyoteT <= 0` cannot fire there — the guard was already in the engine and this verb just had to ask for it, proven by executing the flicker case. It is an `else if` so a grounded press is ALWAYS the ordinary jump and that branch is byte-identical; it SETS vel.y rather than adding, so a 40 u/s fall is arrested to a real recovery jump rather than nudged; it is refunded on build 1463’s own line for build 1463’s reason (a clear, not a landing edge, because an edge would miss the flicker frames) and a ledge grab refunds it too; and twelve refusals are executed one at a time, including the ladder, which is the one guard the ground branch does not carry — jumping OFF a ladder is a ground-class jump and stays, while an extra mid-air jump while still attached to one is a hover');
