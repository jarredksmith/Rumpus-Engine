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
assert(/#overlay h1 img \{ width:min\(560px, 84vw, 82vh\); height:auto; display:block; margin:0 auto; \}/.test(html),
  'responsive sizing, no glow (build 966)');
assert(/font-family:'Kaph', var\(--display-font\)/.test(html), 'the Kaph alt-text fallback styling stays');

const f = path.join(dir, '..', 'img', 'RumpusEngine.svg');
assert(statSync(f).size > 1000, 'the SVG ships in the repo');
const svg = readFileSync(f, 'utf8');
// the artist re-uploads this file (e.g. 9e941ac changed 631.82x183.14 -> 564.78x155.68), so pin
// "it is a real vector logo" rather than exact dimensions: a landscape viewBox + actual path data
const vb = svg.match(/<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/);
assert(vb && parseFloat(vb[1]) > parseFloat(vb[2]), 'it is a real landscape-format logo (viewBox present, wider than tall)');
assert(/<path[^>]*d="/.test(svg), '...with vector path data, not a placeholder');

done('build 960: home-screen wordmark is the brand SVG logo');
