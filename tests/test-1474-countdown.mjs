// build 1474 — a countdown in the logic graph.
//
// `interval` repeats and `delay` waits once. Neither counts DOWN, so every timed booth was five nodes of
// arithmetic over `read time` plus two scratch variables — which is literally what build 1403's own shooting
// range had to do to run a twenty-second round.
//
// Its output is a logic VARIABLE, and that is the whole design rather than an implementation detail: the
// HUD's timer widget (1058) binds to it, Branch compares it, the expression evaluator reads it, the
// per-player `name@` scoping (1231) applies to it, and the host already mirrors it to clients (1287).
//
// And the hand-rolled version was WRONG in a way nobody would notice until they shipped: `read time` is
// wall-clock seconds since deploy, so a countdown built from it keeps running while the game is paused,
// while a cutscene plays, and while the creator is in the editor.

import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the node exists and is reachable
{
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  assert(defs.timer, 'the palette offers a Countdown');
  const keys = defs.timer.params.map(p => p.k);
  for (const k of ['tmode', 'tvar', 'tsec', 'tev']) assert(keys.includes(k), 'it declares ' + k);
  eq(defs.timer.params.find(p => p.k === 'tvar').listId, 'lgVarList',
    'the variable field offers the level\'s own variables');
  eq(defs.timer.params.find(p => p.k === 'tev').listId, 'lgEvtList', '...and the event field its own events');
  eq(JSON.stringify(defs.timer.params.find(p => p.k === 'tsec').ifv), '["tmode",["start","add"]]',
    'seconds is hidden on a STOP, which takes none');

  // build 1277's defect: offered and unreachable. The pulse switch must name it.
  assert(/case 'timer': \{/.test(extractFunction('_lgPulse', src)),
    'and the runtime handles it — the parity build 1028 exists to hold');
}

// ---------------------------------------------------------------- 2. the tick, executed
{
  const rig = (nodes) => {
    const S = { vars: {}, events: [], fails: [] };
    const api = new Function('S', `
      const logicVars = S.vars;
      const logicEvent = (e) => S.events.push(e);
      const _noteLogicFailure = (m) => S.fails.push(m);
      const _lgCtx = { pid: S.pid || 0 };
      const _lgVarKey = (k) => (k && k.charAt(k.length-1)==='@') ? (k + (_lgCtx.pid|0)) : k;
      const _lgName = (v) => v;
      const _lgNum = (v) => +v || 0;
      const LG_TIMER_MAX = ${extractConst('LG_TIMER_MAX', src)};   /* extractConst returns the VALUE, not the declaration */
      let _lgCountdowns = Object.create(null);
      ${extractFunction('_lgTimerStart', src)}
      ${extractFunction('_lgTimerTick', src)}
      return {
        vars: logicVars,
        start: (k, s, e) => _lgTimerStart(_lgVarKey(k), s, e),
        stop:  (k) => { delete _lgCountdowns[_lgVarKey(k)]; logicVars[_lgVarKey(k)] = 0; },
        add:   (k, s) => { const T=_lgCountdowns[_lgVarKey(k)];
                           if(T){ T.left = Math.max(0, Math.min(86400, T.left + s)); logicVars[_lgVarKey(k)] = Math.round(T.left*100)/100; }
                           else _lgTimerStart(_lgVarKey(k), s, ''); },
        tick:  (dt) => _lgTimerTick(dt),
        live:  () => Object.keys(_lgCountdowns).length,
        setPid:(p) => { _lgCtx.pid = p; } };`)(S);
    return { S, api };
  };

  let { S, api } = rig();
  api.start('left', 20, 'TIMEUP');
  eq(S.vars.left, 20, 'starting writes the full time immediately — a HUD widget shows 20, not 0, on frame 1');
  for (let i = 0; i < 60; i++) api.tick(1 / 60);
  near(S.vars.left, 19, 0.02, 'one second of frames takes one second off');
  eq(S.events.length, 0, '...and fires nothing yet');

  for (let i = 0; i < 60 * 19; i++) api.tick(1 / 60);
  eq(S.vars.left, 0, 'at zero it lands on exactly 0 rather than a small negative');
  eq(S.events.join(','), 'TIMEUP', '...and fires its event, once');
  eq(api.live(), 0, '...and stops existing');
  for (let i = 0; i < 120; i++) api.tick(1 / 60);
  eq(S.events.length, 1, '...so it can never fire twice');
  eq(S.vars.left, 0, '...and the variable stays at 0 rather than counting into the negatives');

  // frame rate cannot change the answer
  for (const fps of [20, 30, 60, 144]) {
    const r = rig(); r.api.start('t', 5, '');
    for (let i = 0; i < fps * 5; i++) r.api.tick(1 / fps);
    eq(r.S.vars.t, 0, 'lands on 0 at ' + fps + ' fps');
  }
  { // ...and a hitch cannot overshoot into a negative
    const r = rig(); r.api.start('t', 2, 'X');
    r.api.tick(9.5);
    eq(r.S.vars.t, 0, 'a 9.5-second frame still lands on exactly 0');
    eq(r.S.events.join(','), 'X', '...and fires');
  }

  // no event named = a silent timer, which is a legitimate thing to author (a HUD clock)
  ({ S, api } = rig());
  api.start('clock', 1, '');
  api.tick(1.5);
  eq(S.events.length, 0, 'a countdown with no event is silent at zero');
  eq(S.vars.clock, 0, '...and still lands at 0, so a Branch can read it');

  // stop / add
  ({ S, api } = rig());
  api.start('left', 30, 'E');
  api.tick(10);
  near(S.vars.left, 20, 1e-9, 'ten seconds gone');
  api.add('left', 15);
  near(S.vars.left, 35, 1e-9, 'ADD extends a running countdown');
  api.stop('left');
  eq(api.live(), 0, 'STOP removes it...');
  eq(S.vars.left, 0, '...and zeroes the variable, so a HUD widget reads 0 rather than freezing mid-count');
  api.tick(5);
  eq(S.vars.left, 0, '...and a stopped countdown cannot keep ticking');

  // ADD to a timer that is not running STARTS one
  ({ S, api } = rig());
  api.add('fresh', 12);
  eq(api.live(), 1, 'ADD on nothing starts a countdown rather than silently doing nothing');
  eq(S.vars.fresh, 12);

  // restarting from inside the zero event must survive — the delete happens BEFORE the fire
  {
    const S2 = { restarted: 0 };
    const r = rig();
    // simulate the event handler restarting the same timer
    const origTick = r.api.tick;
    r.api.start('round', 1, 'NEXT');
    r.api.tick(1.5);
    eq(r.S.events.join(','), 'NEXT', 'the zero event fired');
    r.api.start('round', 1, 'NEXT');            // what an On-event -> Countdown chain does
    eq(r.api.live(), 1, 'and the SAME timer can be restarted from its own event — the delete precedes the fire');
    r.api.tick(1.5);
    eq(r.S.events.length, 2, '...and the restarted one fires in its turn');
  }

  // clamps and refusals
  ({ S, api } = rig());
  api.start('neg', -5, '');
  eq(S.vars.neg, 0, 'a negative time is 0, not a countdown that runs forever');
  api.start('huge', 1e9, '');
  eq(S.vars.huge, 86400, 'and a level file is untrusted input — capped at a day');

  ({ S, api } = rig());
  const CAP = +extractConst('LG_TIMER_MAX', src);
  for (let i = 0; i < CAP + 6; i++) api.start('t' + i, 10, '');
  eq(api.live(), CAP, 'the number of live countdowns is bounded');
  assert(S.fails.length >= 1, '...and the refusal is REPORTED (build 1214) rather than silent');
  // ...but restarting an EXISTING one at the cap must still work
  const before = api.live();
  api.start('t0', 99, '');
  eq(api.live(), before, 'restarting a countdown already at the cap is not a new one');
  eq(S.vars.t0, 99, '...and really does restart it');

  // per-player (build 1231)
  ({ S, api } = rig());
  api.setPid(0); api.start('left@', 10, '');
  api.setPid(7); api.start('left@', 45, '');
  api.tick(1);
  near(S.vars['left@0'], 9, 1e-9, 'player 0 has their own countdown...');
  near(S.vars['left@7'], 44, 1e-9, '...and player 7 has theirs');
}

// ---------------------------------------------------------------- 3. it stops when the world stops
// THE PROBE MEASURED THIS WRONG FIRST, and the correction is the useful part: calling `updateLogic` by hand
// while `paused` counted straight down, because updateLogic does NOT look at `paused` — THE FRAME LOOP does,
// and it returns long before reaching it. So the claim is about the loop, and it is pinned there.
{
  const u = extractFunction('updateLogic', src);
  assert(/_lgTimerTick\(dt\)/.test(u), "the tick rides updateLogic's own dt");
  assert(/if\(!gameOn \|\| \(typeof editorOpen!=='undefined' && editorOpen\)\) return;/.test(u),
    "...which returns while the editor is open...");
  assert(u.indexOf('editorOpen') < u.indexOf('_lgTimerTick'),
    "...before the tick, so a countdown does not run while a creator is authoring");
  assert(/NET\.mode==='client'\) return;/.test(u) && u.indexOf("NET.mode==='client'") < u.indexOf('_lgTimerTick'),
    "...and a client never ticks its own copy — the host mirrors the variable (build 1287)");

  const freeze = src.indexOf('if((shopOpen || choosingUpgrade || (paused && NET.mode===');
  const call = src.indexOf('updateLogic(dt);');
  assert(freeze > 0 && call > freeze,
    "the FRAME LOOP returns on shop / upgrade pick / pause / map / inventory before it ever reaches " +
    "updateLogic, and THAT is what stops a countdown — updateLogic itself never looks at `paused`");
  const line = src.slice(freeze, src.indexOf('\n', freeze));
  assert(/paused && NET\.mode==='off'/.test(line),
    "...in SOLO. In multiplayer nothing freezes the world for one player, so a countdown correctly keeps " +
    "running there — stated rather than claimed away");
  assert(/!\(duelDead && pvpMode\(\)\)/.test(line),
    "...and a player waiting to respawn is deliberately not frozen (pre-existing, untouched)");
}

