import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 601: inventory UX fixes.

// (1) opening the inventory freezes the world in solo (same path as pause/map)
  // build 1478 added a sixth term to the frame loop's freeze gate and broke five harnesses at once, every
  // one of their assertions still TRUE — they had each quoted the WHOLE condition to assert one thing about
  // it. That is build 1468's own recorded trap one line over: a pin that quotes a whole condition is a pin
  // against the condition's NEIGHBOURS. They assert MEMBERSHIP now.
{ const gate = src.match(/if\(\(shopOpen \|\| choosingUpgrade[^\n]*?\) \{ pollGamepad/);
  assert(gate, 'the frame loop has a freeze gate');
  assert(/\(invOpen && NET\.mode==='off'\)/.test(gate[0]), 'inventory open freezes the solo world');
  assert(/!\(duelDead && pvpMode\(\)\)/.test(gate[0]), '...but never while waiting to respawn'); }

// (2) clicks while the inventory is open never reach the trigger
assert(/if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen\b[^)]*\) return;/.test(src), 'mousedown ignored while inventory open');
assert(/if\(invOpen\) return;/.test(extractFunction('shoot')), 'shoot() bails while inventory open');

// (3) the close control is a stylized round X used by both the panel and the inspector
const cx = extractFunction('_invCloseX');
assert(/border-radius:50%/.test(cx) && /b\.textContent='\\u2715'/.test(cx), 'close X is a round, styled button');
assert(/b\.onmouseenter=\(\)=>\{ b\.style\.background='#ff3b30'/.test(cx), 'close X highlights red on hover');
assert(/const cl=_invCloseX\(closeInventory\)/.test(src), 'inventory panel uses the styled X');
assert(/const cl=_invCloseX\(closeInspect\)/.test(src), 'inspector uses the styled X');

done('inventory UX: solo pause on open, no click-through fire, stylized close X (build 601)');
