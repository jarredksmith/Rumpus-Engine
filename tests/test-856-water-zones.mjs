// (build 856) WATER ZONES — lakes, ponds, puddles & streams as a sixth zone type:
//  - one transparent disc per zone with an animated ShaderMaterial (procedural ripple normals, fresnel
//    toward a sky tone, specular glint from the REAL sun direction) — no reflection/refraction render
//    targets, so it's one draw call per surface and phone-friendly;
//  - deep water = swim (buoyancy, Space up / C dive, drag brakes plunges so deep water is a safe landing),
//    shallow = wade (slowed), Flow = a current that pushes swimmers (streams);
//  - the swim hook runs right after gravity so BOTH the Rapier KCC and the classic mover consume it;
//  - full zone plumbing: editor panel + picker + quick-add, serialize/restore (both net + local paths),
//    wipe, underwater tint overlay.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the swim/wade/flow step runs EXECUTABLY against a stub player ----
const stepSrc = extractFunction('_waterPlayerStep');
const atSrc = extractFunction('_waterAt');
const mkCtx = (zones, pos, vel, ks)=>({
  waterZones: zones, player: { pos, vel, onGround: true },
  keys: ks||{}, BINDS: { jump:'Space', slide:'KeyC' }, GRAV: 30, EYE: 1.7, RAD: Math.PI/180,
  drivingCar: false, mountedTurret: null, _waterSwimming: false, Math,
});
const runStep = (zones, pos, vel, ks, dt=0.016)=>{
  const ctx = mkCtx(zones, pos, vel, ks);
  const fn = new Function(...Object.keys(ctx), atSrc + '\n' + stepSrc + '\n_waterPlayerStep(' + dt + ');\nreturn { vel: player.vel, onGround: player.onGround };');
  return fn(...Object.values(ctx));
};
const LAKE = [{ x:0, z:0, r:10, y:0, h:3, flowDir:0, flowSpd:0 }];
// swimming deep: gravity cancelled + drag; a -30 plunge is braked, never accelerated
{ const r = runStep(LAKE, {x:0,y:0.5+1.7,z:0}, {x:0,y:-30,z:0});   // feet at 0.5, surface at 3 -> submerged 2.5
  assert(r.vel.y > -30 && r.vel.y < -20, 'deep water brakes a plunge (drag), got '+r.vel.y.toFixed(2));
  eq(r.onGround, false, 'swimming is never grounded'); }
// treading near the surface stays put; Space strokes up; C dives. The hook runs AFTER the game applies
// gravity, so a realistic incoming vel.y is -GRAV*dt (-0.48), which the hook's buoyancy undoes first.
{ const r = runStep(LAKE, {x:0,y:1.4+1.7,z:0}, {x:0,y:-0.48,z:0}, { Space:true });
  assert(r.vel.y > 0.2, 'Space swims up'); }
{ const r = runStep(LAKE, {x:0,y:1.4+1.7,z:0}, {x:0,y:-0.48,z:0}, { KeyC:true });
  assert(r.vel.y < -0.1, 'C dives'); }
// wading (shallow) slows horizontal input but does not float you
{ const r = runStep(LAKE, {x:0,y:2.2+1.7,z:0}, {x:10,y:-0.48,z:0});   // feet at 2.2 -> submerged 0.8 = wade
  near(r.vel.x, 6.2, 0.05, 'wading slows the run');
  near(r.vel.y, -0.48, 0.001, '...but gravity still applies (no buoyancy in the shallows)'); }
// flow pushes a swimmer along the current
{ const STREAM = [{ x:0, z:0, r:10, y:0, h:3, flowDir:90, flowSpd:6 }];
  const r = runStep(STREAM, {x:0,y:0.5+1.7,z:0}, {x:0,y:0,z:0});
  assert(r.vel.x > 5.5 && Math.abs(r.vel.z) < 0.5, 'flowDir 90 pushes along +X'); }
// dry land: untouched
{ const r = runStep(LAKE, {x:50,y:1.7,z:50}, {x:7,y:-3,z:0});
  near(r.vel.x, 7, 0.001, 'outside the zone nothing changes'); }

// ---- the surface shader is the cheap kind ----
assert(/new THREE\.ShaderMaterial\(/.test(src.match(/function _waterSurfaceMat[\s\S]{0,1200}/)[0]), 'surface is a ShaderMaterial');
assert(!/WebGLRenderTarget/.test(src.match(/function buildWaterZoneGroup[\s\S]{0,1600}/)[0]), 'no render targets anywhere near the water build (no reflections/refraction cost)');
assert(/uSunDir/.test(src) && /moon\.position/.test(src.match(/function updateWaterZones[\s\S]{0,2400}/)[0]), 'the glint tracks the real sun (build 855 rotation included)');
assert(/reflect\(-uSunDir, n\)/.test(src), 'specular glint in the fragment shader');

// ---- zone plumbing ----
assert(/\['waterzones','\\ud83d\\udca7','Water'\]|\['waterzones','💧','Water'\]/.test(src), 'Water appears in the zone picker');
assert(/waterzones:'edWaterZones'/.test(src), '...with its panel host');
assert(/id="edWaterZones" class="zoneHost" data-zone="waterzones"/.test(src), '...and the host div in the Zones section');
assert(/waterZones: waterZones\.map\(z=>\(\{ x:\+z\.x, z:\+z\.z, r:\+z\.r, y:\(\+z\.y\|\|0\), h:\(z\.h!=null\?\+z\.h:2\), color:/.test(src), 'water zones serialize with the level');
eq((src.match(/waterZones = Array\.isArray\(level\.waterZones\) \? level\.waterZones\.map\(_migrateWaterZone\) : \[\];/g)||[]).length, 2, '...and restore on BOTH the local and network load paths');
assert(/waterZones\.length=0; selWaterZone=-1;/.test(src), 'wipe clears them');
assert(/if\(typeof _waterPlayerStep==='function'\) _waterPlayerStep\(dt\);/.test(src), 'the swim hook sits after gravity, before both movers');
assert(/Water zone'\]/.test(src), 'quick-add (+) offers a Water zone');
assert(/waterzones: 'Lakes, ponds, puddles, streams & waterfalls/.test(src), 'the picker subtitle');   // build 858 added falls to the same tool

done('build 856: water zones — executable swim/wade/flow physics, one-draw-call shader surface, full zone plumbing');
