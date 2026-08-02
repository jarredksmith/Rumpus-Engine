// build 1158: two things reported as "still broken" after 1152 and 1154. Both were real, and both were a
// correct fix applied to the wrong half of the problem.
//
// 1. THE SPRITE'S DROP SHADOW. Build 1152 established the rule — nothing that fails to write depth belongs in
//    a depth-derived G-buffer — and applied it to `scn`. But the muzzle flash a player sees on almost every
//    trigger pull is `playFlipbook('muzzle', ..., vmMuzzle)`: a Sprite inside the VIEWMODEL scene, which
//    build 1140 renders into that same G-buffer through its own `renderer.render(vmScene, vmCam)`. The world
//    explosions were fixed; the commonest sprite in the game was not. The sweep is now a function both
//    callers use.
//
// 2. ENEMIES ON RAMPS. Build 1154 fixed the movement RADIUS and it was a real fault, but the vertical rule
//    was the one stopping them. Builds 1092/1094 gated the ramp exemption on `b.max.y - feetY < STEP + 0.5`
//    — a statement about the BOUNDING BOX, not about the surface. A ramp primitive is one mesh, so it gets
//    one collider box spanning floor to summit: at the foot of a 2.4 m ramp that difference is 2.4, the gate
//    fails, the raycast never runs, and the enemy is pushed away from the ramp it is trying to climb.
//    Measured by replaying the real pass over a real wedge (see below): it climbed 0.00 m, forever.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

const K = (k) => { const m = src.match(new RegExp('const ' + k + ' = ([\\d.]+);')); assert(m, k + ' is declared'); return +m[1]; };
const STEP = K('STEP'), RAMP_RISE = K('RAMP_RISE'), RMIN = K('RAMP_SLOPE_MIN'), RMAX = K('RAMP_SLOPE_MAX');
const CAP_R = K('ENEMY_CAP_R');

