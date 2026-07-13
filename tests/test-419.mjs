import { html, assert, done } from './harness.mjs';
// build 550: the home/menu overlay heavily blurs the live scene behind it so it reads as abstract shapes and
// colors rather than a legible level. Implemented as a backdrop-filter on #overlay (over a translucent
// gradient vignette that keeps the title + buttons crisp). The overlay is display:none during gameplay, so
// the blur only runs on the menu / death / win screens.

// isolate the #overlay rule block
const m = html.match(/#overlay\s*\{[\s\S]*?\}/);
assert(!!m, '#overlay rule exists');
const rule = m[0];

assert(/backdrop-filter:\s*blur\(\d+px\)/.test(rule), '#overlay applies a backdrop blur');
assert(/-webkit-backdrop-filter:\s*blur\(\d+px\)/.test(rule), 'the -webkit- prefix is present for Safari');

// the blur must be substantial (>= 24px) so detail is gone, leaving shapes + colors
const px = +(rule.match(/backdrop-filter:\s*blur\((\d+)px\)/)||[])[1];
assert(px >= 24, 'the blur is substantial (>= 24px), got '+px);

// the gradient must stay translucent (center alpha < 1) so there is something to blur THROUGH
const center = rule.match(/radial-gradient\(circle at 50% 40%,\s*rgba\([^)]*,\s*\.(\d+)\)/);
assert(!!center, '#overlay keeps a translucent radial gradient over the blur');
assert(+('0.'+center[1]) >= 0.7 && +('0.'+center[1]) < 1, 'the gradient center is DARK but still translucent (build 962: the scene reads as a faint glow, not a picture)');

// the gradient vignette is still present (darker toward the edges for legibility)
assert(/rgba\(2,3,5,\.\d+\)\)/.test(rule), 'a near-black outer vignette is kept for title/button contrast (build 962)');

done('home menu blurs the scene behind it into shapes + colors (build 550)');
