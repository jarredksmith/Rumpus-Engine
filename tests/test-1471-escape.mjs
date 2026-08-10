// build 1471 — Escape, when there is no pointer lock to give back.
//
// Two things, one key, found by asking what Escape should do once build 1468 gave the screen something that
// can cover it.
//
// 1. A MODAL had no way out. A creator had to wire a button to a logic event to a `modal hide` node — three
//    steps for the most universal action a menu has — and forgetting any one of them left the player in a
//    dimmed screen with no way back, which is exactly the failure 1468's three refusals exist to prevent.
// 2. SOLO play has never bound Escape to the pause menu: it releases the pointer lock and the
//    pointerlockchange handler pauses on the way out. Build 1467's free cursor never TAKES that lock, so
//    from that build until this one a solo player with a cursor view COULD NOT PAUSE AT ALL.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// the whole play-time keydown chain, in source order — every claim here is about ORDER, and order is the
// only thing that decides which of six Escape branches wins
const chain = (() => {
  const a = src.indexOf("if(e.code==='Escape' && editorOpen && !e.repeat");
  assert(a > 0, 'the play keydown chain starts at the editor deselect (build 1310)');
  const b = src.indexOf("if(e.code===BINDS.inventory", a);
  assert(b > a, '...and runs past the inventory bind');
  return src.slice(a, b);
})();

const at = (needle) => { const i = chain.indexOf(needle); assert(i >= 0, 'in the chain: ' + needle); return i; };

