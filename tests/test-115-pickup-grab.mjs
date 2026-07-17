// (build 164) Pickup fixes: editor preview markers are disposed at deploy (so the live, grabbable pads are
// the only ones present — no phantom ungrabbable copies), grab radius widened, and weapon pickups float a
// small model of the weapon instead of the gem.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
const bm = extractFunction('buildPowerupMesh');
assert(/WEAPON_PICKUP_KINDS\[kind\]/.test(bm) && /wepModelUrl\(kind\)/.test(bm) && /loadGLTFCached\(url,/.test(bm), 'weapon pickups float the weapon model');
assert(/const WEAPON_PICKUP_KINDS = \{ pistol:1, rifle:1, smg:1, shotgun:1, sniper:1, launcher:1 \};/.test(src), 'weapon kinds defined');
assert(/function disposePickupMarkers\(\)/.test(src), 'marker disposal helper');
assert(/if\(typeof disposePickupMarkers==='function'\) disposePickupMarkers\(\);/.test(src), 'deploy disposes editor preview markers');
const up = extractFunction('updatePowerups');
assert(/if\(near && nd < 2\.0 && !\(p\.interact && near\.id===NET\.myId\)\)\{ grantPowerup/.test(up), 'forgiving grab radius');
done('pickup grab + weapon model');
