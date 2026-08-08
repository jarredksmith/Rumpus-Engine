import { withGame } from './driver.mjs';
const say = (k, v) => console.log('  ' + String(k).padEnd(26) + JSON.stringify(v));
await withGame(async (P) => {
  const r = await P(`(async function(){
    paused = true; window.__p = null;
    spawnProp('http://127.0.0.1:8899/arch.glb', [40, 0, 40, 0,0,0, 8,8,8], (o)=>{ window.__p = o; });
    for(let i=0;i<400 && (!window.__p || _glbPending>0);i++) await new Promise(r=>setTimeout(r,50));
    if(!__p) return { FAILED:'no model' };
    __p.updateMatrixWorld(true);
    let m = null; __p.traverse(x=>{ if(x.isMesh && !m) m = x; });
    const probe = ()=>{ const rc = new THREE.Raycaster();
      rc.set(new THREE.Vector3(40, 3, 20), new THREE.Vector3(0,0,1)); rc.far = 200;
      const h = rc.intersectObject(__p, true);
      return h.length ? [+h[0].point.x.toFixed(2), +h[0].point.y.toFixed(2), +h[0].point.z.toFixed(2)] : null; };
    const bvh = m.userData.__bvh;
    const before = probe();
    /* what a gizmo drag triggers */
    refreshPropCollider(__p);
    const afterRefresh = probe();
    /* and what a full BVH rebuild gives */
    delete m.userData.__bvh; delete m.raycast;
    if(typeof _installRaycastBVH==='function') _installRaycastBVH(m);
    const afterRebuild = probe();
    return { ok:true,
      bvhVerts: bvh ? bvh.posA.length/3 : null,
      geoVerts: m.geometry.attributes.position.count,
      geoIsLodHi: m.userData._lodHi ? (m.geometry === m.userData._lodHi) : 'no level',
      meshScale: [m.getWorldScale(new THREE.Vector3()).x],
      before, afterRefresh, afterRebuild };
  })()`);
  for (const k of Object.keys(r)) say(k, r[k]);
}, { settleMs: 5000 });