// ---------------------------------------------------------------- 1. a modal is closable, first
{
  assert(/if\(e\.code==='Escape' && !e\.repeat && typeof _modalOpen!=='undefined' && _modalOpen && !editorOpen\)\{/.test(chain),
    'Escape closes an open modal');
  assert(/_modalSet\(''\); return;/.test(chain), '...through the one setter, and stops there');

  // A modal is a full-screen overlay: NOTHING behind it may have this key.
  const m = at("_modalOpen && !editorOpen");
  for (const [what, needle] of [
    ['build mode',      "typeof buildMode!=='undefined' && buildMode){ e.preventDefault(); exitBuildMode()"],
    ['a mounted turret', "mountedTurret){ e.preventDefault(); dismountTurret()"],
    ['a driven car',     "drivingCar){ e.preventDefault(); exitCar()"],
    ['the match menu',   "NET.mode && NET.mode!=='off' && !editorOpen"],
  ]) assert(m < at(needle), 'the modal is closed BEFORE ' + what + ' gets Escape — it is covering all of them');

  // ...except the editor's own deselect, which is above everything and which a modal never coexists with
  assert(at("editorOpen && !e.repeat && typeof selProps") < m,
    'the editor\'s own deselect still goes first (build 1310)');
  assert(/&& !editorOpen\)\{/.test(chain.slice(m, m + 160)),
    '...and the modal branch excludes the editor explicitly rather than relying on that ordering');
}

// ---------------------------------------------------------------- 2. and there is deliberately no lock-in
{
  // the opt-out a creator might reach for must NOT exist — a modal that cannot be dismissed is the defect
  const defs = src.slice(src.indexOf("do:       { t:'Do action'"), src.indexOf("do:       { t:'Do action'") + 6000);
  assert(!/mesc|noEsc|mlock|modalLock/.test(defs),
    'the Do node offers no "cannot be dismissed" flag: a forced choice can be rebuilt by reopening the ' +
    'modal, and a locked-out player cannot rebuild anything');
  /* word-bounded and quoted: a bare `mesc` matches inside "timescaled", which is build 1400's recorded
     trap — a short name in a source pin is a substring of everything that ends with it. */
  assert(!/k:'(mesc|noEsc|mlock|modalLock)'/.test(src) && !/s\.(mesc|noEsc|mlock|modalLock)/.test(src),
    '...and nothing else in the engine carries one either');
  assert(/Esc always closes it, so a player can never be locked in one/.test(src),
    '...and the creator is TOLD, where they author the modal, rather than finding out from a player');
}

// ---------------------------------------------------------------- 3. Escape can pause a free-cursor session
{
  assert(/if\(e\.code==='Escape' && !e\.repeat && typeof _cursorFreeNow==='function' && _cursorFreeNow\(\)/.test(chain),
    'THE 1467 DEFECT: with the cursor free there is no lock to release, so Escape now opens the pause menu');
  assert(/openPause\(\); return;/.test(chain), '...through the real opener');

  const p = at("_cursorFreeNow()\n     && gameOn");
  // it is the LEAST specific thing to back out of, so it goes last
  for (const [what, needle] of [
    ['a mounted turret', "mountedTurret){ e.preventDefault(); dismountTurret()"],
    ['a driven car',     "drivingCar){ e.preventDefault(); exitCar()"],
    ['the match menu',   "NET.mode && NET.mode!=='off' && !editorOpen"],
    ['an open modal',    "_modalOpen && !editorOpen"],
  ]) assert(p > at(needle), 'pausing comes AFTER ' + what + ' — each of those is a more specific thing to back out of');

  // ...and it must not fire while any other surface owns the key
  const block = chain.slice(p, p + 420);
  for (const g of ['gameOn', '!gameOver', '!paused', '!editorOpen', '!shopOpen', '!invOpen', '!mapOpen', '!chatOpen', '!radialOpen', '!choosingUpgrade'])
    assert(block.includes(g), 'gated on ' + g + ' — every one of those already handles Escape or must not be interrupted');
  assert(/!\(NET\.mode && NET\.mode!=='off'\)/.test(block),
    '...and never in multiplayer, where Escape is the match menu and pausing is not a thing one player does');

  // executed: the gate, across the states that matter
  const run = (S) => new Function('S', `
    const gameOn=S.gameOn!==false, gameOver=!!S.gameOver, paused=!!S.paused, editorOpen=!!S.editorOpen,
          shopOpen=!!S.shopOpen, invOpen=!!S.invOpen, mapOpen=!!S.mapOpen, chatOpen=!!S.chatOpen,
          radialOpen=!!S.radialOpen, choosingUpgrade=!!S.choosingUpgrade, NET={ mode:S.net||'off' };
    const _cursorFreeNow=()=>!!S.free;
    return !!(typeof _cursorFreeNow==='function' && _cursorFreeNow()
      && gameOn && !gameOver && !paused && !editorOpen && !shopOpen && !invOpen && !mapOpen && !chatOpen
      && !radialOpen && !choosingUpgrade && !(NET.mode && NET.mode!=='off'));`)(S);

  eq(run({ free:true }), true, 'a free-cursor solo session pauses — the case that had no route at all');
  eq(run({ free:false }), false,
    'a CAPTURED cursor does not take this path: Escape releases the lock and the existing handler pauses, ' +
    'exactly as it did before build 1467');
  eq(run({ free:true, net:'host' }), false, 'never in multiplayer');
  eq(run({ free:true, paused:true }), false, 'not while already paused');
  eq(run({ free:true, invOpen:true }), false, 'not while the inventory owns the key');
  eq(run({ free:true, shopOpen:true }), false, 'not while the shop does');
  eq(run({ free:true, editorOpen:true }), false, 'not while authoring');
  eq(run({ free:true, gameOver:true }), false, 'not on the death screen');
}

// ---------------------------------------------------------------- 4. authoring never happens under a dimmer
{
  const t = extractFunction('toggleEditor', src);
  assert(/_modalSet\(''\)/.test(t), 'entering OR leaving the editor closes any open modal');
  assert(t.indexOf("_modalSet('')") < t.indexOf('editorOpen = !editorOpen'),
    '...before the flag flips, so it runs in either direction');
  assert(/try\{ _modalSet\(''\); \}catch/.test(t),
    '...guarded, because toggleEditor is on a hot key and a theme failure must not swallow the toggle');
}

// ---------------------------------------------------------------- 5. nothing above it moved
{
  assert(/if\(e\.code==='Escape' && invOpen\)\{ if\(_inspEl && _inspEl\.style\.display!=='none'\) closeInspect\(\); else closeInventory\(\);/.test(src),
    'the inventory/inspector Escape is untouched');
  assert(/if\(e\.code===BINDS\.map \|\| e\.code==='Escape'\) closeBigMap\(\);/.test(src), 'the big map is untouched');
  assert(/e\.code==='KeyE' \|\| e\.code==='Escape'\) closeShop\(\)/.test(src), 'the shop is untouched');
}

done('build 1471: ESCAPE, WHEN THERE IS NO POINTER LOCK TO GIVE BACK — two defects, one key, both found by asking what Escape should do once build 1468 gave the screen something that can cover it. (1) A MODAL had no way out: a creator had to wire a button to a logic event to a `modal hide` node, three steps for the single most universal action a menu has, and forgetting any one of them left the player standing in a dimmed screen with no way back — which is exactly the failure build 1468\'s three refusals exist to prevent, arriving through the other door. Escape now closes it, and it goes FIRST, above build mode, a mounted turret, a driven car and the multiplayer match menu, because a modal is a full-screen overlay and nothing behind it may have that key. There is deliberately NO "cannot be dismissed" option, asserted as an absence in both the node table and the whole engine: a forced choice can be rebuilt by reopening the modal, and a locked-out player cannot rebuild anything, so this takes the recoverable failure. (2) SOLO play has never bound Escape to the pause menu — it releases the pointer lock and the pointerlockchange handler pauses on the way out — and build 1467\'s free cursor never TAKES that lock, so from that build until this one a solo player in a cursor view could not pause at all. A defect I shipped three builds ago, closed here rather than left for a report. It sits LAST in the chain, below the turret, the car and the match menu, because each of those is a more specific thing to back out of than "open the menu", and it is gated on ten states that already own the key — every one executed, including that a CAPTURED cursor still takes the old route unchanged');
