// (build 960) The home-screen wordmark is the brand SVG logo (img/RumpusEngine.svg, shipped in
// the repo so it resolves on BOTH hosts), replacing the Kaph text. The alt text keeps "RUMPUS
// ENGINE" (and the h1's Kaph styling from build 954 stays), so a missing file degrades to the
// old text wordmark. Sized responsively with a theme-colored glow. Screenshots eyeballed at
// 1440px and 390px.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { html, assert, done } from './harness.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

assert(/<h1><img id="menuLogo" src="img\/RumpusEngine\.svg" alt="RUMPUS ENGINE"><\/h1>/.test(html),
  'the h1 holds the logo img with the text as alt fallback');
assert(/#overlay h1 img \{ width:min\(560px, 84vw, 82vh\); height:auto; display:block; margin:0 auto; filter:drop-shadow\(0 0 26px rgba\(var\(--accent-rgb\),\.35\)\); \}/.test(html),
  'responsive sizing + theme glow (82vh height cap since build 963)');
assert(/font-family:'Kaph', var\(--display-font\)/.test(html), 'the Kaph alt-text fallback styling stays');

const f = path.join(dir, '..', 'img', 'RumpusEngine.svg');
assert(statSync(f).size > 1000, 'the SVG ships in the repo');
const svg = readFileSync(f, 'utf8');
assert(/<svg[^>]*viewBox="0 0 631\.82 183\.14"/.test(svg), 'it is the real logo (631x183 viewBox)');

done('build 960: home-screen wordmark is the brand SVG logo');
