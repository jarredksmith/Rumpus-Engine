import { html, assert, done } from './harness.mjs';
// build 603: previously-unstyled overlay buttons now match the menu styling.

// the multiplayer end-screen Replay button shares the primary (Deploy) style
assert(/#startBtn, #replayBtn \{/.test(html), 'Replay button uses the primary button style');
assert(/#startBtn:hover, #replayBtn:hover \{/.test(html), 'Replay button has the primary hover');

// the "Challenge a friend" (share) button shares the secondary style + icon alignment
assert(/\.secBtn, #chalBtn \{/.test(html), 'Challenge/share button uses the secondary style');
assert(/\.secBtn:hover, #chalBtn:hover \{/.test(html), 'Challenge/share button has the secondary hover');
assert(/#chalBtn \{ margin-top:10px; display:inline-flex; align-items:center; justify-content:center; gap:8px; \}/.test(html), 'Challenge/share button aligns its icon + label');
assert(/#chalBtn \.eico \{ width:16px; height:16px; \}/.test(html), 'Challenge/share button sizes its icon');

// guard: these two ids exist in the markup as bare (class-less) buttons that now rely on the id rules
assert(/<button id="replayBtn">/.test(html), 'replayBtn present in markup');
assert(/<button id="chalBtn">/.test(html), 'chalBtn present in markup');

done('overlay buttons styled: Replay (primary) + Challenge/share (secondary) (build 603)');
