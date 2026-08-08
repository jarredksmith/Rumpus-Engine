// The reported crash, in the running game: build 1431's geometry swap against build 1195's resumable bake.
//   Uncaught TypeError: Cannot read properties of undefined (reading 'setXYZ') at _bakeTick
// 750 times in one session, i.e. once per frame forever, on the live site.
import { withGame } from './driver.mjs';

const errs = [];
await withGame(async (P) => {
  const out = await P(`(async function(){
    paused = false; gameOn = true;
    worldCfg.baked = true;
    /* a heavy model prop, so build 1431 gives it a level of detail AND build 1195 bakes it */
    const g = new THREE.SphereGeometry(3, 120, 80);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color:0x99a0a8 }));
    const root = new THREE.Group(); root.add(mesh); root.position.set(44, 3, 44);
    root.userData.src = 'probe://heavy.glb'; root.userData.phys = false;
    scene.add(root); propModels.push(root); root.updateMatrixWorld(true);
    _lodRemeasure(root); colliders.push(root);

    _lodGeoReady = false; _lodGeoN = 0; buildGeoLOD();
    for(let i=0;i<200 && !mesh.userData._lodLo;i++) await new Promise(r=>setTimeout(r,50));
    if(!mesh.userData._lodLo) return { FAILED:'no level built' };

    /* start the bake, then swap the level UNDER IT — exactly what the frame loop does */
    /* the bake's own gates, which a probe must satisfy or it measures nothing: it returns immediately
       while any model load is outstanding, and the sandbox has permanently-failed CDN loads. */
    _glbPending = 0;
    _bakeDoneN = -1; _bakeDoneSig = null; _bakeJob = null; _bakeWant = true;
    let thrown = null, ticks = 0, swapped = 0;
    for(let f=0; f<80; f++){
      try { _bakeTick(); ticks++; } catch(e){ thrown = String(e && e.message || e); break; }
      /* alternate the drawn level every frame, which is the worst case the tick can face */
      const u = mesh.userData;
      if(u._lodHi && u._lodLo){ mesh.geometry = (f % 2) ? u._lodLo : u._lodHi; u._lodOn = !!(f % 2); swapped++; }
      await new Promise(r=>setTimeout(r,0));
    }
    const hi = mesh.userData._lodHi, lo = mesh.userData._lodLo;
    return { ok:!thrown, thrown, ticks, swapped,
             bakeSawMeshes: (typeof _bakeCollect==='function') ? _bakeCollect().length : null,
             jobLeft: _bakeJob ? (_bakeJob.meshes.length - _bakeJob.mi) : 'finished',
             hiHasColor: !!(hi && hi.attributes.color),
             loHasColor: !!(lo && lo.attributes && lo.attributes.color),
             loSharesBaked: !!(hi && lo && lo.attributes && lo.attributes.color === hi.attributes.color),
             drawing: mesh.geometry ? 'a geometry' : 'NULL' };
  })()`);
  for (const k of Object.keys(out)) console.log('  ' + k.padEnd(18) + JSON.stringify(out[k]));
}, { settleMs: 5000, console: false });
console.log(errs.length ? '\n  page errors: ' + errs.join(' | ') : '');
