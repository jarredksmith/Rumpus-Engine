import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 602: per-placed-pickup transform — height (Y), rotation (X/Y/Z), scale, plus X/Z position.

// the helper applies all of it, seated on terrain
const ax = extractFunction('_applyPickupXform');
assert(/obj\.position\.set\(sp\.x, _maxTerrainOver\(sp\.x,sp\.z,1\.2\)\+\(\+sp\.y\|\|0\), sp\.z\)/.test(ax), 'Y is a height offset above terrain');
assert(/obj\.rotation\.set\(\(\+sp\.rx\|\|0\)\*RAD, \(\+sp\.ry\|\|0\)\*RAD, \(\+sp\.rz\|\|0\)\*RAD\)/.test(ax), 'full X/Y/Z rotation applied (degrees)');
assert(/obj\.scale\.setScalar\(\(sp\.scale!=null && \+sp\.scale>0\)\?\+sp\.scale:1\)/.test(ax), 'scale applied (clamped > 0)');

// all three placement sites use the helper
assert(/_applyPickupXform\(g, sp\)/.test(src), 'editor markers use the transform');
assert(/_applyPickupXform\(mesh, spot\)/.test(src), 'spawned pickups use the transform');

// persistence: transform saves only when non-default, and reloads
assert(/\.\.\.\(s\.y\?\{y:s\.y\}:\{\}\)/.test(src) && /\.\.\.\(s\.scale!=null&&s\.scale!==1\?\{scale:s\.scale\}:\{\}\)/.test(src), 'transform serialized when non-default');
assert(/y:\+s\.y\|\|0, rx:\+s\.rx\|\|0, ry:\+s\.ry\|\|0, rz:\+s\.rz\|\|0, scale:\(s\.scale!=null\?\+s\.scale:1\)/.test(src), 'transform reloads with the level');

// editor panel: sliders re-apply to the live marker (no full rebuild), reset, and an edit toggle
const pp = extractFunction('_pickupXformPanel');
assert(/if\(pickupMarkers\[i\]\) _applyPickupXform\(pickupMarkers\[i\], sp\)/.test(pp), 'sliders update the live marker directly');
assert(/num\('Height \(Y\)'/.test(pp) && /num\('Rotate Y\\u00b0'/.test(pp) && /num\('Scale'/.test(pp), 'panel exposes height, rotation, scale');
assert(/sp\.y=0; sp\.rx=0; sp\.ry=0; sp\.rz=0; sp\.scale=1/.test(pp), 'reset clears the transform');
assert(/selPickup=\(selPickup===i\?-1:i\)/.test(src) && /if\(selPickup===i\) _pickupXformPanel\(pkHost, sp, i\)/.test(src), 'per-spot edit toggle opens the panel');

done('pickup transform: per-placed height/rotation/scale/position, live + persisted (build 602)');
