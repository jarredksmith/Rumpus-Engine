// (build 962) The home-screen backdrop is much darker: the radial vignette over the blurred
// live scene went from (center .42 / edges .90) to (center .82 / edges .97), so the scene
// reads as a faint glow rather than a picture. Screenshot eyeballed at 1440px and 390px.
import { html, assert, done } from './harness.mjs';
assert(/#overlay \{[\s\S]{0,400}?background: radial-gradient\(circle at 50% 40%, rgba\(4,10,9,\.82\), rgba\(2,3,5,\.97\)\);/.test(html),
  'the overlay vignette is the darkened build-962 gradient');
assert(!/rgba\(10,30,28,\.42\)/.test(html), 'the old lighter gradient is gone');
done('build 962: darker home-screen backdrop');
