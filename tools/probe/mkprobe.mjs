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
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'probe-out'));

fs.mkdirSync(out, { recursive: true });
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

// build 1389: PROBE_PROF=1 wraps named engine functions with a cumulative timer, so "the load takes ten
// seconds" becomes "which function spent them". Installed at the TOP of GAME_START, which works because
// FUNCTION DECLARATIONS ARE HOISTED — every name below is already bound there, while a `const` would be in
// its temporal dead zone. Reassignment goes through `eval` so it rebinds the closure's own name, not a copy.
if (process.env.PROBE_PROF) {
  const NAMES = (process.env.PROBE_PROF_FNS ||
    'buildPhysWorld,destroyPhysWorld,addStaticColliderFor,buildModelGridBoxes,refreshPropCollider,' +
    '_bakeTick,_bakeCollect,buildInstancing,preloadVfx,warmFlipbookShaders,restoreLevel,loadHostedProps,' +
    'spawnProp,finalizeProp,applyWorldCfg,applySky,buildSceneProbe,_fitSunShadow,renderScene,' +
    'toggleEditor,renderEditorFields,setEditorMode,navBuild,startGame,deployLevel,serializeLevel'
  ).split(',');
  sub('window.GAME_START = function(){',
    'window.GAME_START = function(){ window.__PROF = {}; (function(){ for(const __n of ' +
    JSON.stringify(NAMES) + '){ try{ var __f = eval(__n); if(typeof __f !== "function") continue;' +
    ' var __p = window.__PROF[__n] = { n:0, ms:0, max:0 };' +
    ' var __w = (function(f, p){ return function(){ var t = performance.now();' +
    ' try { return f.apply(this, arguments); } finally { var d = performance.now() - t;' +
    ' p.n++; p.ms += d; if(d > p.max) p.max = d; } }; })(__f, __p);' +
    ' eval(__n + " = __w"); }catch(e){ window.__PROF[__n] = { err: String(e).slice(0,60) }; } } })();',
    'profiler');
}

// build 1429: a LOCAL KTX2 pipeline, when tools/probe/stage-ktx2.mjs has staged one. The loader comes from
// esm.sh and the Basis transcoder from jsdelivr, and the headless browser can reach neither — so a
// KTX2/Basis model could not be reproduced here at all. Optional: with nothing staged, both URLs are left
// exactly as they ship and the probe behaves as it always did.
if (fs.existsSync(path.join(out, 'jsm', 'loaders', 'KTX2Loader.js')))
  sub("'https://esm.sh/three@0.149.0/examples/jsm/loaders/KTX2Loader.js'", "'/jsm/loaders/KTX2Loader.js'", 'ktx2 loader url');
if (fs.existsSync(path.join(out, 'basis', 'basis_transcoder.wasm')))
  sub("'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/libs/basis/'", "'/basis/'", 'basis transcoder path');

// 3) Rapier is fetched from a CDN and is not needed for anything a probe asks about; a pending promise
//    here stalls the boot behind a network timeout.
// build 1389: the stub is now OPT-IN. It exists because the Rapier CDNs HANG in this sandbox (no
// connection reset, so the boot never settles and GAME_START never runs) — but build 1354 vendored
// `rapier3d-compat.js` and this staging copies it, and the loader tries the self-hosted copy FIRST. So
// physics can boot here for real, and every probe until now has measured a world with no physics in it.
// PROBE_NOPHYS=1 restores the stub for a run that does not want to pay for it.
if (process.env.PROBE_NOPHYS) sub('window.__PHYSICS_READY = (async function(){',
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

// build 1389: STAMP THE BUILD. This container has rolled back fourteen times, and `mkprobe` reads whatever
// `breach.html` happens to be on disk — so a rollback mid-session produces a probe of an OLD build that
// boots fine, measures fine, and answers a question about code that is no longer in the tree. It happened:
// a probe staged during a rollback window reported `_odBumpU is not defined` about a build that had
// declared it five builds earlier, and everything measured through that staging was about build 1381.
// `docs/frames/README.md` has said "know what BUILD you are measuring — stamp it or diff it" since 1382;
// this is that, enforced rather than remembered. `driver.mjs` refuses to run against a stale stamp.
//
// build 1414: THE STAMP IS A HASH, and the version string beside it is only a label. 1389 keyed the guard
// on BUILD_VERSION — a value this project's own workflow bumps LAST, after the edits, the probes and the
// suite. So for the whole life of a build the repo and the staging carry the SAME version string while
// holding DIFFERENT code, the guard reports fresh, and every probe run during development silently
// measures the previous build. It cost this build a run: `point-shadow-blocks` read `wantShadow false`
// and three's default 0.5/500 shadow camera off a `buildLight` that had already been rewritten, which
// looks exactly like the new code being broken. A digest cannot be defeated by ordering.
const _bv = (src.match(/const BUILD_VERSION = '([^']*)'/) || [, 'UNKNOWN'])[1];
const _sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, 'breach.html'))).digest('hex').slice(0, 16);
fs.writeFileSync(path.join(out, 'BUILD'), _sha + '  ' + _bv + '\n');
console.log('probe.html written to ' + out + '   [' + _bv + ' · ' + _sha + ']');
