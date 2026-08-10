// build 1480 — the cursor says what is clickable.
//
// Build 1479 gave the world an On-click trigger and left the affordance out. In a point-and-click level the
// cursor changing over a live object is not decoration — it IS how the player finds the game. Every
// adventure, tycoon and RTS has it.

import { gameSource, html, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();   // the game script
// CSS lives in the markup, not the script block — the harness exports `html` for exactly this

// ---------------------------------------------------------------- 1. ONE resolver, two callers
// The worst possible version of this file's most-repeated defect would be a cursor that says a thing is
// clickable and a click that disagrees.
{
  assert(/function _clkResolve\(x, y\)\{/.test(src), 'the resolution has one home...');
  eq((src.match(/_clkResolve\(/g) || []).length, 3,
    '...and exactly two callers beside it — the click and the hover cue');
  const pc = extractFunction('_propClick', src);
  assert(/const o = _clkResolve\(e\.clientX, e\.clientY\);/.test(pc),
    'the click asks it...');
  assert(!/intersectObjects|_firstSolidHit|when === 'clicked'/.test(pc),
    '...and holds no copy of the resolution itself');
  const ht = extractFunction('_clkHoverTick', src);
  assert(/_clkSetHot\(!!_clkResolve\(_clkMx, _clkMy\)\);/.test(ht), 'and so does the hover');
  assert(!/intersectObjects|_firstSolidHit/.test(ht), '...with no second copy either');
}

// ---------------------------------------------------------------- 2. the tick, EXECUTED
{
  const EVERY = +extractConst('CLK_HOVER_EVERY', src);
  const SCAN  = +extractConst('CLK_SCAN_EVERY', src);
  eq(EVERY, 4, 'the hover is throttled — 15 Hz is imperceptible from 60 for a cursor');
  eq(SCAN, 30, '...and the "is there anything clickable" question is asked far less often still');

  const mk = (over) => {
    const O = { hot: null, resolves: 0, scans: 0, writes: 0 };
    const st = Object.assign({ locked:false, blocked:false, gameOn:true, hits:false, mx:100, my:100,
                               props:[{ userData:{ signals:[{ when:'clicked' }] } }] }, over);
    const env = {
      document: { get pointerLockElement(){ return st.locked ? {} : null; },
                  body: { classList: { toggle(c, v){ O.writes++; O.hot = v; } } } },
      gameOn: st.gameOn,
      propModels: st.props,
      _clkBlocked: () => st.blocked,
      _clkResolve: () => { O.resolves++; return st.hits ? {} : null; },
      _firstSolidHit: null, renderer: null, camera: null, _clkV2: null, _clkRay: null, CLICK_RANGE: 60,
    };
    const body = [
      'const CLK_HOVER_EVERY = ' + EVERY + ', CLK_SCAN_EVERY = ' + SCAN + ';',
      'let _clkAny = false, _clkTick = 0, _clkHot = false, _clkMx = ' + st.mx + ', _clkMy = ' + st.my + ';',
      extractFunction('_clkSetHot', src),
      '(function(){ const real = _clkAnyClickable; _clkAnyClickable = real; })();',
      extractFunction('_clkAnyClickable', src).replace('function _clkAnyClickable', 'var _clkAnyClickableReal = function _clkAnyClickable'),
      ';function _clkAnyClickable(){ O.scans++; return _clkAnyClickableReal(); }',
      extractFunction('_clkHoverTick', src),
      'return { tick:_clkHoverTick, hot:()=>_clkHot };',
    ].join('\n');
    const r = new Function(...Object.keys(env), 'O', body)(...Object.values(env), O);
    return { ...r, O, st };
  };

  // the ordinary case: a level with a clickable prop, cursor over it
  {
    const r = mk({ hits:true });
    for (let i = 0; i < 8; i++) r.tick();
    eq(r.hot(), true, 'hovering a clickable prop turns the cue ON');
    eq(r.O.hot, true, '...by toggling the body class');
    eq(r.O.writes, 1, '...written ONCE, not every frame — this runs in every session forever');
  }

  // and off again, with one more write
  {
    const r = mk({ hits:true });
    for (let i = 0; i < 8; i++) r.tick();
    r.st.hits = false;
    for (let i = 0; i < 8; i++) r.tick();
    eq(r.hot(), false, 'moving off it turns the cue off');
    eq(r.O.writes, 2, '...for exactly one more class write');
  }

  // a level with NOTHING clickable pays no raycast at all
  {
    const r = mk({ props:[{ userData:{ signals:[{ when:'damaged' }] } }, { userData:{} }], hits:true });
    for (let i = 0; i < 40; i++) r.tick();
    eq(r.O.resolves, 0, 'a level with no clickable prop never casts a ray — which is almost every level');
    eq(r.hot(), false);
    assert(r.O.scans > 0 && r.O.scans <= 3, 'and asks the cheap question only a couple of times in 40 frames');
  }

  // the throttle
  {
    const r = mk({ hits:true });
    for (let i = 0; i < 40; i++) r.tick();
    eq(r.O.resolves, 10, '40 frames cost 10 raycasts, not 40');
  }

  // a prop that becomes clickable at run time gets its cue without a deploy
  {
    const r = mk({ props:[{ userData:{ signals:[{ when:'damaged' }] } }], hits:true });
    for (let i = 0; i < 10; i++) r.tick();
    eq(r.hot(), false, 'nothing clickable yet');
    r.st.props[0].userData.signals = [{ when:'clicked' }];
    for (let i = 0; i < 40; i++) r.tick();
    eq(r.hot(), true, '...and a prop spawned or changed at run time is picked up within half a second');
  }

  // every reason to be off, and each one turns it off rather than leaving it stuck
  for (const [k, v, why] of [['locked', true, 'a captured pointer has no cursor to change'],
                             ['blocked', true, 'a modal, the map, the inventory, a pause, the editor or being eliminated'],
                             ['gameOn', false, 'not in a game']]) {
    const r = mk({ hits:true });
    for (let i = 0; i < 8; i++) r.tick();
    eq(r.hot(), true, 'on first');
    r.st[k] = v;
    if (k === 'gameOn') { /* gameOn is captured by value in the rig; assert the source term instead */ }
    else { r.tick(); eq(r.hot(), false, why); }
  }
  assert(/!\(typeof gameOn!=='undefined' && gameOn\)/.test(extractFunction('_clkHoverTick', src)),
    'and the tick is off outside a game');

  // the pointer has to have been seen
  {
    const r = mk({ hits:true, mx:-1 });
    for (let i = 0; i < 8; i++) r.tick();
    eq(r.hot(), false, 'before the pointer has ever moved there is nothing to be over');
    eq(r.O.resolves, 0, '...and no ray is cast for it');
  }
}

// ---------------------------------------------------------------- 3. the two gates cannot drift
// `_clkBlocked` and the mousedown gate are two expressions. They govern different things — that gate also
// covers the grab, ADS and the action binds — so they are not merged; what must never happen is a cursor
// that says clickable while a click would be swallowed.
{
  const gate = src.match(/if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen \|\| _modalOpen\) return;/);
  assert(gate, 'the mousedown gate is found');
  const blocked = extractFunction('_clkBlocked', src);
  for (const st of ['shopOpen', 'editorOpen', 'paused', 'mapOpen', 'duelDead', 'invOpen', '_modalOpen']) {
    assert(gate[0].indexOf(st) > 0, 'the click gate names ' + st);
    assert(blocked.indexOf(st) > 0, '...and so does the hover gate: ' + st);
  }
  // and nothing else — a state in one and not the other IS the drift
  const extra = (blocked.match(/\b(shopOpen|editorOpen|paused|mapOpen|duelDead|invOpen|_modalOpen|gameOn)\b/g) || []);
  eq(new Set(extra).size, 7, 'the hover gate names those seven states and no others');
}

// ---------------------------------------------------------------- 4. the cue, and where it is asked
{
  assert(/body\.clickHot canvas \{ cursor: pointer; \}/.test(html), 'the cue is the pointer cursor...');
  assert(html.indexOf('body.clickHot canvas') > html.indexOf('body.freeCursor canvas'),
    '...declared AFTER the crosshair rule so it wins over it');
  assert(!/\.freeCursor[^\n]*\.clickHot|\.clickHot[^\n]*\.freeCursor/.test(html),
    'and NOT scoped to the free cursor — a modal frees the mouse on its own (build 1468), and the cue is ' +
    'right wherever there is a real pointer');

  assert(/updateHudWidgets\(\);[^\n]*\n\s*_clkHoverTick\(\);/.test(src),
    'the tick runs in the frame loop, after the freeze gate — so a frozen modal shows no world cue');
  eq((src.match(/_clkHoverTick\(\)/g) || []).length, 2, '...from exactly one call site');

  assert(/addEventListener\('mousemove', e=>\{ _clkMx = e\.clientX; _clkMy = e\.clientY; \}, \{ passive:true \}\);/.test(src),
    'the pointer position comes from its own passive listener rather than the look handler, which reads ' +
    'movementX/Y and would be meaningless here');
}

done('build 1480: THE CURSOR SAYS WHAT IS CLICKABLE. Build 1479 gave the world an On-click trigger and left the affordance out — and in a point-and-click level the cursor changing over a live object is not decoration, it IS how the player finds the game. The cue is the CURSOR rather than an outline: it costs nothing to render, needs no new UI, and is the shape every player already knows; an outline is a bigger visual decision and is deliberately not taken. The resolution moved into ONE `_clkResolve` asked by both the click and the hover, because two implementations of "which prop is under the cursor" would surface as the worst version of this file’s most-repeated defect — a cursor that says a thing is clickable and a click that disagrees. It is free on the levels that do not use it: a bounded early-exiting scan every 30 frames answers "is there anything clickable at all", and a level with none casts ZERO rays, measured over 40 frames. Where there is something, 40 frames cost 10 raycasts rather than 40, the body class is written only on a CHANGE, and a prop that becomes clickable at run time gets its cue within half a second without a deploy. The hover gate names the same seven states as the mousedown gate — asserted in both directions, because a cursor that says clickable while a click would be swallowed is precisely the lie this build exists not to tell');
