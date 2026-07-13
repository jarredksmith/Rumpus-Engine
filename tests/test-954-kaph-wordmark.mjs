// (build 954) The menu wordmark uses Kaph (GGBotNet, SIL OFL 1.1), shipped in fonts/ BESIDE the
// game so the relative URL resolves same-origin on every host (rumpusengine.com AND GitHub Pages
// — no CORS, and a missing file just falls back to the themed --display-font). Size cap re-tuned:
// Kaph at 130px measured 1411px wide (wrapped on every laptop); 106px measures 1165px → one line
// at 1280px+ viewports, clean two-line wrap below. Verified headless: document.fonts.check
// ("16px 'Kaph'") true on desktop + phone, screenshots eyeballed at 1920/1440/1280/1150/1024/390.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();
const dir = path.dirname(fileURLToPath(import.meta.url));

// @font-face: relative URL (host-agnostic), swap so the menu never blocks on the font
assert(/@font-face \{ font-family:'Kaph'; src:url\('fonts\/Kaph-Regular\.woff'\) format\('woff'\); font-display:swap; \}/.test(html),
  '@font-face declares Kaph from the relative fonts/ path with font-display:swap');

// the wordmark uses Kaph first, themed display font as fallback, with the re-tuned size cap
assert(/font-family:'Kaph', var\(--display-font\); font-size: clamp\(48px, 10\.5vw, 106px\);/.test(html),
  'the overlay h1 is Kaph with --display-font fallback and the width-tuned clamp');

// the font file actually ships in the repo (it is a WOFF, not an HTML error page)
const fp = path.join(dir, '..', 'fonts', 'Kaph-Regular.woff');
assert(statSync(fp).size > 50000, 'fonts/Kaph-Regular.woff ships in the repo');
assert(readFileSync(fp).subarray(0, 4).toString('latin1') === 'wOFF', 'the shipped file has the WOFF magic');

// attribution: OFL fonts shipped with the game are credited
assert(/\{ name:'Kaph \(wordmark font, shipped in \/fonts\)', by:'GGBotNet', lic:'SIL OFL 1\.1', url:'https:\/\/ggbot\.itch\.io\/kaph-font' \}/.test(src),
  'Kaph is credited (GGBotNet, SIL OFL 1.1)');

done('build 954: Kaph wordmark font — shipped in fonts/, relative URL, credited, width-tuned');
