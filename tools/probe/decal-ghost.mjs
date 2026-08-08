// Reported with a screenshot and the model: bullet decals land in mid-air, far from the prop, on an
// invisible barrier. A decal is stamped at the shot ray's hit point, so a decal in the wrong place means
// the RAY hit something in the wrong place.
//
// The model is 4,058 triangles — just over build 1431's 4,000-triangle threshold — so 1431 gives it a
// level of detail and wraps its raycast. That makes my own build the first suspect, and the level is the
// variable this A/Bs.
import { withGame } from './driver.mjs';
const say = (k, v) => console.log('  ' + String(k).padEnd(24) + JSON.stringify(v));

await withGame(async (P) => {
  const load = await P(`(async function(){
    paused = true;
    window.__p = null;
    /* scaled up, as a creator would — the model imports about a metre across */
    spawnProp('http://127.0.0.1:8899/arch.glb', [40, 0, 40, 0,0,0, 8,8,8], (o)=>{ window.__p = o; });
    for(let i=0;i<400 && (!window.__p || _glbPending>0);i++) await new Promise(r=>setTimeout(r,50));
    if(!__p) return { FAILED:'model never arrived' };
    __p.updateMatrixWorld(true);
    window.__m = null; __p.traverse(m=>{ if(m.isMesh && !__m) __m = m; });
    const bb = new THREE.Box3().setFromObject(__p);
    return { ok:true,
      drawnBox:[+bb.min.x.toFixed(2),+bb.min.y.toFixed(2),+bb.min.z.toFixed(2),
                +bb.max.x.toFixed(2),+bb.max.y.toFixed(2),+bb.max.z.toFixed(2)],
      hasBVH: !!(__m.userData && (__m.userData._bvh || __m.userData.bvh)),
      raycastOwn: Object.prototype.hasOwnProperty.call(__m, 'raycast'),
      tris: __m.geometry.index ? __m.geometry.index.count/3 : __m.geometry.attributes.position.count/3 };
  })()`);
  say('model', load);
  if (!load.ok) return;

  const sweep = `(function(){
    const out = [];
    /* rays that PASS THE PROP on either side and above it — where the reported decals are */
    for(const off of [-30, -14, -6, 0, 6, 14]){
      const o = new THREE.Vector3(40 + off, 3.0, 20), d = new THREE.Vector3(0, 0, 1);
      const rc = new THREE.Raycaster(); rc.set(o, d); rc.far = 200;
      const tg = []; for(const c of colliders) tg.push(c); for(const c of dynamicProps) tg.push(c);
      const hits = rc.intersectObjects(tg.filter(x=>x&&x.isObject3D), true);
      const solid = (typeof _firstSolidHit==='function') ? _firstSolidHit(hits) : hits[0];
      let root = solid ? solid.object : null;
      while(root && root.parent && root.parent !== scene) root = root.parent;
      out.push({ off, hit: solid ? [+solid.point.x.toFixed(2),+solid.point.y.toFixed(2),+solid.point.z.toFixed(2)] : null,
                 onArch: root === __p });
    }
    return out;
  })`;

  console.log('\n--- with build 1431 levelling ACTIVE -------------------------------------------');
  const withLod = await P(`(async function(){
    _lodGeoReady = false; _lodGeoN = 0; buildGeoLOD();
    for(let i=0;i<200 && !__m.userData._lodLo;i++) await new Promise(r=>setTimeout(r,50));
    return { levelled: !!__m.userData._lodLo, n: _lodGeoN };
  })()`);
  say('levelled', withLod);
  const a = await P(sweep + `()`);
  for (const r of a) console.log('  x' + String(r.off).padStart(4) + '  -> ' + JSON.stringify(r.hit) +
    (r.onArch ? '   <- ON THE ARCH' : ''));

  console.log('\n--- the control: levelling neutered, same rays ---------------------------------');
  const b = await P(`(function(){
    __p.traverse(m=>{ if(m.userData && m.userData._lodHi){ m.geometry = m.userData._lodHi; m.userData._lodOn = false; } });
    const saved = _lodGeoN; _lodGeoN = 0;
    const r = (` + sweep + `)();
    _lodGeoN = saved;
    return r;
  })()`);
  for (const r of b) console.log('  x' + String(r.off).padStart(4) + '  -> ' + JSON.stringify(r.hit) +
    (r.onArch ? '   <- ON THE ARCH' : ''));

  const same = JSON.stringify(a.map(r=>r.hit)) === JSON.stringify(b.map(r=>r.hit));
  console.log('\n  identical with and without levelling: ' + same);

  console.log('\n--- the decisive A/B: build 1097 BVH raycast vs three own -----------------------');
  const c = await P(`(function(){
    /* drop every own raycast in the prop, so three's real Mesh.raycast tests real triangles */
    const restored = [];
    __p.traverse(m=>{ if(m.isMesh && Object.prototype.hasOwnProperty.call(m, 'raycast')){
      restored.push(m); delete m.raycast; } });
    const r = (` + sweep + `)();
    return { restored: restored.length, hits: r };
  })()`);
  say('own raycasts removed', c.restored);
  for (const r of c.hits) console.log('  x' + String(r.off).padStart(4) + '  -> ' + JSON.stringify(r.hit) +
    (r.onArch ? '   <- ON THE ARCH' : ''));
}, { settleMs: 5000 });
console.log('');
