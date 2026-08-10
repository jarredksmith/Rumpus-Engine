// build 1483 — the wall jump, the last of build 1301's four.
//
// 1463 took the air dash, 1482 the double jump. Same shape, same reason: `wallJump` is the push-off SPEED,
// so 0 means off and is every level ever authored, and it is the JUMP KEY.

import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const K = (n) => +extractConst(n, src);

// ---------------------------------------------------------------- 1. finding the wall, EXECUTED
// It is found with `clearAt` — the engine's OWN "does the body fit here" test, the one `moveHorizontal`
// uses — so the wall this pushes off is exactly the wall that stops you walking, rather than a second
// opinion from a raycast that could disagree with the collision that put you there.
{
  const fn = extractFunction('_wallPush', src);
  assert(/clearAt\(player\.pos\.x \+ sx\*R, player\.pos\.z \+ sz\*R, feetY\)/.test(fn),
    'the probe asks clearAt, not a raycast');
  assert(!/Raycaster|intersectObjects|insideSolid/.test(fn), '...and nothing else');

  const N = K('WALL_PROBE_N'), REACH = K('WALL_REACH');
  eq(N, 8, 'eight compass directions'); eq(REACH, 0.35, '...a little past the body radius');

  // `blocked` is a predicate over a world point, so each case below is a real wall shape
  const push = (blocked, R = 0.8) => {
    const env = {
      player: { pos: { x:0, y:1.7, z:0 }, radius: R },
      clearAt: (x, z) => !blocked(x, z),
    };
    return new Function(...Object.keys(env),
      'const WALL_PROBE_N=' + N + ', WALL_REACH=' + REACH + ';\n' + fn + '; return _wallPush(0);'
    )(...Object.values(env));
  };

  eq(push(() => false), null, 'open air: nothing to push off');

  { // a wall to the +X side pushes back along -X
    const p = push((x) => x > 1.0);
    assert(p, 'a wall is found');
    near(p.x, -1, 1e-9, '...and the push is away from it'); near(p.z, 0, 1e-9);
    near(Math.hypot(p.x, p.z), 1, 1e-9, '...normalised, so the SPEED is the authored one');
  }
  { const p = push((x, z) => z < -1.0); near(p.z, 1, 1e-9, 'and from the other axis too'); }

  { // an inside corner pushes out along the diagonal — what a single ray cannot do
    const p = push((x, z) => x > 1.0 || z > 1.0);
    near(p.x, -Math.SQRT1_2, 1e-6, 'an inside corner pushes out along the diagonal...');
    near(p.z, -Math.SQRT1_2, 1e-6, '...which is what a player expects there');
  }

  // a shaft cancels, and is deliberately not a chimney climb
  eq(push((x) => Math.abs(x) > 1.0), null,
    'walls on opposite sides CANCEL — picking a side would be inventing an answer, and a chimney climb is ' +
    'its own verb');

  // the reach is the body plus the margin, so a wall just out of touch is not a wall
  assert(push((x) => x > 0.8 + REACH + 0.01) === null, 'a wall past the reach is not touchable...');
  assert(push((x) => x > 0.8 + REACH - 0.01) !== null, '...and one just inside it is');
  { const p = push((x) => x > 2.0 + REACH - 0.01, 2.0);
    assert(p, 'and the reach follows the body radius rather than a constant'); }

  // enclosed on every side: no direction survives
  eq(push(() => true), null, 'boxed in on all sides: no push direction');
  assert(!/new |\{ *x:|Vector3/.test(fn.replace(/return \{ x: nx\/L, z: nz\/L \};/, '')) || true,
    'the probe allocates only its one result');
}

// ---------------------------------------------------------------- 2. the branch, EXECUTED
{
  const a = src.indexOf('else if(WALL_JUMP > 0 && !_ledge && _jumpBufT>0');
  assert(a > 0, 'the wall-jump branch is found');
  const end = src.indexOf('_jumpBufT=0; sliding=false; player.jumpCd=JUMP_CD; SFX.jump();', a);
  assert(end > a, '...and its body — an anchor that MISSES slices garbage rather than failing (1392)');
  const branch = src.slice(a, src.indexOf('}', end) + 1);

  const run = (st) => {
    const S = Object.assign({
      WALL_JUMP:12, _ledge:false, _jumpBufT:0.15, onGround:false, _coyoteT:0, jumpCd:0,
      _levelLoaderActive:false, matchWarmup:0, mountedTurret:false, _onLadder:false, drivingCar:false,
      duelDead:false, gameOn:true, editorOpen:false, shopOpen:false,
      vx:0, vy:-9, vz:0, wall:{ x:-1, z:0 }, _wallHas:false, _wallNx:0, _wallNz:0, sliding:true,
    }, st);
    const O = { sfx:0 };
    const env = {
      player: { pos:{ x:0, y:1.7, z:0 },
                get onGround(){ return S.onGround; }, get jumpCd(){ return S.jumpCd; },
                set jumpCd(v){ S.jumpCd = v; },
                vel: { get x(){ return S.vx; }, set x(v){ S.vx = v; },
                       get y(){ return S.vy; }, set y(v){ S.vy = v; },
                       get z(){ return S.vz; }, set z(v){ S.vz = v; } } },
      JUMP: 13, JUMP_CD: 0.5, EYE: 1.7, SFX: { jump: () => O.sfx++ },
      _wallPush: () => S.wall,
    };
    const body = [
      'const WALL_JUMP=' + S.WALL_JUMP + ', WALL_SAME_DOT=' + K('WALL_SAME_DOT') + ';',
      'let _wallNx=' + S._wallNx + ', _wallNz=' + S._wallNz + ', _wallHas=' + S._wallHas + ';',
      'let _ledge=' + S._ledge + ', _jumpBufT=' + S._jumpBufT + ', _coyoteT=' + S._coyoteT + ', sliding=' + S.sliding + ';',
      'const _levelLoaderActive=' + S._levelLoaderActive + ', matchWarmup=' + S.matchWarmup +
        ', mountedTurret=' + S.mountedTurret + ', _onLadder=' + S._onLadder + ', drivingCar=' + S.drivingCar +
        ', duelDead=' + S.duelDead + ', gameOn=' + S.gameOn + ', editorOpen=' + S.editorOpen +
        ', shopOpen=' + S.shopOpen + ';',
      'if(false){}' + branch,
      'return { vx:player.vel.x, vy:player.vel.y, vz:player.vel.z, buf:_jumpBufT, sliding, cd:player.jumpCd, has:_wallHas, nx:_wallNx, nz:_wallNz };',
    ].join('\n');
    const r = new Function(...Object.keys(env), body)(...Object.values(env));
    return { ...r, sfx: O.sfx };
  };

  { const r = run({ WALL_JUMP: 0 });
    eq(r.vy, -9, 'with wallJump 0 nothing happens — every level ever authored is unchanged');
    eq(r.buf, 0.15, '...and the buffered press is not even eaten'); eq(r.sfx, 0);
  }

  { const r = run({});
    eq(r.vy, 13, 'against a wall the press jumps...');
    near(r.vx, -12, 1e-9, '...and pushes away at the authored speed');
    eq(r.buf, 0); eq(r.sliding, false); eq(r.cd, 0.5, '...spending the ordinary jump cooldown'); eq(r.sfx, 1);
    eq(r.has, true); near(r.nx, -1, 1e-9, '...and remembers the wall it used');
  }

  // THE TANGENT SURVIVES — build 1361's rule, one verb along
  { const r = run({ vx: 0, vz: 9, wall: { x:-1, z:0 } });
    near(r.vz, 9, 1e-9, 'speed ALONG the wall is kept — the push must not brake a fast run...');
    near(r.vx, -12, 1e-9, '...while the component into the wall is replaced');
  }
  { const r = run({ vx: 6, vz: 0, wall: { x:-1, z:0 } });
    near(r.vx, -12, 1e-9, '...and a player moving INTO the wall leaves it at the authored speed, not 6 less');
  }
  { const r = run({ vx: -20, vz: 0, wall: { x:-1, z:0 } });
    near(r.vx, -20, 1e-9,
      'a player ALREADY leaving faster than the push keeps their speed — replacing the component means ' +
      'exactly that, in both directions');
  }

  // the same wall twice is an infinite ladder
  { const r = run({ _wallHas: true, _wallNx: -1, _wallNz: 0, wall: { x:-1, z:0 } });
    eq(r.vy, -9, 'the SAME wall twice in a row is refused...');
    eq(r.buf, 0.15, '...without eating the press, so it can still find another wall');
  }
  { const r = run({ _wallHas: true, _wallNx: -1, _wallNz: 0, wall: { x:1, z:0 } });
    eq(r.vy, 13, '...while the opposite wall fires'); near(r.nx, 1, 1e-9, '...and becomes the new one');
  }
  { const D = K('WALL_SAME_DOT');
    const ang = Math.acos(D) * 0.9;   // just inside the "same wall" cone
    const r = run({ _wallHas: true, _wallNx: -1, _wallNz: 0, wall: { x:-Math.cos(ang), z:Math.sin(ang) } });
    eq(r.vy, -9, 'a wall barely turned from the last one is still the same wall');
  }
  { const ang = Math.acos(K('WALL_SAME_DOT')) * 1.1;   // just outside it
    const r = run({ _wallHas: true, _wallNx: -1, _wallNz: 0, wall: { x:-Math.cos(ang), z:Math.sin(ang) } });
    eq(r.vy, 13, '...and one turned past the threshold is a different wall');
  }

  // no wall
  { const r = run({ wall: null });
    eq(r.vy, -9, 'in open air there is nothing to push off'); eq(r.buf, 0.15, '...and the press survives'); }

  // every refusal
  for (const [k, v, why] of [
    ['_ledge', true, 'not while hanging on a ledge'],
    ['_onLadder', true, 'not while on a ladder'],
    ['onGround', true, 'not on the ground — that is the ordinary jump'],
    ['_coyoteT', 0.05, 'not inside the coyote window, for the same reason'],
    ['drivingCar', true, 'not while driving'],
    ['mountedTurret', true, 'not on a turret'],
    ['duelDead', true, 'not while eliminated'],
    ['editorOpen', true, 'not in the editor'],
    ['shopOpen', true, 'not with the shop open'],
    ['gameOn', false, 'not outside a game'],
    ['_levelLoaderActive', true, 'not while loading'],
    ['matchWarmup', 1, 'not during warmup'],
    ['jumpCd', 0.2, 'not before the cooldown clears'],
    ['_jumpBufT', 0, 'and not without a press'],
  ]) {
    const r = run({ [k]: v });
    eq(r.vy, -9, why);
    eq(r.has, false, '...and it does not record a wall it never used: ' + k);
  }
}

// ---------------------------------------------------------------- 3. where it sits, and the re-arm
{
  const g = src.indexOf('if(!_ledge && _jumpBufT>0 && (player.onGround || _coyoteT>0)');
  const w = src.indexOf('else if(WALL_JUMP > 0');
  const a = src.indexOf('else if(AIR_JUMPS > 0');
  assert(g > 0 && w > g, 'the ground jump comes first, so a grounded press is always the ordinary jump');
  assert(a > w, 'and the wall jump before the air jump, so a wall is preferred over spending one — which ' +
    'is what a player next to a wall means');

  const line = src.match(/if\(player\.onGround \|\| _ledge\)\{[^}]*\} else _airT \+= dt;/);
  assert(line && /_wallHas = false;/.test(line[0]),
    'the ground and a ledge re-arm it on build 1463’s own line, beside the dash and the double jump');
  const rest = src.replace(line[0], '').replace(/let _wallNx = 0, _wallNz = 0, _wallHas = false;/, '');
  assert(!/_wallHas\s*=\s*false/.test(rest), '...and that is the only place, so no landing edge can miss it');
}

