// build 1478 — a modal can freeze the world.
//
// Build 1468 shipped modals and recorded this as the half it could not do:
//
//   "A modal does not PAUSE the world, and that is a decision with a reason: `paused` early-returns the
//    frame loop, so `updateHudWidgets` would stop running and `_hwFire` returns on it — a paused modal is a
//    frozen, unclickable one. Pausing properly needs a freeze that is not `paused`, which is its own build."
//
// This is that build. A shop you browse while a wave keeps shooting you is not a shop.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the freeze is its OWN flag
// The whole design rests on this: `paused` would stop the very things a menu needs.
{
  const fire = extractFunction('_hwFire', src);
  assert(/if\(typeof paused!=='undefined' && paused\) return;/.test(fire),
    "`_hwFire` returns on `paused`...");
  assert(!/_modalFreeze/.test(fire),
    '...and knows nothing about the freeze, so a frozen modal’s buttons still fire — which is the ' +
    'entire reason this is not `paused`');

  const cur = extractFunction('_hwSyncCursor', src);
  assert(/paused/.test(cur) && !/_modalFreeze/.test(cur),
    'the cursor helper is likewise untouched, so the mouse stays free while frozen');
}

// ---------------------------------------------------------------- 2. ONE writer, EXECUTED
{
  const body = extractFunction('_modalSet', src);
  const set = new Function('_deps', `
    let _modalOpen = _deps.open, _modalFreeze = _deps.freeze, firing = _deps.firing, firingLatch = _deps.latch;
    const _modalSyncBack = ()=>{}; const updateHudWidgets = ()=>{};
    ${body}
    _modalSet(_deps.id, _deps.frz);
    return { open:_modalOpen, freeze:_modalFreeze, firing:firing, latch:firingLatch };
  `);
  const call = (o) => set(Object.assign({ open:'', freeze:false, firing:false, latch:false, id:'', frz:false }, o));

  eq(call({ id:'shop' }).freeze, false, 'opening without the flag does not freeze — every pre-1478 open is unchanged');
  eq(call({ id:'shop' }).open, 'shop', '...and still opens');
  eq(call({ id:'shop', frz:true }).freeze, true, 'opening WITH it freezes');
  eq(call({ id:'shop', frz:true }).open, 'shop');

  // the release is structural: an empty name can never freeze, so every close path releases the world
  eq(call({ open:'shop', freeze:true, id:'' }).freeze, false, 'closing releases the world...');
  eq(call({ open:'shop', freeze:true, id:'' }).open, '', '...and closes');
  eq(call({ open:'shop', freeze:true, id:'', frz:true }).freeze, false,
    '...and a close cannot freeze even if a caller asks it to — the guard is on the NAME, not the caller');

  // swapping modals re-decides the freeze rather than inheriting it
  eq(call({ open:'shop', freeze:true, id:'pause' }).freeze, false, 'opening a different modal re-decides');
  eq(call({ open:'shop', freeze:false, id:'pause', frz:true }).freeze, true, '...in both directions');

  // re-opening the SAME modal with a different freeze must not be swallowed by the early return
  eq(call({ open:'shop', freeze:false, id:'shop', frz:true }).freeze, true,
    'the same modal re-opened with the freeze on takes it — the early return tests BOTH pieces of state');
  eq(call({ open:'shop', freeze:true, id:'shop', frz:false }).freeze, false, '...and off again');

  // build 1468's held-trigger drop is unchanged
  const held = call({ firing:true, latch:true, id:'shop', frz:true });
  eq(held.firing, false, 'a held trigger is still dropped when a modal opens');
  eq(held.latch, false);

  eq((src.match(/_modalFreeze\s*=/g) || []).length, 2,
    'and `_modalFreeze` is assigned in exactly two places — its declaration and `_modalSet` — so no ' +
    'close path can leave the world frozen');
}

