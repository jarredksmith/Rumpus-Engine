import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 291: third-person chase camera v1
assert(/let tpMode = /.test(src), 'tpMode flag must exist');
assert(/localStorage\.getItem\('breach_tp'\)/.test(src), 'tpMode must persist');
const tcp = extractFunction('tpCameraPushback');
assert(/_cameraCollide\(px, py, pz, camx, camy, camz, TP_MIN/.test(tcp), 'chase cam must pull in past walls (build 799: full-offset recursive collision)');
// build 1086 moved the framing itself into _tpFrame so the editor can preview it; tpCameraPushback still
// owns the two live-only layers (damped follow, wall collision).
// (build 1103: the yaw/pitch route through _camYaw/_camPitch so ARPG cursor mode can freeze the boom)
assert(/const _f=_tpFrame\(_p, _camYaw, _camPitch, _b\);/.test(tcp), 'the live chase cam frames through the shared function');
{ const f=extractFunction('_tpFrame');
  assert(/_TPF\.x = pivot\.x - fx\*dist \+ rx\*side;/.test(f) && /_TPF\.y = pivot\.y - fy\*dist \+ height;/.test(f) && /_TPF\.z = pivot\.z - fz\*dist \+ rz\*side;/.test(f),
    'chase cam pulls back with blended side/distance/height framing (build 373)'); }
const uoa = extractFunction('updateOwnAvatar');
assert(/_ownAvatar\.visible=false/.test(uoa) && /a\.rotation\.y = \(typeof _ledge!=='undefined' && _ledge && _ledge\.yaw!=null\) \? _ledge\.yaw : player\.yaw/.test(uoa), 'own avatar shown/hidden + faced');
// own avatar must be flagged noHit and its proxies must not raycast
const eoa = extractFunction('ensureOwnAvatar');
assert(/userData\.noHit=true/.test(eoa), 'own avatar must be noHit');
assert(/if\(g\.userData\.noHit\) hpx\.raycast=\(\)=>\{\};/.test(src), 'head proxy must skip raycast when noHit');
assert(/if\(g\.userData\.noHit\) px\.raycast=\(\)=>\{\};/.test(src), 'hit proxy must skip raycast when noHit');
// loop must invoke it, gun hidden in TP
assert(/if\(tpActive\(\) && gameOn && !duelDead\)\{ gun\.visible=false; tpCameraPushback\(dt\); \}/.test(src), 'loop drives the chase cam + hides the gun (tpActive + dt for the damped follow, build 894)');
assert(/updateOwnAvatar\(dt\);/.test(src), 'loop updates the own avatar (dt drives landing timers, build 488)');
// pause menu toggle present + wired
assert(/id="pauseCamMode"/.test(html), 'pause menu needs a camera toggle button');
assert(/getElementById\('pauseCamMode'\)/.test(src) && /tpMode=!tpMode/.test(src), 'camera toggle must flip tpMode');
done();
