import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 379: third-person tracer ORIGIN control. The bullet streak used to start from the first-person
// viewmodel muzzle even in third-person, so with the character offset to one side the streak came from the
// wrong place. Now in TP it starts from a configurable camera-local offset anchored on the character.

// persisted, clamped prefs
assert(/let tpMuzSide = 0\.5, tpMuzUp = -0\.2, tpMuzFwd = 0\.6;/.test(src), 'TP muzzle-origin offset prefs exist');
assert(/localStorage\.getItem\('breach_tp_muz_side'\)/.test(src) && /localStorage\.getItem\('breach_tp_muz_up'\)/.test(src) && /localStorage\.getItem\('breach_tp_muz_fwd'\)/.test(src), 'all three persist');

// the shoot path branches on tpMode for the streak origin
assert(/if\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\)\{\s*\n\s*tpMuzzleWorld\(muzzleWorld\);/.test(src), 'third-person (and top/side view) shots use the shared origin fn (build 489; widened to view modes in build 885)');
// the shared fn builds the origin from the player + the blended hip->aim offset
const tmw = extractFunction('tpMuzzleWorld');
assert(/out\.set\(player\.pos\.x \+ _rx\*_mS \+ _fx\*_mF/.test(tmw), 'tpMuzzleWorld builds origin from player + view-relative offset');
assert(/tpMuzSide \+ \(tpMuzAimSide - tpMuzSide\)\*_mb/.test(tmw), 'origin blends hip->aim by the aim ramp');
// a live tuning marker shares the same fn so the dot == the streak start, toggle persisted
assert(/function _updateMuzMarker\(\)/.test(src) && /tpMuzzleWorld\(_muzMarker\.position\)/.test(src), 'live origin marker reuses the shared fn');
assert(/localStorage\.setItem\('breach_show_muz'/.test(src), 'origin-marker toggle persists');
assert(/const _rx=_cy, _rz=-_sy;/.test(src), 'uses a level view-right vector for the side offset');
// first-person path unchanged (viewmodel muzzle projection)
assert(/\} else \{\s*\n\s*vmMuzzle\.getWorldPosition\(muzzleWorld\); muzzleWorld\.project\(vmCam\);/.test(src), 'first-person still uses the viewmodel muzzle');

// CRITICAL: hit detection still rays from the CAMERA, not the moved origin — only the visual start changes
assert(/raycaster\.setFromCamera\(new THREE\.Vector2\(sx, sy\), camera\);/.test(src), 'shots still ray from the camera (aim/hit unchanged)');

// executable: the offset math places the origin to the correct side. +side should land to view-right of the player.
function origin(side, up, fwd, yaw, pitch, ppos){
  const _cy=Math.cos(yaw), _sy=Math.sin(yaw), _cp=Math.cos(pitch), _sp=Math.sin(pitch);
  const _fx=-_cp*_sy, _fy=_sp, _fz=-_cp*_cy, _rx=_cy, _rz=-_sy;
  return new THREE.Vector3(ppos.x + _rx*side + _fx*fwd, (ppos.y-0.2)+up+_fy*fwd, ppos.z + _rz*side + _fz*fwd);
}
const ppos={x:0,y:2,z:0}, yaw=0.6, pitch=0;
const _cy=Math.cos(yaw), _sy=Math.sin(yaw), rx=_cy, rz=-_sy;
const oR = origin(1,0,0,yaw,pitch,ppos), oL = origin(-1,0,0,yaw,pitch,ppos);
// project each onto view-right relative to player: +side -> +1 along right, -side -> -1
assert(Math.abs((oR.x*rx + oR.z*rz) - 1) < 1e-9, '+side puts the origin one unit to view-right');
assert(Math.abs((oL.x*rx + oL.z*rz) + 1) < 1e-9, '-side puts it to view-left');
const up = origin(0,0.5,0,yaw,pitch,ppos);
assert(Math.abs(up.y - (ppos.y-0.2+0.5)) < 1e-9, 'up raises the origin');

// editor exposes the three sliders
assert(/muzHdr\.innerHTML='<b>Gunfire origin \(third-person\)<\/b>'/.test(src), 'a "Gunfire origin" slider group exists');
// build 489: precise slider + number box, and a SEPARATE aiming set blended by adsBlend
assert(/_muz\('Side', +\(\)=>tpMuzSide/.test(src) && /_muz\('Up', +\(\)=>tpMuzUp/.test(src) && /_muz\('Forward', +\(\)=>tpMuzFwd/.test(src), 'hip Side/Up/Forward controls wired');
assert(/_muz\('Side', +\(\)=>tpMuzAimSide/.test(src) && /_muz\('Up', +\(\)=>tpMuzAimUp/.test(src) && /_muz\('Forward', +\(\)=>tpMuzAimFwd/.test(src), 'aiming Side/Up/Forward controls wired');
assert(/let tpMuzAimSide = /.test(src) && /localStorage\.getItem\('breach_tp_muz_aim_side'\)/.test(src) && /localStorage\.getItem\('breach_tp_muz_aim_up'\)/.test(src) && /localStorage\.getItem\('breach_tp_muz_aim_fwd'\)/.test(src), 'aiming origin set exists + persists');
assert(/const _mS = tpMuzSide \+ \(tpMuzAimSide - tpMuzSide\)\*_mb;/.test(src), 'tracer origin blends hip->aim by adsBlend');
assert(/const num=document\.createElement\('input'\); num\.type='number'/.test(src), 'origin controls include an exact number box');
done();
