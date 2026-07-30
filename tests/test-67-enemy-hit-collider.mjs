// (build 98) Shots test an invisible cylinder hit-proxy (not the skinned mesh), with radius + HEIGHT
// controls and a visualization. Fixes hits collapsing to the feet on animated GLB enemies.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

// config carries a collider-height field everywhere a level travels
assert(/ENEMY_MODEL0 = \{ url:'', scale:1, face:0, cr:0, ch:0,/.test(src), 'ENEMY_MODEL0 has ch (collider height)');
assert(/ch: src\.ch\|\|0/.test(src), 'applyEnemyModelData copies ch');
assert(/cr:m\.cr, ch:m\.ch,/.test(src), 'serializeLevel writes ch');

// the hit proxy: invisible, raycastable cylinder, spanning floor -> height
const sp = extractFunction('setEnemyHitProxy');
assert(/CylinderGeometry\(r, r, hb, 10\)/.test(sp), 'body proxy is a radius/shortened-height cylinder');
assert(/h\/2 - 1\.4/.test(sp), 'proxy spans floor to height (body at y=1.4)');
assert(/_ENEMY_PROXY_MAT\.visible = false/.test(src), 'proxy material is not drawn');

// visuals stop intercepting shots so only the cylinder is hit
assert(/cap\.traverse\(o=>\{ o\.raycast = \(\)=>\{\}; \}\)/.test(src), 'capsule mesh raycast disabled');
assert(/model\.traverse\(o=>\{ if\(o\.isMesh\) o\.raycast = \(\)=>\{\}; \}\)/.test(src), 'model mesh raycast disabled');
assert(/setEnemyHitProxy\(body, mc\.cr > 0 \? mc\.cr : body\.userData\.footprint, mc\.ch > 0 \? mc\.ch : 2\.8\*ty\.scale\)/.test(src), 'capsule: cr sizes the hit cylinder, footprint stays auto');
assert(/setEnemyHitProxy\(body, mc\.cr > 0 \? mc\.cr : body\.userData\.footprint, mc\.ch > 0 \? mc\.ch : \(body\.userData\.autoColH \|\| 2\.6\)\)/.test(src), 'model: cr sizes the hit cylinder, footprint stays auto');
// movement footprint must NOT be overridden by the collider radius (that was trapping enemies)
assert(!/if\(mc\.cr > 0\) body\.userData\.footprint = mc\.cr/.test(src), 'collider radius no longer inflates movement spacing');
// build 1154: from the capsule's own radius, not a larger constant — see ENEMY_CAP_R.
assert(/body\.userData\.footprint = ENEMY_CAP_R\*ty\.scale;/.test(src), 'capsule movement footprint is auto');

// visualization: live enemy hit-cylinders drawn when "show colliders" is on
const vz = extractFunction('updateColliderViz');
assert(/u\.hitProxy/.test(vz) && /_enemyVizMat/.test(vz), 'collider viz draws enemy hit-cylinders');

// editor height control
assert(/Collider height/.test(src), 'editor exposes a Collider height control');
assert(/mc\.ch=m; refreshEnemyVisuals\(\)/.test(src), 'height control writes ch + rebuilds');
done('enemy hit collider (radius + height + viz)');
