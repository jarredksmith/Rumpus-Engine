// (build 982) BLENDER-STYLE LEFT TAB RAIL — the 8 editor modes moved from a wrapping horizontal
// strip (which clipped HUD/Save on phones) to a vertical icon+label column on the panel's inner
// edge, with the content scrolling beside it. The panel is now a flex column: header on top, then
// a row of [rail | scrolling main]. Rail mirrors to the other edge when the panel docks left.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

// panel is a flex column, no longer the scroll container itself
assert(/#editor \{[^}]*display: flex; flex-direction: column; overflow: hidden;/.test(html),
  'the panel is a flex column with a non-scrolling shell');
assert(/#editor \{[^}]*width: 344px; min-width: 288px;/.test(html), 'a touch wider to fit the rail + content');

// the shell + rail + main
assert(/#edShell \{ display: flex; flex: 1 1 auto; min-height: 0; \}/.test(html), 'the shell is the flex row under the header');
assert(/#editor\.dockLeft #edShell \{ flex-direction: row-reverse; \}/.test(html), 'docking left mirrors the rail to the other edge');
assert(/#edMain \{ flex: 1 1 auto; min-width: 0; overflow-y: auto;/.test(html), 'the content column scrolls, not the panel');
assert(/#edModes\.edModes \{ flex: 0 0 58px; flex-wrap: nowrap; flex-direction: column;/.test(html),
  'the mode tabs are a fixed-width vertical rail (no wrap, no clipping)');
assert(/#editor #edModes \.edMode \{ flex: 0 0 auto; width: auto;[^}]*border-radius: 8px;/.test(html),
  'each tab is a full rounded pill in the column (not a bottom-edge browser tab)');
assert(/#editor\.dockLeft #edModes\.edModes \{ border-right: none; border-left: 1px solid/.test(html),
  'the rail border swaps sides with the dock');

// markup: the shell wraps the rail + main, rail comes first
assert(/\+ '<div id="edShell"><div class="edModes" id="edModes"><\/div><div id="edMain">'/.test(src),
  'the rail is the first child of the shell, main follows');
assert(/\+ sec\('Campaign', 'campaign', '<div id="edCampaign"><\/div>'\)\s*\n\s*\+ '<\/div><\/div>'/.test(src),
  'the shell + main close after the last section');
assert(!/\+ '<div class="edModes" id="edModes"><\/div>'\s*\n\s*\+ '<div id="edSearchRow"/.test(src),
  'the old top-of-panel mode row is gone');

// collapse still hides everything but the header
assert(/#editor\.collapsed > \*:not\(#edTopBar\) \{ display:none; \}/.test(html), 'collapse still leaves just the header');

done('build 982: Blender-style vertical mode rail; content scrolls beside it');
