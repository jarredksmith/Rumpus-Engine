// Does a geometric level of detail buy real triangles, and does it cost anything up close?
//
// Asked from use: "what is LOD? do we do that?" Four kinds were already here — animation LOD, shadow LOD,
// screen-size culling, the whole-frame quality ladder — and the fifth, the one a heavy import actually
// hits, was not: a 497,912-triangle model submitted all of them whether it filled the screen or covered
// forty pixels.
//
// The measurand is renderer.info.render.triangles, an integer, read after a real render. The instrument's
// three known traps are all handled here and every one of them cost a run in build 1430: the stock level
// arrives ALREADY DEPLOYED, the shadow map's dirty flag is a COUNTER so identical scenes read different
// draw calls, and build 1261's shadow refit fires on the FIRST visit to a camera pose but not the second.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  const setup = await P(`(function(){
    paused = true;
    /* A heavy mesh, built rather than downloaded: a sphere at a high segment count is a few hundred
       thousand triangles and decimates like any imported model. Placed 44 m out — inside the arena and
       clear of the stock level (builds 1323 / 1405). */
    const g = new THREE.SphereGeometry(3, 220, 140);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color:0x888888 }));
    const root = new THREE.Group(); root.add(mesh); root.position.set(44, 3, 44);
    root.userData.src = 'probe://heavy.glb';   // isModelSrc: primitives are excluded from levelling
    scene.add(root); propModels.push(root);
    root.updateMatrixWorld(true);
    _lodRemeasure(root);
    window.__heavy = mesh;
    return { tris: g.index.count/3, r: +root.userData._lodR.toFixed(2) };
  })()`);
  say('heavy mesh', setup);

  const built = await P(`(async function(){
    _lodGeoReady = false; _lodGeoN = 0;
    buildGeoLOD();
    for(let i=0;i<200 && !__heavy.userData._lodLo;i++) await new Promise(r=>setTimeout(r,50));
    const hi = __heavy.userData._lodHi, lo = __heavy.userData._lodLo;
    if(!lo) return { FAILED:'no level built — is the simplifier reachable?' };
    let sharedAttrs = true;
    for(const k in hi.attributes) if(lo.attributes[k] !== hi.attributes[k]) sharedAttrs = false;
    return { levelled: _lodGeoN,
             hiTris: hi.index.count/3, loTris: lo.index.count/3,
             ratio: +(lo.index.count/hi.index.count).toFixed(3),
             sharedAttrs, sameBounds: Math.abs(lo.boundingSphere.radius - hi.boundingSphere.radius) < 1e-6 };
  })()`);
  say('levels built', built);
  if (built.FAILED) { console.log('\n! ' + built.FAILED); return; }

  const shot = `(function(pose){
    camera.position.set(pose.p[0], pose.p[1], pose.p[2]);
    camera.up.set(0,1,0); camera.lookAt(44, 3, 44); camera.updateMatrixWorld(true);
    _lodGeoTick();
    for(let i=0;i<20;i++) renderScene(scene, camera);   // drain build 1270's shadow-dirty COUNTER
    renderer.info.reset();
    renderScene(scene, camera);
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
             lo: !!__heavy.userData._lodOn, geoIs: (__heavy.geometry === __heavy.userData._lodLo) ? 'LO' : 'HI' };
  })`;
  // build 1261 refits the sun's shadow volume on the first visit to a pose; warm every pose before reading
  const NEAR = `({ p:[44, 3, 56] })`, FAR = `({ p:[44, 40, 220] })`;
  const at = async (pose) => { await P(shot + pose); return P(shot + pose); };

  console.log('\n--- close enough to fill the screen -------------------------------------------');
  const near = await at(NEAR); say('near', near);

  console.log('\n--- far enough to be small ----------------------------------------------------');
  const far = await at(FAR); say('far', far);

  console.log('\n--- the control: the SAME far pose with levelling neutered ---------------------');
  const off = await P(`(function(){
    __heavy.geometry = __heavy.userData._lodHi; __heavy.userData._lodOn = false;
    const saved = _lodGeoN; _lodGeoN = 0;            // the tick stands down entirely
    camera.position.set(44, 40, 220); camera.lookAt(44, 3, 44); camera.updateMatrixWorld(true);
    for(let i=0;i<20;i++) renderScene(scene, camera);
    renderer.info.reset(); renderScene(scene, camera);
    const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
                geoIs: (__heavy.geometry === __heavy.userData._lodLo) ? 'LO' : 'HI' };
    _lodGeoN = saved;
    return r;
  })()`);
  say('far, LOD off', off);

  console.log('\n--- and back: the control must return -----------------------------------------');
  const backNear = await at(NEAR); say('near again', backNear);

  console.log('\n--- what it means -------------------------------------------------------------');
  say('far triangles: off -> on', [off.tris, far.tris]);
  say('saved at range', off.tris > 0 ? (100 * (off.tris - far.tris) / off.tris).toFixed(1) + '%' : 'n/a');
  say('up close, full mesh?', near.geoIs === 'HI' && backNear.geoIs === 'HI');
  say('near returns exactly', near.tris === backNear.tris ? 'EXACTLY' : near.tris + ' -> ' + backNear.tris);

  console.log('\n--- and a distant shot still hits the FULL mesh (build 1263) -------------------');
  const ray = await P(`(function(){
    camera.position.set(44, 40, 220); camera.lookAt(44, 3, 44); camera.updateMatrixWorld(true);
    _lodGeoTick();
    const wasLo = !!__heavy.userData._lodOn;
    const rc = new THREE.Raycaster();
    const dir = new THREE.Vector3(44,3,44).sub(camera.position).normalize();
    rc.set(camera.position, dir);
    const hits = [];
    __heavy.raycast(rc, hits);
    return { drawingLo: wasLo, hit: hits.length > 0,
             geoDuring: (__heavy.geometry === __heavy.userData._lodLo) ? 'LO' : 'HI',
             restored: (__heavy.geometry === __heavy.userData._lodLo) ? 'LO' : 'HI' };
  })()`);
  say('at range', ray);
}, { settleMs: 5000 });

console.log('');
