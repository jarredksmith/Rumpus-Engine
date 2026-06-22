import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 523: the Turrets tab is registered in Build mode so it actually appears in the editor's tab row
// (tabs auto-generate from editorTargets, but MODE_TARGETS gates which show per mode).
assert(/build:   \['props','lights','station','player','pstart','extract','turrets'\],/.test(src), 'Turrets is a Build-mode target tab');
done();
