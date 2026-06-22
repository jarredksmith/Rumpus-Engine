import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 555: the world music used to begin the instant a level started loading — i.e. behind the loading
// screen. It now waits: it starts in reveal() (when the loader finishes) or, when no loader/cover is up at
// all, at the very end of startGame. It must NEVER start during the load.

// no longer kicked off during startGame's load setup (was right after initAudio)
assert(!/initAudio\(\);\s*\n\s*startMusic\(\);/.test(src), 'startMusic is no longer called during loading setup');

// reveal() (loader finished) starts it, after the loader hides
const wr = extractFunction('waitAssetsThenReveal');
assert(/hideLevelLoader\(\); try\{ startMusic\(\); \}catch\(e\)\{\} \};/.test(wr), 'music starts in reveal(), once loading is complete');

// the no-cover case starts it at the end of startGame, gated on no loader being up
const sg = extractFunction('startGame');
assert(/if\(!_levelLoaderActive\)\{ try\{ startMusic\(\); \}catch\(e\)\{\} \}/.test(sg), 'with no loader/cover, music starts at the end of startGame');

// startMusic itself is still idempotent (guards against double-start when both paths could touch it)
const sm = extractFunction('startMusic');
assert(/if\(!actx\|\|!musicBus\|\|_musicOn\) return;/.test(sm), 'startMusic is a no-op if already playing (safe to call from either path)');

done('world music waits for the loading screen to finish before starting (build 555)');
