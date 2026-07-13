// (build 961) FIRST-LOAD DEAD-MENU FIX. The menu paints seconds before it works (buttons wire
// only after the full 2.4MB file parses, three.js arrives, and Rapier resolves — GAME_START
// gates on physics). Three-part fix, all verified live with three.js throttled 6s and every
// rapier CDN hard-blocked: (1) rapier3d-compat.js ships beside the game, so the first-choice
// './rapier3d-compat.js' import hits — no 404, no 2MB CDN hop (window.RAPIER came up with ZERO
// CDN requests); (2) a boot veil — buttons dim + a pulsing LOADING ENGINE pill until wired;
// (3) click queueing — a click during boot is captured, explained in the pill, and REPLAYED
// once GAME_START finishes (the multiplayer modal opened by itself after boot in the test).
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();
const dir = path.dirname(fileURLToPath(import.meta.url));

// the local physics build ships and is first in the import list
const rf = path.join(dir, '..', 'rapier3d-compat.js');
assert(statSync(rf).size > 2_000_000, 'rapier3d-compat.js ships beside the game');
assert(/rapier3d-compat@0\.19\.3/.test(readFileSync(rf, 'utf8').slice(0, 400)), 'it is the 0.19.3 compat ESM bundle');
assert(/'\.\/rapier3d-compat\.js',\s*\/\/ optional self-hosted copy/.test(html), 'the local copy stays first in SOURCES');

// boot veil: class on early, pill markup + CSS, buttons dimmed
assert(/document\.body\.classList\.add\('booting'\);/.test(html), 'the early script raises the veil');
assert(/<div id="bootPill">LOADING ENGINE&#8230;<\/div>/.test(html), 'the pill sits under the tagline');
assert(/body\.booting #overlay button \{ opacity:\.55; cursor:progress; \}/.test(html), 'buttons visibly dim while booting');
assert(/body:not\(\.booting\) #bootPill \{ display:none; \}/.test(html), 'the pill only shows while booting');

// click queueing: capture during boot, replay at the end of GAME_START
assert(/window\.__earlyClick = b; e\.preventDefault\(\); e\.stopPropagation\(\);/.test(html), 'a boot-time click is queued, not dropped');
assert(/your click lands as soon as the engine is ready/.test(html), 'the pill explains the queued click');
assert(/document\.body\.classList\.remove\('booting'\);/.test(src), 'GAME_START drops the veil when everything is wired');
assert(/const _ec = window\.__earlyClick; window\.__earlyClick = null; setTimeout\(\(\)=>\{ try\{ _ec\.click\(\); \}catch\(e\)\{\} \}, 60\);/.test(src),
  'the queued click replays once ready');

done('build 961: boot veil + click queueing + local Rapier (no CDN on the critical path)');
