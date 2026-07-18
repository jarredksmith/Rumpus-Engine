import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 384: per-state clip SPEED and HOLD flags weren't persisted through save/reload — only `clips` was
// serialized. On reload clipHold came back empty, so every hold checkbox fell to its default (die checked,
// the rest unchecked), wiping the user's choices. Now speed + hold ride every save/restore path.

// the player-model SAVE includes speed + hold
assert(/clipSpeed: Object\.assign\(\{\}, playerModelCfg\.clipSpeed\|\|\{\}\), clipHold: Object\.assign\(\{\}, playerModelCfg\.clipHold\|\|\{\}\), clipInPlace: Object\.assign\(\{\}, playerModelCfg\.clipInPlace\|\|\{\}\), grip: _sanitizeGripMap\(tpGunGrips\), view: _snapshotView\(\) \}/.test(src), 'player save serializes clipSpeed + clipHold + clipInPlace (build 493)');
// the player-model RESTORE reads them back
assert(/playerModelCfg\.clipSpeed=Object\.assign\(\{\}, pl\.clipSpeed\|\|\{\}\); playerModelCfg\.clipHold=Object\.assign\(\{\}, pl\.clipHold\|\|\{\}\);/.test(src), 'player restore reads clipSpeed + clipHold');

// the roster (bots / other characters) saves + restores them too
assert(/clips:Object\.assign\(\{\},c\.clips\|\|\{\}\), clipSpeed:Object\.assign\(\{\},c\.clipSpeed\|\|\{\}\), clipHold:Object\.assign\(\{\},c\.clipHold\|\|\{\}\), clipInPlace:Object\.assign\(\{\},c\.clipInPlace\|\|\{\}\), grip:_sanitizeGripMap\(c\.grip\), view:_sanitizeView\(c\.view\) \}\)\)/.test(src), 'roster save includes grip + baked view (build 526)');
assert(/clipSpeed:Object\.assign\(\{\}, \(c\.clipSpeed&&typeof c\.clipSpeed==='object'\)\?c\.clipSpeed:\{\}\), clipHold:Object\.assign\(\{\}, \(c\.clipHold&&typeof c\.clipHold==='object'\)\?c\.clipHold:\{\}\)/.test(src), 'roster restore (sanitize) reads speed + hold');

// no clips copy drops them (the bug class): every "clips:Object.assign({}, c.clips...)" carries clipHold nearby
const copies = [...src.matchAll(/clips:Object\.assign\(\{\},\s*c\.clips\|\|\{\}\)/g)];
for(const m of copies){ const tail = src.slice(m.index, m.index+120); assert(/clipHold/.test(tail), 'a character-config copy carries clipHold (no silent drop)'); }
assert(copies.length >= 2, 'sanity: found the character-config copies');
done();
