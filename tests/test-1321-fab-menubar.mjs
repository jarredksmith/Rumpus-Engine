import { html, gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1321 — reported from play: "the circle plus button gets slightly obscured with the file menu UI."
//
// Build 1083 added the menu bar (fixed, top:0, 30px tall, z-index 34) and pushed #editor and #edToolbar
// down for it. It stopped there. The + FAB is a SIBLING of the panel, not a child, so nothing moved it: it
// stayed at top:14px, under a 30px bar, at z-index 31.
//
// Measured live (tools/probe/fab-menubar.mjs) at 1280x720 with the editor open:
//   before   circle top 14, bar bottom 30  -> 16 of its 46 px behind the bar
//            elementFromPoint at the circle's top returned `mbSpacer` — the BAR owned those pixels,
//            so a click there went to the bar. A hit-target loss, not just a smudge.
//   after    circle top 44, 0 px hidden, elementFromPoint returns `edAdd` at its top AND its middle
//   narrow   at 700px (below _edMenuSync's 760 threshold) the bar is gone and the FAB is back at 14 —
//            unchanged, which is the half that says the fix did not cost the common layout anything.

// ---------------------------------------------------------------- the rule, beside the two it belongs with
{
  assert(/body\.edMenuBar #editor \{ top:30px;/.test(html), 'build 1083 pushed the panel down…');
  assert(/body\.edMenuBar #edToolbar \{ top:calc\(40px \+ env\(safe-area-inset-top\)\); \}/.test(html), '…and the toolbar…');
  assert(/#edAddFab \{ top:14px; \}/.test(html), '…and the FAB now declares its top in the stylesheet…');
  assert(/body\.edMenuBar #edAddFab \{ top:44px; \}/.test(html), '…so it can be pushed down too: 30px bar + the original 14px gap');
  // the three must sit together, or the next thing added to the bar misses one again
  const i = html.indexOf('body.edMenuBar #editor');
  const j = html.indexOf('body.edMenuBar #edAddFab');
  assert(j > i && j - i < 1200, 'all three shift-down rules are in one block');
}

// ---------------------------------------------------------------- and the inline style must not beat it
{
  assert(/fab\.style\.cssText='position:absolute;z-index:31;pointer-events:auto;'/.test(src),
    'the FAB no longer sets `top` inline — an inline style would win over the class rule');
  assert(!/fab\.style\.cssText='position:absolute;top:14px/.test(src), 'the old inline top is gone');
  // placeFab still owns the horizontal side-swap; only the vertical moved to CSS
  assert(/fab\.style\.left = left \? w\+'px' : ''; fab\.style\.right = left \? '' : w\+'px';/.test(src),
    'left/right still tracks the dock side in JS, where it depends on the panel width');
  assert(!/fab\.style\.top *=/.test(src), 'and nothing writes top from JS, which would reintroduce the same fight');
}

// ---------------------------------------------------------------- keyed on the class the bar itself sets
{
  assert(/const want = !!\(typeof editorOpen!=='undefined' && editorOpen\) && window\.innerWidth>=760;/.test(src),
    'the bar appears only in an editor session wide enough for it…');
  assert(/document\.body\.classList\.toggle\('edMenuBar', want\);/.test(src),
    '…and that exact condition is a body class, so the FAB follows it with no JS of its own');
  assert(/keyed on\n     the same body class _edMenuSync toggles: no JS/.test(html),
    'with the reason recorded — a JS reposition would need a hook on every path that toggles the bar');
  assert(/elementFromPoint at the circle's top returned `mbSpacer`/.test(html),
    'and the measurement that showed it was a hit-target loss rather than a cosmetic overlap');
}

// ---------------------------------------------------------------- the geometry, executed
{
  // 46px circle, 30px bar: the gap below the bar must be the same 14px it had against the viewport top
  const BAR = 30, GAP = 14, FAB_H = 46;
  const top = +(/body\.edMenuBar #edAddFab \{ top:(\d+)px; \}/.exec(html) || [])[1];
  eq(top, BAR + GAP, 'the pushed-down top is bar height + the original gap, not a hand-picked number');
  assert(top >= BAR, 'the circle clears the bar entirely…');
  eq(Math.max(0, BAR - top), 0, '…so zero pixels of it are behind the bar');
  // and the menu it opens still hangs below the circle rather than under the bar
  assert(/id="edAddMenu" style="display:none;position:absolute;top:54px/.test(src),
    'the menu opens 54px below the FAB origin — downward, so it clears the bar with the FAB');
  assert(top + 54 > BAR, 'which puts it well clear');
}

done('build 1321: the + button sat under the file menu bar. Build 1083 pushed #editor and #edToolbar down for its new bar and stopped there — the FAB is a SIBLING of the panel, so it kept top:14px under a 30px bar at a lower z-index. Measured live at 1280x720: 16 of the circle\'s 46 px were behind the bar and elementFromPoint at its top returned `mbSpacer`, meaning the bar owned those pixels and a click there went to the bar — a lost hit target, not just a smudge. The FAB\'s `top` moved out of its inline cssText into the stylesheet so a `body.edMenuBar` rule can win, keyed on the same class _edMenuSync already toggles: 44px = the 30px bar plus the original 14px gap, no JS, and nothing for a future path that shows the bar to forget. Re-measured after: 0 px hidden, `edAdd` owns its own top and middle pixels, and at 700px (below the bar\'s 760 threshold) the FAB is back at 14 exactly as before');
