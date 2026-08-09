// Do the LOD rungs reach the batched majority of a dense level?
//
// Build 1430 gave every batch real world bounds so a frustum could reject it. Nothing gave it a RUNG:
// `im.castShadow = true` unconditionally, and neither `_lodTick` nor `_lodGeoTick` knows a batch exists.
// Worse, both of them WALK the batched-out props — which are still in `propModels` while being removed
// from the scene — so they spend budget slots deciding the visibility of objects nobody renders, and the
// write flips `_lodDirty`, which asks for a full re-render of both shadow cascades for no visible change.
//
// Measured as integers (draw calls, triangles, casters), because wall-clock under SwiftShader is noise.
// Every row has a control that must return EXACTLY.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  const setup = await P(`(function(){
    paused = true;
    /* A batch needs 3+ props sharing shape+colour IN ONE 24 m CELL (build 1430), so a thin scatter
       batches almost nothing — the probe's first run placed 420 props and produced 12 instances, which
       measures the fixture rather than the engine. CLUSTERS are what a showcase level is made of anyway:
       a booth is a pile of crates in one place. */
    let n = 0;
    for(let c=0;c<16;c++){
      const a = c/16*Math.PI*2, R = 46;
      const cx = Math.cos(a)*R, cz = Math.sin(a)*R;
      for(let i=0;i<26;i++){
        const x = cx + ((i%6)-2.5)*1.8, z = cz + (((i/6)|0)-2)*1.8;
        if(Math.abs(x)>66 || Math.abs(z)>66) continue;
        spawnProp('box', [x, 0, z, 0, 0, 0, 1.4, 1.4, 1.4], (o)=>{ if(o){ o.userData.col = 0x8a8f96; n++; } });
      }
    }
    return { placed:n, props:propModels.length };
  })()`);
  say('dense level', setup);

  /* Warm BOTH poses before reading either: build 1261 refits the sun's shadow volume on the first visit
     to a pose and a refit dirties the map, and build 1270's dirty flag is a COUNTER, so a first read
     carries a shadow pass a second does not. */
  /* THE THRESHOLD LIVES IN worldCfg. `_lodPxNow()` reads `worldCfg.lodPx` and there is no global of that
     name — the probe's first four runs set one anyway, so px was 0 in every row and every "the rung never
     fires" reading was the instrument. Capped at 16 by _lodPxNow. */
  const shot = `(function(px){
    worldCfg.lodPx = px;
    camera.position.set(0, 1.7, 0); camera.up.set(0,1,0);
    camera.lookAt(30, 1.4, 30); camera.updateMatrixWorld(true);
    for(let i=0;i<8;i++){ _lodTick(); }
    for(let i=0;i<20;i++) renderScene(scene, camera);
    renderer.info.reset();
    renderScene(scene, camera);
    let batches = 0, casting = 0, inst = 0;
    for(const im of instanceMeshes){ batches++; inst += im.count; if(im.castShadow) casting++; }
    let outWalked = 0;
    for(const o of propModels) if(o && o.userData && o.userData._instOut) outWalked++;
    let culled = 0, noShadow = 0, invisible = 0, loGeo = 0;
    for(const o of propModels){ if(!o || !o.userData) continue;
      if(o.userData._lodCull) culled++;
      if(o.userData._lodNoShadow) noShadow++;
      if(!o.userData._instOut && !o.visible) invisible++;
      o.traverse(m=>{ if(m.userData && m.userData._lodOn) loGeo++; }); }
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
             batches, casting, inst, batchedOut: outWalked, culled, noShadow, invisible, loGeo };
  })`;

  /* The level is ALREADY deployed when a probe attaches, so `if(!instancingActive)` batches nothing new —
     build 1430's own recorded trap, and the probe's first run walked straight into it. Tear down first. */
  const batched = await P(`(function(){ teardownInstancing(); buildInstancing();
    let out = 0; for(const o of propModels) if(o && o.userData && o.userData._instOut) out++;
    return { batches: instanceMeshes.length, batchedOut: out }; })()`);
  say('after a real rebuild', batched);

  console.log('\n--- with the rungs OFF (lodPx 0, the shipped default) --------------------------');
  /* THREE warm-ups before the first read, not two. A fresh buildInstancing() leaves the shadow map dirty
     and build 1270's flag is a COUNTER, so the first measured render carried a whole shadow pass — 94
     calls against 52 — and the control could not return. */
  await P(shot + `(0)`); await P(shot + `(0)`); const off = await P(shot + `(0)`); say('lodPx 0', off);

  /* A cluster 46 m out is a ~6 m sphere = ~29 screen px, so at lodPx 2 the rung correctly declines to
     shed it (2 x LOD_SHADOW_MUL = 8). Sweep until it does, rather than asserting it should have. */
  console.log('\n--- sweeping the threshold until the rung engages ---------------------------------');
  const rows = [];
  for(const px of [2, 6, 10, 16]){
    await P(shot + `(${px})`); const r = await P(shot + `(${px})`);
    rows.push([px, r.casting, r.calls, r.tris]);
    say('lodPx ' + px, r);
  }
  const on = rows.length ? { casting: rows[rows.length-1][1], calls: rows[rows.length-1][2], tris: rows[rows.length-1][3] } : {};

  console.log('\n--- control: back to 0, which must return -----------------------------------------');
  await P(shot + `(0)`); const back = await P(shot + `(0)`); say('lodPx 0 again', back);

  /* The default-on half: does the geometry rung still walk props the batch draws? Count the traversals
     it would do, by asking how many batched-out props sit in the window it sweeps. */
  const waste = await P(`(function(){
    worldCfg.lodPx = 0;
    let batchedOut = 0, live = 0;
    for(const o of propModels){ if(!o || !o.userData) continue;
      if(o.userData._instOut) batchedOut++; else live++; }
    return { batchedOut, live, budget: LOD_BUDGET,
             skippedPerSweep: Math.min(propModels.length, LOD_BUDGET) * (batchedOut/Math.max(1,propModels.length)) };
  })()`);

  console.log('\n--- what it means -----------------------------------------------------------------');
  say('control returns', (back.calls === off.calls && back.tris === off.tris && back.casting === off.casting)
      ? 'EXACTLY' : JSON.stringify([off, back]));
  say('batches / instances', [off.batches, off.inst]);
  say('batched-out props', waste.batchedOut + ' of ' + (waste.batchedOut + waste.live));
  say('sweep [px, casting, calls, tris]', rows);
  say('casting  off -> widest', [off.casting, on.casting]);
  /* and the near exemption: stand INSIDE a cluster and it must cast whatever the threshold says */
  /* WHY it does or does not fire: a batch's sphere spans its whole 24 m cell, so it stays large on screen
     even far away. Report the geometry rather than inferring it. */
  say('per-batch, camera in a far corner', await P(`(function(){
    worldCfg.lodPx = 8;
    camera.position.set(-66, 1.7, -66); camera.lookAt(46, 1.4, 0); camera.updateMatrixWorld(true);
    for(let i=0;i<8;i++) _lodTick();
    const _vh = renderer.domElement.clientHeight || 720;
    const k = (_vh*0.5)/Math.tan(camera.fov*Math.PI/360);
    const out = [];
    for(const im of instanceMeshes){ const bs = im.geometry && im.geometry.boundingSphere; if(!bs) continue;
      const d = Math.hypot(bs.center.x+66, bs.center.y-1.7, bs.center.z+66);
      out.push([+d.toFixed(0), +bs.radius.toFixed(1), +((bs.radius/d)*k).toFixed(0), im.count, im.castShadow?1:0]); }
    out.sort((a,b)=>b[0]-a[0]);
    return { spx: 8*LOD_SHADOW_MUL, nearKeep: LOD_NEAR_KEEP,
             farthest: out.slice(0,4), casting: out.filter(r=>r[4]).length, total: out.length };
  })()`));
  /* and a SMALL batch — three crates in a corner, which is just as ordinary as a 26-prop booth */
  say('a 3-prop batch far away', await P(`(function(){
    for(let i=0;i<3;i++) spawnProp('box', [62, 0, 62+i*1.6, 0,0,0, 0.6,0.6,0.6], (o)=>{ if(o) o.userData.col = 0x114488; });
    teardownInstancing(); buildInstancing();
    worldCfg.lodPx = 8;
    camera.position.set(-66, 1.7, -66); camera.lookAt(62, 1.4, 62); camera.updateMatrixWorld(true);
    for(let i=0;i<8;i++) _lodTick();
    const _vh = renderer.domElement.clientHeight || 720;
    const k = (_vh*0.5)/Math.tan(camera.fov*Math.PI/360);
    let small = null;
    for(const im of instanceMeshes){ const bs = im.geometry && im.geometry.boundingSphere; if(!bs) continue;
      if(im.count === 3){ const d = Math.hypot(bs.center.x+66, bs.center.y-1.7, bs.center.z+66);
        small = { d:+d.toFixed(0), r:+bs.radius.toFixed(2), sp:+((bs.radius/d)*k).toFixed(1), casting: im.castShadow }; } }
    return small || { none: true };
  })()`));
  say('inside a cluster, lodPx 16', await P(`(function(){
    worldCfg.lodPx = 16;
    camera.position.set(46, 1.7, 0); camera.lookAt(46, 1.4, 10); camera.updateMatrixWorld(true);
    for(let i=0;i<8;i++) _lodTick();
    let near = 0; for(const im of instanceMeshes){ const bs = im.geometry && im.geometry.boundingSphere; if(!bs) continue;
      const d = Math.hypot(bs.center.x-46, bs.center.y-1.7, bs.center.z-0);
      if(d < bs.radius + LOD_NEAR_KEEP && im.castShadow) near++; }
    return { batchesCastingNearby: near };
  })()`));
  say('LOD slots per sweep no longer spent on batched props', Math.round(waste.skippedPerSweep));

  await P(`(function(){ worldCfg.lodPx = 0; _lodRestoreAll(); return 1; })()`);
}, { settleMs: 5000 });

console.log('');
