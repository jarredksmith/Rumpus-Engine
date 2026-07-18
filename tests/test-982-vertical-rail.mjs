// (build 982) BLENDER-STYLE LEFT TAB RAIL — the 8 editor modes moved from a wrapping horizontal
// strip (which clipped HUD/Save on phones) to a vertical icon+label column on the panel's inner
// edge, with the content scrolling beside it. Rail mirrors to the other edge when the panel docks
// left. Build 985: the PANEL itself scrolls natively (mobile-safe) and the rail is pinned with
// position:sticky, replacing the 982 nested flex-scroll that broke touch scrolling.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

// build 985: the panel is the native scroll container again (touch-safe), not a clipped flex shell
assert(/#editor \{[^}]*overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;/.test(html),
  'the panel scrolls natively (touch-safe), not a clipped flex shell');
assert(/#editor \{[^}]*width: 344px; min-width: 288px;/.test(html), 'a touch wider to fit the rail + content');

// the shell + rail + main
assert(/#edShell \{ display: flex; align-items: flex-start; \}/.test(html), 'the shell is the flex row under the header');
assert(/#editor\.dockLeft #edShell \{ flex-direction: row-reverse; \}/.test(html), 'docking left mirrors the rail to the other edge');
assert(/#edMain \{ flex: 1 1 auto; min-width: 0;/.test(html), 'the content column sits beside the rail (panel scrolls as one)');
assert(/#edModes\.edModes \{ position: sticky; top: 46px;[^}]*flex: 0 0 58px; flex-wrap: nowrap; flex-direction: column;/.test(html),
  'the mode tabs are a fixed-width vertical rail (no wrap, no clipping), pinned with sticky so they never scroll away');
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
