import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 554: a cinematic must not flash the live gameplay view before its camera takes over. Three pieces:
// (1) startCinematic frames + paints the opening shot immediately; (2) on deploy the intro starts BEFORE the
// loader cover is dropped; (3) when an intro will play, a cover is held even if no assets are pending (the
// cached-redeploy case that used to show ~300ms of gameplay before the cutscene).

// (1) startCinematic pre-frames and paints the first shot
const sc = extractFunction('startCinematic');
assert(/updateCinematic\(0\); if\(typeof renderScene==='function'\) renderScene\(scene, camera\);/.test(sc), 'startCinematic frames the opening shot and paints it once immediately');
assert(/_cineActive=true;/.test(sc), 'startCinematic still activates the cutscene');

// (2) reveal() starts the intro before hiding the loader
const wr = extractFunction('waitAssetsThenReveal');
assert(/maybeStartIntroCine\(\); \}catch\(e\)\{\} \} hideLevelLoader\(\);/.test(wr), 'the intro starts, THEN the loader hides (loader fades onto the cinematic)');

// (3) startGame holds a cover when an intro will play even with no assets pending
const sg = extractFunction('startGame');
assert(/const _introWillPlay = \(typeof cineCfg!=='undefined' && cineCfg\.on && typeof _ccHasData==='function' && _ccHasData\(cineCfg\)\)/.test(sg), 'startGame detects whether an intro cinematic will play');
assert(/if\(_introWillPlay && !_levelLoaderActive\)\{ showLevelLoader\(\); waitAssetsThenReveal\(\); \}/.test(sg), 'an intro with no pending assets still raises a cover so gameplay never flashes first');
assert(/if\(_levelLoaderActive\) _cineIntroPending = true;/.test(sg), 'with a cover up, the intro is deferred to reveal()');

// the loop still freezes the world behind the loader (so the covered frames are not live gameplay)
assert(/if\(_levelLoaderActive\)\{[^}]*renderScene\(scene,camera\); renderViewmodel\(\); return; \}/.test(src), 'the loop holds the world frozen behind the cover');

done('cinematic transitions paint first / start-before-reveal / hold a cover — no gameplay flash (build 554)');
