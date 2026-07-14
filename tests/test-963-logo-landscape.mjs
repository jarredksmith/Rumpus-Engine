// (build 963) LANDSCAPE-PHONE LOGO FIT. The logo was width-capped only (min(560px,84vw)), so on
// a 844x390 landscape phone it rendered ~162px tall and pushed the menu past the viewport. The
// width expression gains an 82vh term — ≈24vh of height at the logo's 3.45:1 aspect — so short
// viewports shrink it proportionally. NOTE: the SVG has no intrinsic width/height attributes, so
// the width must stay EXPLICIT (width:auto + max-* collapses it to 0x0 — found live). Measured
// headless: landscape 320x93 / portrait 328x95 / desktop 560x162, overlay overflow 0 on all three.
import { html, assert, done } from './harness.mjs';
assert(/#overlay h1 img \{ width:min\(560px, 84vw, 82vh\);/.test(html), 'the logo width is also capped by viewport height');
assert(!/#overlay h1 img \{ width:auto/.test(html), 'width stays explicit (the SVG has no intrinsic size)');
done('build 963: the logo shrinks with viewport height — landscape phones keep a short menu');
