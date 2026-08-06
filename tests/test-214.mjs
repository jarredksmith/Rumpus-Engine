import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 304: chase cam pivots on the model's real centre (no sliding, only rotation)
assert(/g\.userData\.centerLocal = \{ x:\(mc\.xoff\|\|0\), y:\(mc\.yoff\|\|0\) \+ h\*0\.5, z:\(mc\.zoff\|\|0\) \}/.test(src), 'model centre stored at build');
assert(/g\.userData\.centerLocal=\{ x:0, y:1\.0, z:0 \}/.test(src), 'capsule placeholder centre stored');
const uoa = extractFunction('updateOwnAvatar');
assert(/a\.userData\.footY = footY;/.test(uoa), 'foot height exposed to the chase cam');
const tcp = extractFunction('tpCameraPushback');
// build 1086: the pivot and the framing became _tpPivot/_tpFrame, shared with the editor preview.
// (build 1103: the pivot yaw routes through _camYaw — identical to player.yaw outside cursor mode)
assert(/_tpPivot\(_ownAvatar, player\.pos, _camYaw, player\.pos\.y-EYE\)/.test(tcp), 'chase cam uses the model centre');
{ const pv=extractFunction('_tpPivot');
  assert(/obj\.userData\.centerLocal/.test(pv), '...read off the model');
  assert(/_TPP\.x = base\.x \+ cl\.x\*cy \+ cl\.z\*sy;/.test(pv) && /_TPP\.z = base\.z - cl\.x\*sy \+ cl\.z\*cy;/.test(pv),
    'pivot rotates the local centre by yaw');
  /* build 1413 split this: the HORIZONTAL half above is byte-identical and still what stops the model
     swinging around the reticle. The vertical half used to read `_TPP.y = fY + cl.y`, which was asserting
     the DEFECT — the camera's sight line was half the drawn model's height, so it changed with the
     costume (build 1290 measured 0.25 for a 0.5 m creature against an EYE of 1.7). It is still the
     model's centre, now bounded by the player's own body. */
  assert(/_TPP\.y = fY \+ Math\.max\(TP_PIVOT_MIN, Math\.min\(TP_PIVOT_MAX, cl\.y\)\);/.test(pv),
    '...and sits at model-centre height, bounded by the PLAYER (build 1413)');
  const f=extractFunction('_tpFrame');
  assert(/_TPF\.x = pivot\.x - fx\*dist \+ rx\*side;/.test(f), 'chase cam pulls back with blended side/distance/height framing (build 373)'); }
done();
