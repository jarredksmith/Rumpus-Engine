// build 1505: the pause button shows only where something can press it.
//
// Reported from play: "on desktop, can we hide the pause button thats in the top right corner during
// gameplay? There's no way to actually click it on a computer as you access the pause screen by
// clicking esc." In pointer-locked play there is no OS cursor, so the button was unpressable
// decoration. The rule: a finger (touch — its only pause control), or a real unlocked pointer
// (build 1467's free cursor, or a modal that released the lock). Build 1363's precedent:
// pointer lock always wins.
import { gameSource, html, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------- lift the real expression and EXECUTE it ----
const m = src.match(/const v = (gameOn && !gameOver && !shopOpen && !editorOpen && !choosingUpgrade && !paused\s*&&\s*\(isTouch \|\| !document\.pointerLockElement\));/);
assert(m, 'the visibility expression carries the pointer gate as its last term');

const vis = new Function('gameOn', 'gameOver', 'shopOpen', 'editorOpen', 'choosingUpgrade', 'paused',
  'isTouch', 'document', 'return ' + m[1] + ';');
const LOCKED = { pointerLockElement: {} }, FREE = { pointerLockElement: null };
const run = (o) => vis(
  o.gameOn !== false, !!o.gameOver, !!o.shopOpen, !!o.editorOpen, !!o.choosingUpgrade, !!o.paused,
  !!o.isTouch, o.locked ? LOCKED : FREE);

// the report: pointer-locked desktop play — the common case — hides it
eq(run({ locked: true }), false, 'desktop, pointer locked, live play: HIDDEN (the report)');

// touch keeps its only pause control, lock state irrelevant (a stray lock must not strand a phone)
eq(run({ isTouch: true, locked: true }), true, 'touch, even with a lock held: SHOWN');
eq(run({ isTouch: true, locked: false }), true, 'touch, unlocked: SHOWN');

// a real unlocked pointer can click it — the freeCursor levels and released-lock states keep it
eq(run({ locked: false }), true, 'desktop with a FREE pointer (freeCursor level): SHOWN');

// the pre-1505 gates all still hide it regardless of pointer state
for (const k of ['gameOver', 'shopOpen', 'editorOpen', 'choosingUpgrade', 'paused']) {
  eq(run({ [k]: true, locked: false }), false, k + ' hides the button even with a free pointer');
  eq(run({ [k]: true, isTouch: true }), false, k + ' hides the button on touch too');
}
eq(run({ gameOn: false, locked: false }), false, 'no game, free pointer: hidden (menu owns the screen)');
eq(run({ gameOn: false, isTouch: true }), false, 'no game, touch: hidden');

// ---------------------------------------- wiring pins ----
// the latch still guards the per-frame style write, and the writer is unchanged
assert(/if\(v!==_pbShow\)\{ _pbShow=v; const pb=document\.getElementById\('pauseBtn'\); if\(pb\) pb\.style\.display = v\?'flex':'none'; \}/.test(src),
  'the _pbShow latch and the one style writer are unchanged');

// the button's own title has promised Esc all along — the hide is honest about the input it defers to
assert(/id="pauseBtn" title="Pause \(Esc\)"/.test(html),
  'the button still names Esc in its title (markup)');

// openPause wiring untouched — the button still works wherever it shows
assert(/const pb=document\.getElementById\('pauseBtn'\); if\(pb\) pb\.onclick=openPause;/.test(src),
  'the click wiring is unchanged');

done('build 1505: the pause button shows only for a finger or a real unlocked pointer — ' +
  'pointer-locked desktop play (the report) hides it, touch and free-cursor levels keep it, ' +
  'and every pre-1505 gate still holds');
