// (build 979) A dim build tag in the home menu's corner — the deployed version was only visible in
// the backquote controller-debug overlay, unreachable on phones, so "am I on the new build?" was
// unanswerable exactly when it mattered (cache confusion on mobile).
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
assert(/<div id="buildTag"><\/div>/.test(html), 'the tag lives inside the menu overlay');
assert(/#buildTag \{ position:absolute; right:calc\(10px \+ env\(safe-area-inset-right\)\);/.test(html),
  'pinned to the corner, safe-area aware, dim and non-interactive');
assert(/bt\.textContent=BUILD_VERSION;/.test(src), 'populated from BUILD_VERSION at boot');
done('build 979: the running build number shows on the home menu');