// ================================================================ 1. the viewmodel G-buffer
{
  const fn = extractFunction('_aoHideNoDepth') + extractFunction('_aoNoDepthMat');
  assert(/q\.depthWrite===false \|\| q\.transparent===true/.test(fn),
    'the rule is a property of the MATERIAL, not a list of names (build 1152)');
  assert(/\(q\.alphaTest\|\|0\) > 0/.test(fn),
    '...and build 1285 widened it to alpha-tested cutouts, which are opaque by both older tests');
  assert(/if\(!o\.visible\) return;/.test(fn),
    'already-invisible objects are not collected, or the restore would switch them on (editor gizmos in play)');
  assert(/for\(let i=0;i<m\.length;i\+\+\)/.test(fn), 'one offending slot in a multi-material array is enough — the object is drawn or it is not (build 1168: allocation-free walk, same predicate)');
}
{
  const post = extractFunction('_renderPostFX');
  const calls = (post.match(/_aoHideNoDepth\(/g) || []).length;
  eq(calls, 4, 'EVERY render into a G-buffer sweeps first: world + viewmodel for AO (1152/1158), world + viewmodel for velocity (1246)');
  assert(/_aoHideNoDepth\(scn, _aoHid\);/.test(post), '...the world scene');
  assert(/_aoHideNoDepth\(vmScene, _vmHid\);/.test(post), '...and the viewmodel scene, which is where the muzzle flash lives');
  assert(/_aoHideNoDepth\(scn, _vHid\);/.test(post) && /_aoHideNoDepth\(vmScene, _vmH\);/.test(post),
    'the 1246 velocity pass obeys the same rule for both of its renders');
  // and each restores what it hid
  assert(/for\(const o of _aoHid\) o\.visible=true;/.test(post), 'the world sweep is restored');
  assert(/for\(const o of _vmHid\) o\.visible=true;/.test(post), 'and so is the viewmodel sweep');
  // the restore must happen AFTER the render that needed it
  assert(post.indexOf('_aoHideNoDepth(vmScene, _vmHid);') < post.indexOf('renderer.render(vmScene, vmCam);'),
    'the viewmodel sweep runs before its render');
  assert(post.indexOf('renderer.render(vmScene, vmCam);') < post.indexOf('for(const o of _vmHid) o.visible=true;'),
    '...and is restored after it');
}
{
  // the sprite really is transparent + depthWrite:false, so the predicate really does catch it
  const fb = extractFunction('playFlipbook');
  assert(/new THREE\.SpriteMaterial\(\{ map:tex, transparent:true, depthWrite:false/.test(fb),
    'a flipbook sprite is transparent and writes no depth — exactly what the predicate tests for');
  assert(/\(parent\|\|scene\)\.add\(sp\);/.test(fb),
    'and it is added to its PARENT when given one, which for the first-person flash is inside vmScene');
  assert(/playFlipbook\('muzzle', new THREE\.Vector3\(0,0,-0\.05\), 0\.7, vmMuzzle\)/.test(src),
    'the first-person muzzle flash really does parent into the viewmodel');
}
{
  // executable: the predicate, over the material shapes that actually occur
  const hidden = [];
  const run = new Function('root', 'out', extractFunction('_aoNoDepthMat') + '\n' + extractFunction('_aoHideNoDepth') + '\nreturn _aoHideNoDepth(root, out);');
  const mk = (name, material, visible) => ({ name, material, visible: visible !== false, traverse(f){ f(this); } });
  const kids = [
    mk('flash',   { transparent: true, depthWrite: false }),
    mk('smoke',   { transparent: true, depthWrite: true }),
    mk('decal',   { transparent: false, depthWrite: false }),
    mk('gun',     { transparent: false, depthWrite: true }),
    mk('multi',   [{ transparent: false, depthWrite: true }, { transparent: true, depthWrite: false }]),
    mk('gizmo',   { transparent: true, depthWrite: false }, false),
    mk('nomat',   null),
  ];
  const root = { visible: true, traverse(f){ f(this); for (const k of kids) f(k); } };
  run(root, hidden);
  const names = hidden.map(o => o.name).sort().join(',');
  eq(names, 'decal,flash,multi,smoke', 'every non-depth-writing object is swept, including one bad slot of a material array');
  assert(!hidden.some(o => o.name === 'gun'), 'the weapon itself still goes in — its own occlusion is build 1140\'s whole point');
  assert(!hidden.some(o => o.name === 'gizmo'), 'and an already-hidden object is not collected');
}

// ================================================================ 2. enemies and ramps
{
  const upd = src.slice(src.indexOf('// Phase 3 — obstacle resolution'));
  assert(!/if\(b\.max\.y - \(en\.mesh\.position\.y-1\.4\) < STEP \+ 0\.5/.test(upd),
    'the bounding-box gate that fenced enemies off ramps is gone');
  assert(/const es = propSurfaceAt\(c, sx, sz\);/.test(upd),
    "the enemy now asks THIS collider's own surface at the contact point — the question clearAt has always asked");
  assert(/if\(es <= feetY \+ STEP \+ 1e-4\) continue;/.test(upd), '...a low step or a ramp base is walked onto');
  assert(/if\(slope > RAMP_SLOPE_MIN && slope < RAMP_SLOPE_MAX\) continue;/.test(upd),
    '...and a genuinely sloped surface within RAMP_RISE is a ramp, not a wall');
  // the same three-way test the player uses, so an enemy fits vertically wherever the player fits
  const ca = extractFunction('clearAt');
  assert(/if\(es <= feetY \+ STEP \+ 1e-4\) continue;/.test(ca) && /if\(es <= feetY \+ RAMP_RISE\)\{/.test(ca),
    'and it is the SAME test clearAt applies to the player');
}
{
  // ---- executable: replay the real pass over real geometry with a real raycaster.
  // A source pin cannot tell you that an enemy reaches the top of a ramp; this can.
  const wedge = (w, d, h) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -w/2,0,0,  w/2,0,0,  w/2,0,d,   -w/2,0,0,  w/2,0,d,  -w/2,0,d,
      -w/2,0,0, -w/2,0,d, -w/2,h,d,    w/2,0,0,   w/2,h,d,  w/2,0,d,
      -w/2,0,0, -w/2,h,d,  w/2,h,d,   -w/2,0,0,   w/2,h,d,  w/2,0,0,
      -w/2,h,d,  w/2,h,d,  w/2,0,d,   -w/2,h,d,   w/2,0,d, -w/2,0,d,
    ], 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  };
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m); m.userData.box = b; m.userData.boxes = [b]; return m; };
  // one mesh -> ONE collider box, floor to summit. That is what refreshPropCollider produces for a primitive.
  const ramp  = place(wedge(4, 8, 2.4), 0, 0, 0);
  const wall  = place(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.5), new THREE.MeshBasicMaterial()), 20, 1.5, 0);
  const kerb  = place(new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 1), new THREE.MeshBasicMaterial()), 40, 0.2, 0);
  const ledge = place(new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 4), new THREE.MeshBasicMaterial()), 60, 0.6, 0);
  const colliders = [ramp, wall, kerb, ledge];

  const rc = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), O = new THREE.Vector3(), one = [null];
  const propSurfaceAt = (obj, x, z) => { O.set(x, 300, z); rc.set(O, DOWN); rc.far = 600; one[0] = obj;
    let t = -Infinity; for (const h of rc.intersectObjects(one, true)) if (h.point.y > t) t = h.point.y; return t; };
  const surfaceTopAt = (x, z) => { O.set(x, 300, z); rc.set(O, DOWN); rc.far = 600;
    let t = -Infinity; for (const h of rc.intersectObjects(colliders, true)) if (h.point.y > t) t = h.point.y; return t; };
  const groundHeightAt = (x, z, feetY) => {              // the engine's own, same shape
    const top = surfaceTopAt(x, z); if (top === -Infinity) return 0;
    if (top <= feetY + STEP) return Math.max(0, top);
    if (top <= feetY + RAMP_RISE) { const e = 0.4;
      const hx = surfaceTopAt(x + e, z), hz = surfaceTopAt(x, z + e);
      const slope = Math.hypot((hx > -Infinity ? hx - top : 0), (hz > -Infinity ? hz - top : 0)) / e;
      if (slope > RMIN && slope < RMAX) return top; }
    return 0;
  };
  // the obstacle pass, both predicates
  function resolve(px, pz, py, mode) {
    const feetY = py - 1.4, eFeetY = feetY + STEP, eHeadY = py + 0.55;
    let x = px, z = pz;
    for (const c of colliders) {
      const b0 = c.userData.box;
      if (x < b0.min.x - CAP_R || x > b0.max.x + CAP_R || z < b0.min.z - CAP_R || z > b0.max.z + CAP_R) continue;
      for (const b of c.userData.boxes) {
        if (b.max.y < eFeetY || b.min.y > eHeadY) continue;
        const cx = Math.max(b.min.x, Math.min(x, b.max.x)), cz = Math.max(b.min.z, Math.min(z, b.max.z));
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (!(d < CAP_R && d > 1e-4)) continue;
        if (mode === 'old') {                                        // builds 1092/1094
          if (b.max.y - feetY < STEP + 0.5) {
            O.set(cx - dx/d*0.1, 300, cz - dz/d*0.1); rc.set(O, DOWN); rc.far = 600;
            let st = -Infinity;
            for (const h of rc.intersectObjects(colliders, true)) if (h.point.y <= b.max.y + 0.05 && h.point.y > st) st = h.point.y;
            if (st > -Infinity && b.max.y - st < 0.85) continue;
          }
        } else {                                                     // build 1158
          const bcx = (b.min.x + b.max.x)*0.5, bcz = (b.min.z + b.max.z)*0.5;
          const sx = cx + Math.sign(bcx - cx)*Math.min(0.25, Math.abs(bcx - cx));
          const sz = cz + Math.sign(bcz - cz)*Math.min(0.25, Math.abs(bcz - cz));
          const es = propSurfaceAt(c, sx, sz);
          if (es > -Infinity) {
            if (es <= feetY + STEP + 1e-4) continue;
            if (es <= feetY + RAMP_RISE) { const e2 = 0.4;
              const ex = propSurfaceAt(c, sx + e2, sz), ez = propSurfaceAt(c, sx, sz + e2);
              const slope = Math.hypot((ex > -Infinity ? ex - es : 0), (ez > -Infinity ? ez - es : 0))/e2;
              if (slope > RMIN && slope < RMAX) continue; }
          }
        }
        const push = CAP_R - d; x += dx/d*push; z += dz/d*push;
      }
    }
    return [x, z];
  }
  // walk straight at each obstacle for four seconds at chase speed
  const walk = (mode, sx) => { let x = sx, z = -3, y = 1.4, best = 0;
    for (let i = 0; i < 240; i++) {
      z += 7/60;
      [x, z] = resolve(x, z, y, mode);
      y = groundHeightAt(x, z, y - 1.4) + 1.4;
      if (y - 1.4 > best) best = y - 1.4;
    }
    return { climbed: +best.toFixed(2), z: +z.toFixed(2) };
  };

  const rampOld = walk('old', 0), rampNew = walk('new', 0);
  eq(rampOld.climbed, 0, 'THE BUG: under the old gate an enemy walking at a 2.4m ramp for four seconds climbs 0.00m');
  assert(rampOld.z < 0, '...it never even reaches the ramp mouth (z ' + rampOld.z + ')');
  assert(rampNew.climbed > 2.3, 'and now it reaches the summit (' + rampNew.climbed + ' of 2.40)');
  assert(rampNew.z > 8, '...and walks off the far end (z ' + rampNew.z + ')');

  // and nothing became walk-through, which is the whole risk of relaxing an obstacle test
  for (const [name, sx] of [['a 3.0m wall', 20], ['a 1.2m flat-topped ledge', 60]]) {
    const o = walk('old', sx), n = walk('new', sx);
    eq(n.climbed, 0, name + ' still stops an enemy dead');
    eq(n.z, o.z, '...at exactly the same place as before (' + n.z + ')');
  }
  { // a kerb is stepped over by both — the low-step case is unchanged
    const o = walk('old', 40), n = walk('new', 40);
    eq(n.climbed, o.climbed, 'a 0.4m kerb is still walked over (' + n.climbed + ')');
    assert(n.z > 8, '...and the enemy carries on past it');
  }
}

done('build 1158: the muzzle flash is swept out of the AO G-buffer in the VIEWMODEL scene too (1152 fixed the world scene only), and an enemy asks the player\'s own walk-surface question at a ramp instead of a question about its bounding box — measured, a 2.4m ramp went from 0.00m climbed to the summit, with walls and flat ledges stopping enemies at byte-identical positions');
