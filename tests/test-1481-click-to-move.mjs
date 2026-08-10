// build 1481 — click to move.
//
// Build 1467's request was "point-click type NAVIGATION". That build delivered the cursor, and 1479/1480
// made the world answer it — and the player still could not be told where to WALK, which is the defining
// verb of a point-and-click adventure, an ARPG and an RTS.

import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const K = (n) => +extractConst(n, src);

// ---------------------------------------------------------------- 1. it supplies a WISH, nothing else
// This is what makes it small rather than a second movement system: gravity, collision, slopes, water,
// crouch and build 1171's acceleration model are all downstream of `wish` and untouched.
{
  const st = extractFunction('_cmSteer', src);
  for (const forbidden of ['player.vel', 'player.pos.x =', 'player.pos.z =', 'onGround', 'insideSolid', 'groundHeightAt'])
    assert(st.indexOf(forbidden) < 0, '_cmSteer never touches ' + forbidden + ' — it returns a direction');
  assert(/return _cmDir\.set\(wx\/L, 0, wz\/L\);/.test(st), '...a unit direction on the ground plane');
  assert(/const _cmDir = new THREE\.Vector3\(\);/.test(src),
    '...into a hoisted vector, not a fresh one per frame (build 1168)');
}

// ---------------------------------------------------------------- 2. ONE pathfinder, driven by a shim
{
  const go = extractFunction('_cmGoTo', src), st = extractFunction('_cmSteer', src);
  assert(/_botRepath\(_cmAgent, x, z, y\)/.test(go), 'the route comes from the bots’ own repath...');
  assert(/_botFollowPath\(_cmAgent, _cmGoalX, _cmGoalZ, dt, _cmGoalY\)/.test(st), '...and their own follow');
  assert(!/navFindPath|navCellCenter/.test(go + st),
    'there is no second pathfinder here to disagree with the first');
  assert(/const _cmAgent = \{ pos:null, path:null, pathI:0, pathT:0, pathGoalX:0, pathGoalZ:0 \};/.test(src),
    'the shim carries exactly the fields those two functions read (build 1189’s technique)');
  assert(/_cmAgent\.pos = player\.pos;/.test(st), '...pointed at the live player position each frame');
}