// ---------------------------------------------------------------- 3. the frame-loop gate, EXECUTED
{
  const line = src.match(/if\(\(shopOpen \|\| choosingUpgrade[^\n]*?\{ pollGamepad\(dt\);[^\n]*?return; \}/);
  assert(line, 'the freeze gate is found');

  const gate = new Function('shopOpen','choosingUpgrade','paused','mapOpen','invOpen','_modalFreeze','NET','duelDead','pvpMode',
    'let hit=false; const pollGamepad=()=>{}, updateHudWidgets=()=>{}, renderScene=()=>{}, renderViewmodel=()=>{}, drawBigMap=()=>{}, dt=0.016, scene={}, camera={};\n' +
    '(function(){ ' + line[0].replace('return; }', 'hit=true; return; }') + ' })(); return hit;');
  const F = false, T = true;
  const solo = { mode:'off' }, coop = { mode:'host' }, client = { mode:'client' };
  const g = (frz, net, dd) => gate(F, F, F, F, F, frz, net, dd || F, () => T);

  eq(g(F, solo), false, 'nothing frozen, nothing happens');
  eq(g(T, solo), true, 'a freezing modal stops the world in SOLO');
  eq(g(T, coop), false, 'and never in co-op — nothing can stop the world for one player in a shared session');
  eq(g(T, client), false, '...on either side of it');
  eq(g(T, solo, T), false, 'and never while waiting to respawn in a duel, like every other term here');

  // the existing five terms are untouched
  eq(gate(T, F, F, F, F, F, coop, F, () => T), true, 'shopOpen still freezes, in any mode');
  eq(gate(F, T, F, F, F, F, coop, F, () => T), true, 'the upgrade pick too');
  eq(gate(F, F, T, F, F, F, solo, F, () => T), true, '`paused` still freezes solo');
  eq(gate(F, F, T, F, F, F, coop, F, () => T), false, '...and still does not in netplay');
  eq(gate(F, F, F, T, F, F, solo, F, () => T), true, 'the map');
  eq(gate(F, F, F, F, T, F, solo, F, () => T), true, 'the inventory');

  assert(/pollGamepad\(dt\); updateHudWidgets\(\);/.test(line[0]),
    'the freeze redraws the widgets, or a frozen modal would be a still image — its `show when` rows must ' +
    'keep answering while you stand in it');
  assert(/renderScene\(scene,camera\)/.test(line[0]), '...and still renders the frozen world behind it');
}

// ---------------------------------------------------------------- 4. the verb, and what it does NOT send
{
  const wa = extractFunction('_applyWorldAction', src);
  const blk = wa.slice(wa.indexOf("if(s.do==='modal'){"), wa.indexOf("if(s.do==='command'){"));
  assert(/_modalSet\(mid, mm==='show' && !!s\.mfrz\);/.test(blk),
    'the verb passes the authored flag, and only on an OPEN');
  assert(/const mpay=\{ md:mid \};/.test(blk),
    'the payload is unchanged: the freeze is solo-only, so it is not on the wire at all');
  assert(!/mz:/.test(blk), '...asserted as an absence rather than assumed');

  // build 1468's three refusals still run BEFORE anything is set
  assert(blk.indexOf('has no modal name') < blk.indexOf('_modalSet(mid'),
    'an unnamed modal is still refused before it can freeze anything');
  assert(blk.indexOf('no HUD widget belongs to that modal') < blk.indexOf('_modalSet(mid'),
    '...and so is a name no widget carries — which is what stops a freeze onto an empty screen');

  const client = src.match(/if\(msg\.md!=null && typeof _modalSet==='function'\)[^\n]*/);
  assert(client && !/mz|freeze/.test(client[0]),
    'a client applies the name alone, so a co-op peer can never be frozen by someone else’s menu');
}

// ---------------------------------------------------------------- 5. it travels, and it has a door (1348)
{
  assert(/mmode:'md', mid:'mj', mfrz:'mz'/.test(src), 'the signal carries it through build 1406’s table...');
  assert(/if\(s\.mmode!=='hide'\) chk\('freeze the world', s\.mfrz, v=>\{ if\(v\) s\.mfrz=1; else delete s\.mfrz; \}\);/.test(src),
    '...with a row that configures it, in the same build that adds it (1406’s rule)');
  assert(/\{k:'mfrz',l:'freeze the world',chk:1,ifv:\['verb','modal'\],ifv2:\['mmode','show'\]\}/.test(src),
    'and the Do node offers it, shown only on an OPEN — a freeze on a close is a control with no consequence (1348)');

  // the way out cannot depend on the frozen loop
  const esc = src.match(/e\.preventDefault\(\); if\(typeof _modalSet==='function'\) _modalSet\(''\); return;/);
  assert(esc, 'Escape closes a modal through a keydown handler...');
  assert(/b\.onclick=\(ev\)=>\{ ev\.preventDefault\(\); ev\.stopPropagation\(\); _modalSet\(''\); \};/.test(src),
    '...and the close button through a DOM click — neither needs the frame loop, so a frozen modal can ' +
    'never be a lock-in');
  assert(/if\(typeof _modalSet==='function'\) _modalSet\(''\);\s+\/\/ build 1468: \.\.\.and no modal survives a deploy/.test(src),
    'and a deploy still clears it, freeze and all');
}

done('build 1478: A MODAL CAN FREEZE THE WORLD. Build 1468 shipped modals and recorded this as the half it could not do — "a modal does not PAUSE the world... `paused` early-returns the frame loop, so `updateHudWidgets` would stop running and `_hwFire` returns on it — a paused modal is a frozen, unclickable one. Pausing properly needs a freeze that is not `paused`, which is its own build." A shop you browse while a wave keeps shooting you is not a shop. `_modalFreeze` is its OWN flag for exactly the reason 1468 named: `_hwFire` and `_hwSyncCursor` both gate on `paused` and neither knows about this one, so the menu stays clickable and the mouse stays free. It joins the frame loop’s existing freeze gate SOLO ONLY — the same shape `paused`, `mapOpen` and `invOpen` already carry there, because nothing can stop the world for one player in a shared session — and the gate now calls `updateHudWidgets` inside the freeze so the menu keeps drawing and its `show when` rows keep answering. The release is STRUCTURAL rather than a list of unwind sites: an empty modal name can never freeze, so Escape, the close button, the verb, a deploy and opening the editor all release the world by calling the function they already called, and `_modalFreeze` is assigned in exactly two places in the whole engine. The early return tests BOTH pieces of state, so re-opening the same modal with the freeze toggled is not swallowed. It is deliberately not on the wire, asserted as an absence: it can only ever apply in a solo session, so a co-op peer can never be frozen by someone else’s menu');
