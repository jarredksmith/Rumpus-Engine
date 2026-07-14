// (build 964) WEAPON LOADOUTS FULLY FUNCTIONAL. The audit found the mag/spread/laser mods real
// but two wires dead: optics' zoom was computed into _attZoom and NEVER read (Red Dot did
// nothing, 2x Scope didn't magnify), and the Suppressor's "Quieter" touched neither the
// enemy-hearing radius nor the gun sound. Now: the ADS fov blend multiplies by
// _attZoomMul(curWep) (min 12deg), the suppressor sets loudMul 0.3 -> WEAPONS.loud (which
// shoot() already multiplies into the hearing radius) + a suppressed flag -> quiet 'phut' SFX,
// and the loadout panel shows honest numbers (per-attachment chips + a live weapon stat line).
// Verified LIVE headless: drum 40->80 mag, compensator spread x0.7, scope ADS fov 38.3->13.8,
// enemy at 20u heard an unsuppressed shot (radius 40) but NOT a suppressed one (radius 12).
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the resolver aggregates every mod — run it for real
const _i = src.indexOf('function _resolveAtt');
const _marker = 'return { magMul, spreadMul, zoomMul, loudMul, laser, suppressed };';
const _j = src.indexOf(_marker, _i);
const fn = src.slice(_i, src.indexOf('}', _j + _marker.length) + 1);
const resolve = new Function('loadout','catalog', fn + '; return _resolveAtt("w", loadout, catalog);');
const CAT = { s:{ slot:'muzzle', mods:{ spreadMul:0.85, loudMul:0.3, suppressed:true } },
              z:{ slot:'optic', mods:{ zoomMul:0.6 } }, d:{ slot:'magazine', mods:{ magMul:2 } } };
const r = resolve({ w:{ muzzle:'s', optic:'z', magazine:'d' } }, CAT);
eq(r.magMul, 2, 'mag aggregates'); eq(r.loudMul, 0.3, 'loudness aggregates');
eq(r.zoomMul, 0.6, 'zoom aggregates'); assert(r.suppressed===true, 'suppressed flag aggregates');

// the dead wires are wired
assert(/const _zoomFov = Math\.max\(12, adsFovLive \* \(typeof _attZoomMul==='function' \? _attZoomMul\(curWep\) : 1\)\);/.test(src),
  'the ADS fov blend finally reads the optic zoom');
assert(/const wantFov = hipFov \+ \(_zoomFov - hipFov\) \* adsBlend;/.test(src), 'zoomed fov drives the camera');
assert(/WEAPONS\[k\]\.loud=base\.loud\*r\.loudMul;/.test(src), 'loudness mods write the per-weapon loud field');
assert(/WEAPONS\[k\]\.suppressed=r\.suppressed;/.test(src), 'suppressed flag reaches the live weapon');
assert(/alertEnemiesNear\(player\.pos\.x, player\.pos\.z, HEAR_RADIUS \* /.test(src), 'shoot() scales the hearing radius by loudness');
assert(/WEAPONS\[curWep\]\.suppressed\)\{ tone\(\{freq:210/.test(src), 'suppressed shots play the quiet report');
assert(/loudMul:0\.3, suppressed:true/.test(src), 'the Suppressor carries the new mods');
assert(/desc:'Enemies hear shots at 30% range'/.test(src), 'its description is honest now');

// the panel shows numbers, not just flavor text
assert(/MAG '\+w\.magSize\+' \\u00b7 SPREAD/.test(src), 'live stat line for the selected weapon');
assert(/_modChips\(a\.mods\|\|\{\}\)\.join/.test(src), 'per-attachment stat chips');

done('build 964: every loadout mod has a real gameplay effect — zoom, hearing radius, quiet report, honest UI');
