// Build a headless-drivable copy of breach.html.
//
// The whole game lives inside `window.GAME_START = function(){...}`, so page-level JS cannot reach its
// internals and `page.evaluate` can only see the closure's exports. This rewrite adds ONE hook — an `eval`
// trampoline declared inside `startGame` — which is enough to read or drive anything the game has.
//
// It has been rebuilt from memory three times in one session after the working directory was reset, which
// is why it lives in the repo now rather than in a scratch directory.
//
//   node tools/probe/mkprobe.mjs [outDir]        # writes <outDir>/probe.html   (default: ./probe-out)
//
// Then serve <outDir> and drive it — see tools/probe/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'probe-out'));

let src = fs.readFileSync(path.join(repo, 'breach.html'), 'utf8');
const sub = (needle, replacement, why) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error('mkprobe anchor x' + n + ' (want 1) for ' + why + ': ' + needle.slice(0, 60));
  src = src.replace(needle, replacement);
};

// 1) three from disk, so a run needs no network
sub("'https://unpkg.com/three@0.149.0/build/three.min.js',", "'/three.min.js',", 'three url');

// 2) THE HOOK. `startGame` is the closure everything interesting is declared in. Note this means
//    `window.__probe` does not exist until the START BUTTON has been clicked — a driver that waits for it
//    before clicking will hang forever, which cost two runs the first time.
sub('function startGame(){', 'function startGame(){ window.__probe = function(__f){ return eval(__f); };', 'probe hook');

// 3) Rapier is fetched from a CDN and is not needed for anything a probe asks about; a pending promise
//    here stalls the boot behind a network timeout.
sub('window.__PHYSICS_READY = (async function(){',
    'window.__PHYSICS_READY = Promise.resolve(null); window.__PHYSICS_DEAD = (async function(){ return null;',
    'physics loader');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'probe.html'), src);

// three.min.js beside it, from the test suite's own copy so the version can never drift from the game's
const three = path.join(repo, 'tests', 'node_modules', 'three', 'build', 'three.min.js');
if (fs.existsSync(three)) fs.copyFileSync(three, path.join(out, 'three.min.js'));
else console.warn('! tests/node_modules/three not found — copy a matching three.min.js into ' + out);
// build 1354: the game now loads PeerJS (and fflate) LOCAL-FIRST, so anything the probe serves has to
// carry them too — otherwise a probe reports "the local copy is not served" about its own staging.
for (const f of ['peerjs.min.js', 'fflate.min.js', 'rapier3d-compat.js']) {
  const src = path.resolve(repo, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
}

// build 1382: the game's own ASSET DIRECTORIES have to come too. `img/tex/` holds the stock level's floor
// and wall albedo (build 1378), served at a path relative to the game — so a probe staging without it
// 404s both textures and `_loadSurfaceMap` leaves `floorMat.map` NULL. That is silent: the frame renders,
// nothing errors, and the surfaces just look like they did before the build that added them. Every
// capture between 1378 and this one was judged on a ground with no albedo on it.
for (const d of ['img']) {
  const from = path.resolve(repo, d);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(out, d), { recursive: true });
}

console.log('probe.html written to ' + out);