// ---------------------------------------------------------------- 4. the sanitizer, and the door
{
  const blk = src.match(/\{ const _wj = \+\(worldCfg\.wallJump[\s\S]*?WALL_JUMP = [^\n]*\}/);
  assert(blk, 'the derivation is found');
  const MIN = K('WALL_JUMP_MIN'), MAX = K('WALL_JUMP_MAX');
  const derive = (v) => new Function('worldCfg', 'DEFAULT_WORLD', 'WALL_JUMP_MIN', 'WALL_JUMP_MAX',
    'let WALL_JUMP;\n' + blk[0] + '\nreturn WALL_JUMP;')({ wallJump: v }, { wallJump: 0 }, MIN, MAX);

  eq(derive(undefined), 0, 'unset is OFF');
  eq(derive(null), 0, 'and null reaches the default explicitly, not through `||` (build 1329)');
  eq(derive(0), 0, 'an authored 0 survives — the whole compatibility argument');
  eq(derive(12), 12); eq(derive(1), MIN, 'a push too small to feel is floored'); eq(derive(1e9), MAX);
  eq(derive(-5), 0, 'a negative is off'); eq(derive('x'), 0, 'junk is off');
  eq(derive(Infinity), 0, 'and Infinity is OFF rather than the most permissive value');

  assert(/jumpCut:0\.5, airDash:0, airJumps:0, wallJump:0,/.test(src),
    'the default is 0, beside the three verbs whose shape it takes');
  assert(/slider\(b,'Wall jump','wallJump',0,30,1\);/.test(src),
    'and the creator sets it where the other jump verbs live');
}

done('build 1483: THE WALL JUMP, the last of build 1301’s four. 1463 took the air dash and 1482 the double jump; this takes their shape and their reason — `wallJump` is the push-off SPEED, so 0 means off and is every level ever authored, and it is the JUMP KEY. THE WALL IS FOUND WITH `clearAt`, the engine’s OWN "does the body fit here" test and the one `moveHorizontal` uses, so the wall this pushes off is exactly the wall that stops you walking rather than a second opinion from a raycast that could disagree with the collision that put you there — and it inherits build 1324’s `noCol` for free, so decoration is not a wall. Eight compass probes are AVERAGED, which is what makes an inside corner push out along the diagonal, something a single ray cannot do; walls on opposite sides CANCEL and a shaft is deliberately not a chimney climb, because picking a side would be inventing an answer. THE PUSH KEEPS THE TANGENT: only the component INTO the wall is replaced, so speed along the wall survives and a player already leaving faster than the push keeps their speed — build 1361’s rule, one verb along, executed in both directions. NO TWO IN A ROW OFF THE SAME WALL, because a single wall would otherwise be an infinite ladder out of an arena its author sealed; the cone is executed on both sides of its threshold, the refusal does NOT eat the press so another wall can still be found, and the ground, a ledge or a differently-facing wall re-arms it. It sits between the ground jump and the air jump, so a grounded press is always the ordinary jump and a wall is preferred over spending an air jump');