// ---------------------------------------------------------------- 3. the steer, EXECUTED
{
  const mk = (over) => {
    const O = { cancels: 0, jumpBuf: 0, repaths: 0 };
    const st = Object.assign({ on:true, enabled:true, gameOn:true, px:0, pz:0,
                               gx:10, gz:0, wp:{ x:1, z:0, y:0, jump:false } }, over);
    const env = {
      player: { pos: { x:st.px, y:1.7, z:st.pz } },
      gameOn: st.gameOn,
      JUMP_BUF: 0.15,
      THREE: { Vector3: class { set(a,b,c){ this.x=a; this.y=b; this.z=c; return this; } } },
      _botFollowPath: () => { if (st.throwFollow) throw new Error('x'); return st.wp; },
      _cmEnabled: () => st.enabled,
    };
    const body = [
      'const CM_ARRIVE = ' + K('CM_ARRIVE') + ', CM_STALL = ' + K('CM_STALL') + ', CM_STALL_DIST = ' + K('CM_STALL_DIST') + ';',
      'const _cmDir = new THREE.Vector3();',
      'let _cmGoalX = ' + st.gx + ', _cmGoalZ = ' + st.gz + ', _cmGoalY = 0;',
      'let _cmOn = ' + st.on + ', _cmStallT = 0, _cmLastX = ' + st.px + ', _cmLastZ = ' + st.pz + ';',
      'let _jumpBufT = 0;',
      'const _cmAgent = { pos:null, path:null, pathI:0, pathT:0, pathGoalX:0, pathGoalZ:0 };',
      'function _cmCancel(){ O.cancels++; _cmOn = false; _cmAgent.path = null; }',
      extractFunction('_cmSteer', src),
      'return { steer:_cmSteer, on:()=>_cmOn, jb:()=>_jumpBufT, move:(x,z)=>{ player.pos.x=x; player.pos.z=z; } };',
    ].join('\n');
    const r = new Function(...Object.keys(env), 'O', body)(...Object.values(env), O);
    return { ...r, O, st, env };
  };

  { const r = mk({});
    const d = r.steer(0.016);
    assert(d, 'a live route steers');
    near(d.x, 1, 1e-9, '...toward the waypoint'); near(d.z, 0, 1e-9);
    near(Math.hypot(d.x, d.z), 1, 1e-9, '...as a unit direction, so speed is decided downstream');
    eq(r.on(), true, '...and the route survives the frame');
  }

  { const r = mk({ wp:{ x:3, z:4, y:0, jump:false } });
    const d = r.steer(0.016);
    near(d.x, 0.6, 1e-9, 'a diagonal waypoint normalises'); near(d.z, 0.8, 1e-9);
  }

  // arrival
  { const r = mk({ px:9.7, gx:10 });
    eq(r.steer(0.016), null, 'inside the arrive radius the route ends');
    eq(r.on(), false); eq(r.O.cancels, 1, '...by cancelling, not by going quiet');
  }
  { const r = mk({ px:10 - K('CM_ARRIVE') - 0.01, gx:10 });
    assert(r.steer(0.016), 'and just outside it, it does not');
  }

  // the hop — through the press buffer, so build 1160's gates decide
  { const r = mk({ wp:{ x:1, z:0, y:2, jump:true } });
    r.steer(0.016);
    eq(r.jb(), 0.15, 'a route that needs a hop presses JUMP rather than writing velocity');
  }
  { const r = mk({}); r.steer(0.016); eq(r.jb(), 0, '...and a flat one never does'); }

  // the stall — a route that stops making progress is abandoned
  { const r = mk({});
    for (let i = 0; i < 60; i++) r.steer(0.016);   // ~0.96 s, never moving
    eq(r.on(), false, 'a route that makes no progress for the stall window is abandoned');
    assert(r.O.cancels >= 1);
  }
  { const r = mk({});
    for (let i = 0; i < 60; i++) { r.move(i * 0.05, 0); r.steer(0.016); }
    eq(r.on(), true, '...while a route that IS making progress is not');
  }

  // every giving-up exit cancels, so a route can never outlive its usefulness
  { const r = mk({ wp:null });
    eq(r.steer(0.016), null, 'no usable route: give up');
    eq(r.on(), false, '...and CANCEL — a bot beelines here and the player must not, because beelining is ' +
      'how you walk into the wall the grid was routing you around');
  }
  { const r = mk({ throwFollow:true });
    eq(r.steer(0.016), null, 'a throwing follow cannot escape into the frame loop');
    eq(r.on(), false, '...and cancels');
  }
  { const r = mk({ gameOn:false });
    eq(r.steer(0.016), null, 'no game, no route'); eq(r.on(), false); }
  { const r = mk({ enabled:false });
    eq(r.steer(0.016), null, 'switched off, no route'); }
  { const r = mk({ on:false }); eq(r.steer(0.016), null, 'no route, nothing to do'); eq(r.O.cancels, 0,
      '...and it does not cancel something that was never running'); }
  { const r = mk({ wp:{ x:0, z:0, y:0, jump:false } });
    eq(r.steer(0.016), null, 'a waypoint we are standing on yields no direction rather than a NaN one');
    eq(r.on(), true, '...and keeps the route, since the next frame advances past it'); }
}

// ---------------------------------------------------------------- 4. who wins the click, and the keys
{
  const gate = src.match(/if\(e\.button===0\)\{ if\(!_propClick\(e\)\) _cmClickGround\(e\); \}/);
  assert(gate, 'a click the world ANSWERS is not also a move order — that priority is what a ' +
    'point-and-click player expects, and `_propClick` already reports which happened');

  const mv = src.match(/if\(wish\.lengthSq\(\) > 1e-6\)\{ if\(_cmOn\) _cmCancel\(\); \}\s*\n\s*else \{ const _cmd = _cmSteer\(dt\); if\(_cmd\)\{ wish\.copy\(_cmd\); moveScale = 1; \} \}/);
  assert(mv, 'any manual input takes control straight back — a route that fights the keys is worse than ' +
    'no route');
  assert(src.indexOf('if(wish.lengthSq() > 1e-6)') > src.indexOf('if(keys[BINDS.left]) wish.sub(right);'),
    '...asked AFTER the keys and the stick have had their say');
  assert(src.indexOf('if(wish.lengthSq() > 1e-6)') < src.indexOf("if(pvpMode() && duelDead){ wish.set(0,0,0)"),
    '...and BEFORE the freeze lines, so a pause or a loading level stops the walk without throwing the ' +
    'route away');
}

