import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 396 + 399: animated props list the model's clips and play ONE chosen clip; build 399 split control
// into WHEN (auto/interact/signal) and HOW (loop/pingpong/once). These check the clip-selection half.

const pma = extractFunction('playModelAnimations');
assert(/root\.userData\.animClipNames = clips\.map\(c=>c\.name\|\|''\);/.test(pma), 'available clip names are stored for the picker (build 1064: custom clips included)');
assert(/const chosen = root\.userData\.animClip \|\| '';/.test(pma), 'reads the chosen clip ("" = all)');
assert(/const usethis = chosen \? \(clip\.name === chosen\) : !caSet\.has\(clip\);/.test(pma), 'plays only the chosen clip when one is set (build 1064: unpicked custom clips never auto-play)');
assert(/if\(trig==='auto' && usethis\)\{ action\.play\(\); \}/.test(pma), 'auto props start the chosen clip on spawn (build 399)');

// live clip switch (auto props only)
const spc = extractFunction('setPropAnimClip');
assert(/obj\.userData\.animClip = clipName \|\| '';/.test(spc), 'setting a clip records it');
assert(/if\(\(obj\.userData\.animTrigger\|\|'auto'\) !== 'auto'\) return;/.test(spc), 'only auto props play the new clip live');

// threaded through spawn/finalize + serialized + restored
assert(/function spawnProp\(src, t, onReady, slot, animMode, mat, onError, nid, animClip\)\{/.test(src), 'spawnProp takes animClip');
assert(/function finalizeProp\(obj, src, t, gltf, slot, animMode, mat, nid, animClip\)\{/.test(src), 'finalizeProp takes animClip');
assert(/obj\.userData\.animClip = animClip \|\| ''; playModelAnimations\(obj, gltf, obj\.userData\.animMode, true\);/.test(src), 'animClip is set before the prop plays (build 1064: props accept custom-only rigs)');
assert(/if\(o\.userData\.animClip\) e\.animClip = o\.userData\.animClip;/.test(src), 'chosen clip is saved with the level');
assert((src.match(/undefined, p\.nid, p\.animClip\)/g)||[]).length >= 2, 'both prop loaders restore the chosen clip');

// the editor exposes a clip dropdown listing the model's animations
assert(/optAll\.textContent='\(all clips at once\)';/.test(src), 'dropdown offers "all clips" plus each named clip');
assert(/csel\.onchange=\(\)=>\{ setPropAnimClip\(sel, csel\.value\);/.test(src), 'choosing a clip applies it');
done();
