// build 1476 — widgets can be restacked.
//
// `_hwRebuild` appends widgets in ARRAY ORDER into one absolutely positioned host with no z-index of their
// own, so the LAST entry paints in front. Until this build there was no way to change that order but delete
// everything and re-add it in the right sequence.
//
// Build 1260's image widget (card faces, portraits, panel frames) and build 1468's modals — which are a
// STACK of widgets by definition — are what made that unworkable. And it is worse than it sounds: the
// widget host is `pointer-events:none` and only buttons opt in, so art drawn over a button HIDES a control
// that still works.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the premise, in the real builder
{
  const rb = extractFunction('_hwRebuild', src);
  assert(/for\(const w of hudWidgets\)\{/.test(rb), 'the builder walks the array in order...');
  assert(/_hwHost\.appendChild\(el\);/.test(rb), '...appending each one...');
  assert(!/zIndex|z-index:\s*\d/.test(rb.slice(rb.indexOf('for(const w of hudWidgets)'))),
    '...and gives no widget a z-index of its own, so DOM order IS paint order');
  assert(/position:absolute;inset:0;pointer-events:none;z-index:4;/.test(rb),
    'the host itself is pointer-events:none — which is why art over a button hides a control that still works');
}

// ---------------------------------------------------------------- 2. the swap, executed
{
  const mv = new Function('hudWidgets', extractFunction('_hwMove', src) + '; return _hwMove;');
  const ids = (a) => a.map(w => w.id).join('');
  const mk = () => [{ id:'a' }, { id:'b' }, { id:'c' }];

  let a = mk(), move = mv(a);
  eq(move(0, 1), true, 'a widget moves forward');
  eq(ids(a), 'bac', '...swapping with the one after it');

  a = mk(); move = mv(a);
  eq(move(2, -1), true, 'and back');
  eq(ids(a), 'acb');

  // the ends refuse rather than wrapping or losing an entry
  a = mk(); move = mv(a);
  eq(move(0, -1), false, 'the first cannot go further back');
  eq(ids(a), 'abc', '...and nothing moved');
  eq(move(2, 1), false, 'the last cannot go further forward');
  eq(ids(a), 'abc');

  // out-of-range indices cannot corrupt the array
  for (const [i, d] of [[-1, 1], [9, -1], [-5, -1], [3, 1]]) {
    a = mk(); move = mv(a);
    eq(move(i, d), false, 'refuses index ' + i + ' dir ' + d);
    eq(ids(a), 'abc', '...leaving the list intact');
    eq(a.length, 3, '...and the same length — a swap must never lose or duplicate a widget');
  }

  // a swap is its own inverse, which is what makes back/front feel like one control
  a = mk(); move = mv(a);
  move(1, 1); move(2, -1);
  eq(ids(a), 'abc', 'forward then back returns exactly');

  // a single widget, and an empty list
  a = [{ id:'only' }]; move = mv(a);
  eq(move(0, 1), false, 'a lone widget has nowhere to go');
  eq(move(0, -1), false);
  eq(mv([])(0, 1), false, 'an empty list does not throw');
  eq(mv(null)(0, 1), false, 'and neither does no list at all');

  // walking one widget from the back of a full stack to the front is N-1 steps and loses nothing
  a = Array.from({ length: 8 }, (_, k) => ({ id: String(k) }));
  move = mv(a);
  for (let k = 0; k < 7; k++) eq(move(k, 1), true, 'step ' + k);
  eq(ids(a), '12345670', 'the first widget walks to the front, and the others keep their order');
  eq(a.length, 8);
}

// ---------------------------------------------------------------- 3. the control speaks in layers
{
  assert(/l1\.appendChild\(mk\('\\u25bc back', -1,/.test(src), 'BACK moves one step earlier in the array...');
  assert(/l1\.appendChild\(mk\('\\u25b2 front', 1,/.test(src), '...and FRONT one step later');
  assert(/Draw this one step further BACK \(behind the others\)/.test(src),
    'the tooltip says what happens on screen, not what happens to a list index');
  assert(/i===0\)\);/.test(src) && /i===hudWidgets\.length-1\)\);/.test(src),
    'the ends are DISABLED rather than silently doing nothing — build 1347: a disabled button is honestly ' +
    'unreachable, a live one that refuses is a dead click');
  assert(/if\(dis\) b\.disabled=true;\n\s*else b\.onclick=/.test(src),
    '...and a disabled one carries no handler at all');
  assert(/pushUndoSnapshot\(\)/.test(src.slice(src.indexOf("const mk=(txt, dir, tip, dis)"), src.indexOf("const mk=(txt, dir, tip, dis)") + 700)),
    'each restack is one undo step (build 1163)');
  assert(/if\(_hwMove\(i, dir\)\)\{ commitW\(\); renderHudPanel\(\); \}/.test(src),
    '...and the panel only redraws when something actually moved');
}

// ---------------------------------------------------------------- 4. the order is what it says it is
{
  // it rides the level for free — the array IS the order, and the array is serialized whole
  assert(/hudWidgets: \(\(typeof hudWidgets!=='undefined' && hudWidgets\.length\) \? _sanitizeHudWidgets\(hudWidgets\)/.test(src),
    'the serializer writes the array in order, so a restack survives a save with no new field');
  const san = new Function('_hwSafeUrl', 'HW_ANCHORS',
    extractFunction('_sanitizeHudWidgets', src) + '; return _sanitizeHudWidgets;')(
    (u) => (typeof u === 'string' ? u : ''), ['tl','tc','tr','ml','mr','bl','bc','br']);
  const round = san([{ kind:'image', id:'art' }, { kind:'button', id:'buy' }, { kind:'text', id:'ttl' }]);
  eq(round.map(w => w.id).join(''), 'artbuyttl', '...and the sanitizer preserves it rather than sorting');
}

// ---------------------------------------------------------------- 5. the door (build 1348)
{
  assert(/Widgets draw in this order: the LAST one is in front\./.test(src),
    'the panel states the rule, because "which one covers which" is not guessable from a list');
  assert(/use \\u25bc back \/ \\u25b2 front to restack/.test(src), '...and names the control that changes it');
  assert(/An image never blocks a button\\u2019s clicks, so art drawn over one hides a control that still works/.test(src),
    '...and warns about the failure that is actively confusing rather than merely wrong');
}

done('build 1476: WIDGETS CAN BE RESTACKED. `_hwRebuild` appends them in ARRAY ORDER into one absolutely positioned host with no z-index of their own, so the LAST entry paints in front — and until this build the only way to change that order was to delete everything and re-add it in the right sequence. Build 1260\'s image widget (card faces, portraits, panel frames) and build 1468\'s modals, which are a STACK of widgets by definition, are what made that unworkable: authoring the frame after the buttons drew it over them permanently. And it is worse than it sounds — the widget host is `pointer-events:none` and only buttons opt in, so the art covers the button and THE BUTTON STILL WORKS, which is a player clicking something they cannot see. The buttons speak in LAYERING rather than list indices, because a creator thinks "put the frame behind the buttons" and making them work out that earlier-in-a-list means further-back is a puzzle with a wrong answer. The swap is executed rather than asserted: it refuses at both ends and on four kinds of out-of-range index without ever losing or duplicating an entry, it is its own inverse so back-then-front returns exactly, and one widget walks the length of a full stack in N-1 steps with every other widget keeping its order. The ends are DISABLED rather than live-and-refusing (build 1347), each restack is one undo step (1163), and the order rides the level for free because the array IS the order');