// ---------------------------------------------------------------- 5. the ground pick
{
  const cg = extractFunction('_cmClickGround', src);
  assert(/if\(document\.pointerLockElement\) return false;/.test(cg),
    'a captured pointer has nothing to aim at the ground with');
  assert(/_firstSolidHit\(hits\)/.test(cg),
    'build 1236 again: an undrawn surface is not a floor you can be sent to');
  /* the CALL, not the `return` keyword in front of it — build 1484 needed the answer in a local so it could
     also drive the destination cue. The content this always protected is the argument ORDER (x, z, y). */
  assert(/_cmGoTo\(hit\.point\.x, hit\.point\.z, hit\.point\.y\)/.test(cg), '...and the hit point is the goal');
  assert(/return ok;/.test(cg), '...and that answer is what the caller is told');
  const tg = extractFunction('_cmTargets', src);
  assert(/_cmTgt\.length = 0;/.test(tg), 'the target list is reused rather than rebuilt (build 1168)');
  assert(/floor/.test(tg) && /colliders/.test(tg), '...and covers the ground plane and the level’s solids');

  const go = extractFunction('_cmGoTo', src);
  assert(/if\(navNearestWalkable\(x, z, y\) < 0\) return false;/.test(go),
    'a click at somewhere with no walkable cell REFUSES rather than shuffling the player at a wall');
  assert(/!NAV\.built/.test(go), '...and a level with no nav grid yet simply does not accept move orders');
}

// ---------------------------------------------------------------- 6. off by default, and it travels
{
  assert(!/clickMove:\s*true/.test(src), 'nothing turns it on by default...');
  eq((src.match(/gameCfg\.clickMove\s*=\s*!!g\.clickMove/g) || []).length, 2,
    '...both runtime loaders ALWAYS assign it, so it cannot leak from the previous level (build 1400)');
  assert(/clickMove: !!gameCfg\.clickMove/.test(src), '...and the serializer writes it');

  const en = extractFunction('_cmEnabled', src);
  assert(/gameCfg\.clickMove && gameCfg\.freeCursor/.test(en),
    'it rides the free cursor rather than becoming a second answer to "is the mouse a pointer"');
  assert(/cmCb\.disabled=!gameCfg\.freeCursor;/.test(src),
    'and the editor control is DISABLED without it rather than present and inert (build 1338)');
  assert(/<b>Click to move<\/b>/.test(src), '...with a name a creator can find');
  assert(/around walls, up steps, onto a second storey/.test(src),
    '...and a hint that says what the route can do');
  assert(/Any WASD or stick input takes control straight back, and a route that stops making progress is abandoned/.test(src),
    '...and states the two behaviours that would otherwise be discovered by surprise');
}

done('build 1481: CLICK TO MOVE. Build 1467’s request was "point-click type NAVIGATION" — that build delivered the cursor, 1479 and 1480 made the world answer it, and the player still could not be told where to WALK, which is the defining verb of a point-and-click adventure, an ARPG and an RTS. It supplies the WISH VECTOR and nothing else: gravity, collision, slopes, water, crouch and build 1171’s acceleration model are all downstream of `wish` and untouched, which is what makes this small rather than a second movement system — asserted as an absence, since `_cmSteer` never names velocity, position, onGround or the ground query. The route is the ENGINE’S OWN nav grid through the bots’ own `_botRepath`/`_botFollowPath`, driven by a shim pointed at `player.pos` (build 1189’s technique), so there is no second pathfinder to disagree with the first and the player inherits build 1200’s two storeys and its dirty-patch re-sampling for free. A route that needs a hop sets the JUMP PRESS BUFFER rather than writing velocity, so it goes through build 1160’s coyote, buffer and cooldown gates instead of behind their backs. Every giving-up exit CANCELS — arrival, a stall, no usable route, a throwing follow, the game ending — because a bot beelines when the grid fails and the player must not: beelining is how you walk into the wall the grid was routing you around. A click on something the world answers is NOT also a move order, any manual input takes control straight back, and the steer sits above the freeze lines so a pause stops the walk without discarding the route');
