// (build 957) The "Open games" rows were nearly unreadable — the row text inherited a dim color
// and the mode label was faded to 60% opacity on top of it. The row now sets an explicit bright
// text color and the mode label gets its own readable tint instead of an opacity fade.
// Verified with a headless screenshot of two rendered rows.
import { html, assert, done } from './harness.mjs';

assert(/\.gameRow\{[^}]*color:#dff5ec;/.test(html), 'game rows use a bright explicit text color');
assert(/\.gameRow \.gmode\{ font-size:10px; letter-spacing:\.09em; color:#9fc4ba; \}/.test(html),
  'the mode label has its own readable tint (no opacity fade)');
assert(!/\.gameRow \.gmode\{[^}]*opacity:\.6/.test(html), 'the old 60% opacity fade is gone');

done('build 957: Open games rows are readable');
