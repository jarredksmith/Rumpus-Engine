import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/function clearMovementInput\(\)/.test(src), 'clearMovementInput helper exists');
assert(/for\(const k in keys\) keys\[k\]=false;\s*\n\s*touchMoveX=0; touchMoveZ=0;/.test(src), 'clears keyboard + touch movement state');
assert(/function startWave\(\)\{[\s\S]{0,260}?\n  clearMovementInput\(\);/.test(src), 'wave start clears held input (build 1027: after the logic-graph onwave hook)');
assert(/clearMovementInput\(\);   \/\/ start fresh/.test(src), 'round/deploy start clears held input');
done('clear-input');
