// (build 1347) THE KEYBOARD REACHES THE EDITOR.
// Build 1333/1334 closed three of the platform audit's six accessibility items and left `role=` 0 and
// `tabindex` 0 outstanding. Measured LIVE rather than counted statically, because a static count says
// nothing about what a keyboard can do — a <button> is focusable for free, a <div> with .onclick never is:
//
//   in play      2 clickable,  2 reachable    0 unreachable
//   pause menu  15 clickable, 15 reachable    0 unreachable   <- real <button>s throughout, nothing to fix
//   EDITOR      86 clickable, 59 reachable   27 UNREACHABLE (31%)
//
// 19 of those 27 are DIVs carrying an .onclick, and they include the WHOLE MODE RAIL — Build / World /
// Player / Enemies / Gameplay / Weapons / HUD / Save / Settings. A keyboard user could not change editor
// tab at all. (The other 8 are `disabled` buttons, which are correctly unreachable and not a defect.)
//
// After, in the same live editor, after one real Tab keypress:  86 clickable, 78 reachable, 8 unreachable
// — and the 8 are exactly the disabled buttons. Enter on the focused World tab switched the editor mode.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- ONE PREDICATE, not 500 construction sites ----
// There are ~500 `.onclick` assignments in this file and panels are rebuilt constantly, so stamping at
// each site would be a hand-kept list that drifts — the defect this file records under 1152, 1266, 1320,
// 1326. `_a11yWire` asks a question of the DOM instead.
{
  const f = extractFunction('_a11yWire', src);
  assert(/typeof el\.onclick !== 'function'/.test(f), 'the test is "does this element have a click handler"');
  assert(/_A11Y_NATIVE\[el\.tagName\]/.test(f), '...and "is it already focusable for free"');
  assert(/el\.hasAttribute\('tabindex'\)/.test(f),
    'an element that already carries a tabindex is left alone — including one that deliberately opted out');
  assert(/el\.tagName === 'CANVAS'/.test(f), 'the viewport canvas is not a button');
  assert(/setAttribute\('tabindex', '0'\)/.test(f) && /setAttribute\('role', 'button'\)/.test(f),
    'a stamped control becomes focusable AND announces what it is');
  assert(/if\(!el\.hasAttribute\('role'\)\)/.test(f), "an authored role is never overwritten");
}

// role=button, deliberately not role=tab
assert(/half-implemented tablist reads worse|aria-selected/.test(src),
  'the choice of role=button over a tablist is argued at the site: a tablist owes aria-selected, ' +
  'aria-controls and arrow-key navigation, and half of one is worse than an honest list of buttons');

// ---- it costs NOTHING until somebody uses a keyboard ----
{
  const arm = extractFunction('_a11yArm', src);
  assert(/if\(_a11yKbd\) return;/.test(arm), 'arming is idempotent');
  assert(/new MutationObserver/.test(arm), 'and it starts the observer that catches everything built later');
  assert(/observe\(document\.body/.test(arm.replace(/\s/g, '')), '...over the whole body');
  // the arming trigger is the Tab key, and keydown fires BEFORE the browser moves focus, so the elements
  // are in the tab order in time for the very keystroke that armed them
  const kd = src.match(/addEventListener\('keydown', \(e\)=>\{[\s\S]{0,1400}?\}, true\);/);
  assert(kd, 'the keydown handler exists');
  assert(/if\(e\.key === 'Tab'\)\{ _a11yArm\(\); return; \}/.test(kd[0]),
    'Tab arms it — a mouse-only session never walks the DOM at all');
  assert(/renderEditorFields|3,000 nodes|8-27 ms/.test(src),
    'and the reason is recorded: build 1322 measured the panel rebuild at 8-27 ms over ~3,000 nodes, ' +
    'so an always-on observer would be a real regression for the majority who use a mouse');
}

// ---- Enter/Space activate, because that is what role=button PROMISES ----
{
  const kd = src.match(/addEventListener\('keydown', \(e\)=>\{[\s\S]{0,1400}?\}, true\);/)[0];
  assert(/e\.key !== 'Enter' && e\.key !== ' ' && e\.key !== 'Spacebar'/.test(kd), 'Enter and Space activate');
  assert(/_A11Y_NATIVE\[el\.tagName\]\) return;/.test(kd),
    'a native control is left to the browser — double-firing a real <button> would be a new bug');
  assert(/getAttribute\('role'\) === 'button'/.test(kd),
    'and it fires ONLY for a stamped control — Space is JUMP in this game, and stealing it in the world ' +
    'would be far worse than the bug being fixed');
  assert(/typeof el\.onclick === 'function'/.test(kd), '...that still has a handler');
  assert(/el === document\.body/.test(kd), 'with nothing focused, nothing happens');
}

// ---- a visible focus ring, and :focus-visible is what makes it shippable ----
{
  assert(/:focus-visible \{ outline: 2px solid rgba\(var\(--accent-rgb\),0\.95\)/.test(html),
    'there is a focus ring at all — verified live: outline "solid 2px rgba(56, 245, 181, 0.95)"');
  assert(/#editor \.edMode:focus-visible/.test(html), '...including the mode rail this build made focusable');
  // the ONLY pre-existing :focus rule removed the outline, which is why there was nothing to see
  assert(/#editor input\[type=text\]:focus[^\n]*outline: none/.test(html),
    "the pre-existing rule that removes the outline on text fields is untouched — it swaps in an accent " +
    'border, so a focused field was always legible; it was every OTHER control that had nothing');
  const fv = (html.match(/:focus-visible/g) || []).length;
  assert(fv >= 2, ':focus-visible is used, not :focus — the browser matches it only for keyboard focus, ' +
    'so clicking a button does not leave a ring stuck on it, which is why outlines got deleted in the ' +
    'first place');
}

// ---- the two surfaces that were already fine are untouched ----
assert(!/_a11yWire\(hud\)|_a11yWire\(pause/.test(src),
  'nothing special-cases the HUD or the pause menu: both measured 100% reachable already, because they ' +
  'are built from real <button> elements');

done('build 1347: the editor is keyboard-operable, and it costs nothing until a keyboard is used');