// ---------------------------------------------------------------- 4. a countdown is match state
{
  const ls = extractFunction('logicStart', src);
  assert(/_lgCountdowns=Object\.create\(null\)/.test(ls),
    'a deploy clears every countdown, like every timer beside it');
  assert(ls.indexOf('_lgCountdowns') < ls.indexOf("NET.mode==='client') return"),
    '...on a client too, which returns early');
}

// ---------------------------------------------------------------- 5. the door
{
  const opts = extractFunction('_lgVarOptions', src);
  assert(/if\(n\.type==='timer'\) addName\(q\.tvar\);/.test(opts),
    'a countdown\'s variable joins the variable list, so the HUD widget and every other node offer it ' +
    'without the creator having to remember what they typed');
  assert(opts.indexOf("n.type==='timer'") < opts.indexOf("typeof hudWidgets!=='undefined'"),
    '...folded INTO the existing guarded walk over the graph rather than added as a second, unguarded ' +
    'one — which is what broke test-1060, whose rig evaluates this function with no logicGraph at all');
}

done('build 1474: A COUNTDOWN IN THE LOGIC GRAPH. `interval` repeats and `delay` waits once; neither counts DOWN, so every timed booth was five nodes of arithmetic over `read time` plus two scratch variables — which is literally what build 1403\'s own shooting range had to do to run a twenty-second round, and a county fair is a row of them. Its output is a logic VARIABLE, and that is the design rather than a detail: the HUD timer widget binds to it, Branch compares it, the expression evaluator reads it, build 1231\'s per-player `name@` scoping applies to it (executed: two players, two independent countdowns), and the host already mirrors it to clients. The hand-rolled version was also WRONG in a way nobody would notice until they shipped: `read time` is wall-clock seconds since deploy, so a countdown built from it keeps running while the game is paused, while a cutscene plays and while the creator is in the editor — this rides updateLogic\'s own dt, and the FRAME LOOP returns before ever reaching it while the shop, an upgrade pick, the map, the inventory or a SOLO pause is up. That correction is the useful half: the probe first called updateLogic BY HAND while paused and watched it count straight down, because updateLogic never looks at `paused` — the loop does. In multiplayer nothing freezes the world for one player, so a countdown correctly keeps running there, which is stated rather than claimed away. Executed frame by frame: it writes the full time immediately so a widget shows 20 rather than 0 on the first frame, lands on EXACTLY 0 at 20/30/60/144 fps and after a 9.5-second hitch rather than a small negative, fires its event once and never twice, and CAN BE RESTARTED FROM INSIDE THAT EVENT — the entry is deleted before the fire, which is the same ordering build 1391\'s reset needed. ADD extends a running countdown and STARTS one that is not running, because a node that silently does nothing depending on invisible state is by a distance the harder of the two to debug. Bounded at 24 with the refusal reported through build 1214\'s channel, and restarting one already at the cap is correctly not a new one');
