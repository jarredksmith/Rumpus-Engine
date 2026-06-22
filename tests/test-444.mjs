import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 589: unlimited ammo console toggle for testing.
assert(/window\.infiniteAmmo = function\(on\)\{/.test(src) && /_infAmmo = \(on!==false\)/.test(src), 'infiniteAmmo(on) toggles the flag');
assert(/for\(const k in WEAPONS\)\{ const w=WEAPONS\[k\]; if\(w && w\.reserveMax!=null && w\.reserve<w\.reserveMax\) w\.reserve=w\.reserveMax; \}/.test(src.replace(/\n/g,' ')), 'each frame tops reserves so reloads always succeed (mag/reload still behave)');
done('unlimited ammo console toggle (build 589)');
