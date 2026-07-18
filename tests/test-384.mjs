import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();
// build 508: editable lights gain three.js types — Spotlight, Directional, Hemisphere — alongside Point.
// buildLight branches on opts.type; _aimLight points spot/dir from a [yaw,pitch] heading; _lightOpts
// serializes any live light back to authoring opts (used by save / duplicate / type-swap / code export);
// changeLightType swaps a placed light in place; the editor exposes a Type dropdown + per-type sliders.

// ---- _aimLight: target offset along the heading + recorded dir ----
const aim = new Function('THREE','_UP_Y', 'return ('+extractFunction('_aimLight')+')')(THREE, new THREE.Vector3(0,1,0));
{
  const g = new THREE.Group(); g.userData.light = new THREE.SpotLight(0xffffff,1,30,0.6,0.4);
  g.add(g.userData.light.target = new THREE.Object3D()); g.userData.dir=null; g.userData.dirStick=null;
  const yaw=0.5, pitch=-1.0, cp=Math.cos(pitch);
  aim(g, yaw, pitch);
  near(g.userData.light.target.position.x, Math.sin(yaw)*cp*5, 1e-6, 'aim resolves target X');
  near(g.userData.light.target.position.y, Math.sin(pitch)*5,   1e-6, 'aim resolves target Y (pitch down)');
  near(g.userData.light.target.position.z, Math.cos(yaw)*cp*5,  1e-6, 'aim resolves target Z');
  assert(g.userData.dir[0]===yaw && g.userData.dir[1]===pitch, 'aim records the heading');
}

// ---- _lightOpts round-trips each type ----
const lopts = new Function('THREE','scene','return ('+extractFunction('_lightOpts')+')')(THREE, null);   // build 997: world-pos serialize needs THREE; scene only gates the att branch
{ const g=new THREE.Group(); g.position.set(1,2,3);
  g.userData.light=new THREE.SpotLight(0x804020,5,30,0.6,0.4); g.userData.ltype='spot'; g.userData.dir=[0.5,-1.0];
  const o=lopts(g);
  assert(o.type==='spot' && o.color===0x804020, 'spot type + color');
  near(o.distance,30,1e-6,'spot range'); near(o.angle,0.6,1e-6,'spot angle'); near(o.penumbra,0.4,1e-6,'spot penumbra');
  assert(o.dir[0]===0.5 && o.dir[1]===-1.0, 'spot carries aim'); assert(o.t[0]===1&&o.t[1]===2&&o.t[2]===3,'spot carries position'); }
{ const g=new THREE.Group(); g.userData.light=new THREE.HemisphereLight(0x102030,0x223344,0.9); g.userData.ltype='hemi';
  const o=lopts(g);
  assert(o.type==='hemi' && o.color===0x102030 && o.ground===0x223344, 'hemi sky + ground colors');
  assert(o.distance==null && o.dir==null, 'hemi has no range/aim'); }
{ const g=new THREE.Group(); g.userData.light=new THREE.PointLight(0x38f5b5,8,22); g.userData.ltype='point';
  const o=lopts(g); assert(o.type==='point','point type'); near(o.distance,22,1e-6,'point range'); assert(o.dir==null,'point has no aim'); }

// ---- buildLight branches per type ----
assert(/new THREE\.SpotLight\(col, inten/.test(src), 'buildLight creates a SpotLight');
assert(/new THREE\.DirectionalLight\(col, inten\)/.test(src), 'buildLight creates a DirectionalLight');
assert(/new THREE\.HemisphereLight\(col, \(opts\.ground/.test(src), 'buildLight creates a HemisphereLight');
assert(/new THREE\.PointLight\(col, inten/.test(src), 'buildLight still creates a PointLight');

// ---- per-type editor fields ----
assert(/get fields\(\)\{[\s\S]*?if\(t==='spot'\) return \[\.\.\.pos, it, di, an, pe, yw, pi, \.\.\.rgb\];/.test(src), 'spot exposes angle/softness/aim sliders');
assert(/if\(t==='hemi'\) return \[\.\.\.pos, it, \.\.\.rgb, \.\.\.grnd\];/.test(src), 'hemi exposes ground-color sliders');
assert(/if\(t==='dir'\)  return \[\.\.\.pos, it, yw, pi, \.\.\.rgb\];/.test(src), 'directional exposes aim sliders, no range');

// ---- type swap, dropdown, persistence ----
assert(/function changeLightType\(idx, type\)\{[\s\S]*?removeLight\(idx\);[\s\S]*?buildLight\(o\)[\s\S]*?splice\(idx,0,ng\)/.test(src), 'changeLightType rebuilds in place, preserving order');
assert(/sel\.onchange = \(\)=>\{ changeLightType\(tgt\.idx, sel\.value\); \};/.test(src), 'the lights panel exposes a Type dropdown');
assert(/lights:  lightModels\.map\(g=>_lightOpts\(g\)\)/.test(src), 'the level save persists every light type');

done();
