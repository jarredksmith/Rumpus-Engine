import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/let _glbPending = 0;/.test(src), 'pending GLB-load counter exists');
assert(/_glbPending\+\+;/.test(src) && /_glbPending=Math\.max\(0,_glbPending-1\)/.test(src), 'loader tracks in-flight GLB loads');
assert(/function showLevelLoader\(\)/.test(src) && /function waitAssetsThenReveal\(\)/.test(src), 'level loading screen + ready gate');
assert(/if\(_levelAssetsPending\(\) \|\| _loadCover\)\{ _loadCover=false; showLevelLoader\(\); waitAssetsThenReveal\(\); \}/.test(src), 'startGame holds the loader until all assets (models, sky, textures) settle');
assert(/now-t0>=15000/.test(src), 'safety timeout so the loader can never trap the player');
done('level-loader');
