import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 371: third-person framing (side/distance/height). The camera looks PARALLEL to forward so a
// nonzero side genuinely moves the character off-center, while shots (camera.getWorldDirection) stay
// on the true forward axis -> crosshair-accurate at any framing.

// executable: aim direction stays on forward across angles + side/height
function aimError(yaw, pitch, side, height, dist){
  const cp=Math.cos(pitch), sp=Math.sin(pitch), cy=Math.cos(yaw), sy=Math.sin(yaw);
  const fx=-cp*sy, fy=sp, fz=-cp*cy;
  const px=0, py=2, pz=0, rx=cy, rz=-sy;
  const camx=px-fx*dist+rx*side, camy=py-fy*dist+height, camz=pz-fz*dist+rz*side;
  const cam=new THREE.PerspectiveCamera(); cam.position.set(camx,camy,camz);
  cam.lookAt(camx+fx, camy+fy, camz+fz);
  const d=new THREE.Vector3(); cam.getWorldDirection(d);
  return Math.acos(Math.min(1, d.dot(new THREE.Vector3(fx,fy,fz).normalize())))*180/Math.PI;
}
for(const yaw of [0,0.7,-1.9,3.0]) for(const pitch of [-0.3,0,0.4]) for(const side of [-3,-1,1,3]) for(const h of [-2,0,2]){
  assert(aimError(yaw,pitch,side,h,4.2) < 0.001, `aim on forward at yaw=${yaw} pitch=${pitch} side=${side} h=${h}`);
}

// executable: a nonzero side actually puts the character OFF-CENTER (its camera-space lateral pos != 0)
function lateral(side){
  const yaw=0.4, pitch=0.1, dist=4.2;
  const cp=Math.cos(pitch), sp=Math.sin(pitch), cy=Math.cos(yaw), sy=Math.sin(yaw);
  const fx=-cp*sy, fy=sp, fz=-cp*cy, rx=cy, rz=-sy;
  const px=0,py=2,pz=0;
  const camx=px-fx*dist+rx*side, camz=pz-fz*dist+rz*side;
  // pivot (character) minus camera, projected onto view-right
  const vx=px-camx, vz=pz-camz;
  return vx*rx + vz*rz;
}
assert(Math.abs(lateral(0)) < 1e-9, 'centered: character on the view axis');
assert(Math.abs(lateral(2) - (-2)) < 1e-9 && Math.abs(lateral(-2) - 2) < 1e-9, 'side shift moves the character laterally off-center (true OTS)');

// wiring
const tp = extractFunction('tpCameraPushback');
{ const f=extractFunction('_tpFrame');
  assert(/const dist = tpDist \+ \(tpAimDist - tpDist\)\*b;/.test(f), 'chase distance blends hip->aim (build 373)'); }
{ const f=extractFunction('_tpFrame');   // build 1086: the framing moved here, shared with the editor preview
  assert(/_TPF\.x = pivot\.x - fx\*dist \+ rx\*side;/.test(f) && /_TPF\.y = pivot\.y - fy\*dist \+ height;/.test(f) && /_TPF\.z = pivot\.z - fz\*dist \+ rz\*side;/.test(f),
    'camera carries blended side + distance + height (build 373)'); }
assert(/let tpSide = 0;/.test(src) && /let tpDist = 4\.2;/.test(src) && /let tpHeight = 0;/.test(src), 'three persisted framing prefs');
assert(/mkSlider\('Side'/.test(src) && /mkSlider\('Distance'/.test(src) && /mkSlider\('Height'/.test(src), 'Player-tab sliders for all three');
done();
