// (build 1021) BULLET DECALS — shots leave a hole on whatever they hit, for EVERY shooter
// (local pellets, joiners' + bots' relayed shots via the build-1020 impact ray, turret fire).
// Creator-tunable under Effects > Bullet holes (on/off, size, lifetime, custom uploaded decal
// image), serialized with the level. Optimized: one shared texture, pooled plane meshes, a
// hard cap with oldest-recycled, and a tail fade — a firefight never accumulates geometry.
import * as THREE from 'three';
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: sanitizer ----
const sanSrc = extractFunction('_sanitizeDecal', src) + '\nreturn _sanitizeDecal(o);';
const san = (o) => new Function('o', '_fxClamp', sanSrc)(o, (v,lo,hi,d)=>{ v=+v; return isNaN(v)?d:Math.min(hi,Math.max(lo,v)); });
eq(san(null).on, true, 'defaults on');
eq(san({ url:'https://h/x.png', size:9, life:0.01 }).size, 3, 'size clamped');
eq(san({ life:0.01 }).life, 0.3, 'lifetime clamped');
eq(san({ url:12 }).url, '', 'non-string url dropped');
eq(san({ on:false }).on, false, 'can be authored off');

// ---- executable: the decal engine itself (real three.js math, stubbed canvas/scene) ----
const mod = src.match(/\/\/ ---------- Bullet decals \(build 1021\) ----------[\s\S]*?function updateDecals\(dt\)\{[\s\S]*?\n\}\n/)[0];
const grad = { addColorStop(){} };
const ctx2d = { createRadialGradient:()=>grad, fillRect(){}, beginPath(){}, arc(){}, fill(){}, set fillStyle(v){}, set globalCompositeOperation(v){} };
const doc = { createElement:()=>({ width:0, height:0, getContext:()=>ctx2d }) };
const removed = [];
const scn = { add(){}, remove(m){ removed.push(m); } };
const cfg = { on:true, url:'', size:1, life:1 };
const env = new Function('THREE', 'decalCfg', 'scene', 'document', mod +
  '\nreturn { decals, _decalPool, DECAL_MAX, DECAL_LIFE, spawnBulletDecal, updateDecals, _getDecalTex };')(THREE, cfg, scn, doc);

// a shot into a wall facing +z: the decal sits a hair OFF the wall, facing back along the normal
const wallNormal = new THREE.Vector3(0,0,1);
const obj = { matrixWorld: new THREE.Matrix4() };
env.spawnBulletDecal(new THREE.Vector3(2, 1.4, -5), wallNormal, obj);
eq(env.decals.length, 1, 'a decal spawned');
const m0 = env.decals[0].mesh;
near(m0.position.z, -5 + 0.012, 1e-6, 'lifted a hair off the surface (no z-fight)');
const facing = new THREE.Vector3(0,0,1).applyQuaternion(m0.quaternion);
near(facing.dot(wallNormal), 1, 1e-6, 'the plane faces along the surface normal (random spin only twists AROUND it)');
eq(env.decals[0].max, env.DECAL_LIFE, 'lifetime = base x authored multiplier');

// the hard cap: oldest recycled to the pool, never unbounded growth
for(let i=0;i<env.DECAL_MAX+7;i++) env.spawnBulletDecal(new THREE.Vector3(i*0.3, 1, -5), wallNormal, obj);
eq(env.decals.length, env.DECAL_MAX, 'capped at DECAL_MAX');
assert(removed.length >= 8, 'evicted holes leave the scene');
assert(env.decals.some(d => removed.includes(d.mesh)), 'evicted meshes are RECYCLED into later holes (the pool works — no fresh allocations at the cap)');

// lifetime: fresh decals untouched, the tail fades, expiry recycles
const d0 = env.decals[0];
d0.life = d0.max * 0.9; env.updateDecals(0.001);
eq(d0.mesh.material.opacity, 0.92, 'a fresh hole never churns its material');
d0.life = d0.max * 0.1; env.updateDecals(0.001);
assert(d0.mesh.material.opacity < 0.4, 'the tail fades out');
const poolBefore = env._decalPool.length, countBefore = env.decals.length;
d0.life = 0.0005; env.updateDecals(0.001);
eq(env.decals.length, countBefore-1, 'an expired hole is gone');
eq(env._decalPool.length, poolBefore+1, '...and its mesh recycles');

// authored OFF -> no spawns
cfg.on = false;
const n0 = env.decals.length;
env.spawnBulletDecal(new THREE.Vector3(0,1,0), wallNormal, obj);
eq(env.decals.length, n0, 'decals can be authored off per level');
cfg.on = true;

// one shared texture (perf: never one texture per hole)
assert(env._getDecalTex() === env._getDecalTex(), 'the decal texture is created once and shared');

// ---- the hooks: every shooter's world-hits stamp a hole ----
eq((src.match(/spawnBulletDecal\(hit\.point, hit\.face&&hit\.face\.normal, hit\.object\);/g)||[]).length >= 5, true,
  'local pellets (duel + co-op + solo) and turret fire stamp on world hits');
assert(/spawnBulletDecal\(end, _h\[0\]\.face&&_h\[0\]\.face\.normal, _h\[0\]\.object\);/.test(src),
  "joiners' and bots' relayed shots stamp too (the build-1020 impact ray)");
assert(/updateDecals\(dt\);/.test(src), 'the fade/expiry tick runs in the main loop');
assert(/decals\.slice\(\)\.forEach\(d=>\{ scene\.remove\(d\.mesh\); _decalPool\.push\(d\.mesh\); \}\); decals\.length=0;/.test(src),
  'level-load hygiene: holes from the last match never bleed into the next');

// ---- rides the level + editor panel ----
assert(/decal: Object\.assign\(\{\}, decalCfg\),/.test(src), 'serialized with the level');
eq((src.match(/decalCfg = _sanitizeDecal\(level\.decal\);/g)||[]).length, 2, 'restored (sanitized) at both level-load sites');
assert(/\['decalfx','\\ud83d\\udd73\\ufe0f','Bullet holes'\]/.test(src), 'a third entry in the grouped Effects picker');
assert(/decalfx:'edDecalFx'/.test(src) && /<div id="edDecalFx" class="wepfxHost" data-wepfx="decalfx"><\/div>/.test(src), 'panel host wired');
assert(/renderUploadRow\(up, 'texture', \(url\)=>\{ decalCfg\.url=url\|\|''; _decalTexReset\(\); renderDecalFxPanel\(\); \}\);/.test(src),
  'creators upload their own decal image through the existing texture pipeline');
assert(/cb\.textContent='Clear image';/.test(src), 'a custom image can be cleared back to the built-in hole');
assert(/test\.textContent='Test hole';/.test(src), 'a Test button stamps a sample where you look');

done('build 1021: bullet decals — pooled, capped, fading holes for every shooter, with creator-uploaded images');
