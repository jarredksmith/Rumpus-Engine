// (build 77) Two regression fixes: the Deploy wiring had been swallowed into a comment (newline lost),
// and the canvas relied on setSize's inline style, so a fresh window could leave it short (black page bg).
import { gameSource, html, done, assert } from './harness.mjs';
const src = gameSource();

// Deploy must be wired on its own statement, not trapped in the capture comment
assert(/overwrites it\n\s*const sb=document\.getElementById\('startBtn'\); if\(sb\) sb\.onclick=\(\)=>\{ campaignActive=false; _campaignComplete=false; startGame\(\); \};/.test(src),
  'Deploy (startBtn) wiring is live code, not commented out');

// canvas is anchored to the full viewport; setSize no longer fights it via inline style
assert(/canvas \{ display:block; position:fixed; top:0; left:0; width:100%; height:100%/.test(html), 'canvas is pinned full-viewport in CSS');
assert(/renderer\.setSize\(innerWidth, innerHeight, false\)/.test(src), 'setSize leaves the display size to CSS (updateStyle=false)');
assert(!/renderer\.setSize\(innerWidth, innerHeight\);/.test(src), 'no setSize call still writes inline style');
assert(/addEventListener\('load', _fitViewport\)/.test(src) && /setTimeout\(_fitViewport/.test(src), 're-fits after the window settles');
// the editor's Copy-code button was also swallowed into a comment by the same lost-newline class of bug
assert(!/id=\"edCopy\"/.test(src) && !/copyEditorCode\(\)/.test(src), 'the raw-JSON Copy code button + textarea were removed (build 983)');
done('deploy + canvas regression fixes');
