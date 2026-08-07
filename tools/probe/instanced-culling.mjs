// Does duplicating a prop cost triangles even when the copies are off screen?
//
// Asked from use: "is there a way to avoid doubling the tris if it's a duplicate of the prop?" Build 1420
// measured something suspicious and could not explain it — instancing CUT draw calls 36% and TRIPLED the
// triangle count (195,010 -> 524,582), with the control returning byte-exact. It recorded the leading
// hypothesis and refused to claim it, which is the right call and is what this settles.
//
// The hypothesis, now verified in the vendored r149 rather than guessed:
//   InstancedMesh's constructor sets `this.frustumCulled = false` ITSELF, and the class has no
//   boundingSphere and no computeBoundingSphere at all.
//   Frustum.intersectsObject reads `object.geometry.boundingSphere` transformed by `object.matrixWorld` —
//   which for a batch is ONE UNMOVED COPY's bounds, so culling it would be wrong, and three declines to.
// So every instanced batch submits EVERY instance's triangles EVERY frame regardless of the camera, while
// the per-object props it replaced were culled individually. That is a real cost and it is measurable.
//
// The measurand is renderer.info.render.triangles, an integer, read after a real render. Draw calls and
// triangles are the right instruments here (build 1414's rule) — wall-clock under SwiftShader has a noise
// floor larger than anything being asked about.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(34) + JSON.stringify(v));

await withGame(async (P) => {
  const setup = await P(`(function(){
    paused = true;
    /* A CLUSTER, deliberately: copies of one prop standing together, which is what a creator makes when
       they duplicate a fence post or a crate along a wall. A batch whose instances are scattered over the
       whole map has a bounding volume covering the map and could never be culled anyway — that is the
       honest limit on any win here, and it is why the fixture is local. */
    window.__made = [];
    for(let i=0;i<24;i++){
      const x = 40 + (i%6)*2, z = 40 + Math.floor(i/6)*2;
      spawnProp('box', [x, 0, z, 0,0,0, 1.5,1.5,1.5], (o)=>{ window.__made.push(o); });
    }
    return { made: window.__made.length, props: propModels.length };
  })()`);
  say('cluster built', setup);

  const shot = `(function(pose){
    /* pose and render in ONE block: the frame loop rewrites camera.position from the player every frame
       (build 1345), so a pose set in one round trip and measured in the next is not what was rendered. */
    camera.position.set(pose.p[0], pose.p[1], pose.p[2]);
    camera.up.set(0,1,0); camera.lookAt(pose.l[0], pose.l[1], pose.l[2]);
    camera.updateMatrixWorld(true);
    /* Render until the SHADOW MAP has settled, then measure. build 1093 leaves
       renderer.shadowMap.autoUpdate false, so a shadow pass runs only on a frame something dirtied — and
       build 1270's dirty flag is a COUNTER, not a boolean, so two renders do not drain it. A first run
       had the AT pose read 197 calls then 104 for the same scene purely from a shadow pass being present
       in one and absent in the other, which reads exactly like the teardown losing props. */
    for(let i=0;i<6;i++) renderScene(scene, camera);
    renderer.info.reset();
    renderScene(scene, camera);
    const r = renderer.info.render;
    return { calls: r.calls, tris: r.triangles };
  })`;

  const AT = `({ p:[46, 12, 62], l:[46, 1, 46] })`, AWAY = `({ p:[46, 12, 62], l:[46, 1, 300] })`;
  const measure = async (label) => {
    /* Warm BOTH poses before reading either. Build 1261 refits the sun's shadow volume when the camera
       moves past a deadband and a refit dirties the map, so the first visit to a pose carries a shadow
       pass the second does not — which showed up as an un-batched AT of 196 calls followed by 104 for
       the identical scene, i.e. a control that could not return. */
    await P(shot + AT); await P(shot + AWAY);
    const at = await P(shot + AT);      // looking AT the cluster
    const away = await P(shot + AWAY);  // 180 degrees away from it
    say(label + ' — camera AT', at);
    say(label + ' — camera AWAY', away);
    return { at, away };
  };

  /* The stock level is ALREADY DEPLOYED, so it is already batched — a first run took its baseline
     without tearing down and measured batched-vs-batched, two identical rows and a control that could
     not return. Establish the un-batched state explicitly. */
  await P(`(function(){ teardownInstancing(); return 1; })()`);
  console.log('\n--- 24 duplicated props, NOT batched (each prop is its own object) --------------');
  const un = await measure('un-batched');

  console.log('\n--- the same 24, BATCHED (what a deploy does) -----------------------------------');
  const built = await P(`(function(){
    buildInstancing();
    let batches = 0, instances = 0;
    scene.traverse(o=>{ if(o.isInstancedMesh){ batches++; instances += o.count; } });
    return { batches, instances,
             frustumCulled: (function(){ let v = null; scene.traverse(o=>{ if(o.isInstancedMesh && v===null) v = o.frustumCulled; }); return v; })(),
             hasBoundingSphere: (function(){ let v = null; scene.traverse(o=>{ if(o.isInstancedMesh && v===null) v = ('boundingSphere' in o); }); return v; })(),
             hasComputeFn: (function(){ let v = null; scene.traverse(o=>{ if(o.isInstancedMesh && v===null) v = (typeof o.computeBoundingSphere); }); return v; })() };
  })()`);
  say('batches built', built);
  const ba = await measure('batched');

  /* The decisive isolation: the SAME batches, the same scene, one flag. `frustumCulled = false` is
     exactly the pre-1430 behaviour (and three's own default for an InstancedMesh), so this is a true
     before/after with nothing else varying. */
  console.log('\n--- the same batches with culling OFF (i.e. every build before this one) ---------');
  await P(`(function(){ for(const im of instanceMeshes) im.frustumCulled = false; return 1; })()`);
  const off = await measure('batched, cull off');
  await P(`(function(){ for(const im of instanceMeshes) im.frustumCulled = true; return 1; })()`);
  const onAgain = await measure('batched, cull back on');

  console.log('\n--- the control: tear the batches down and the numbers must return ---------------');
  await P(`(function(){ teardownInstancing(); return 1; })()`);
  const back = await measure('un-batched again');

  console.log('\n--- what it means ---------------------------------------------------------------');
  const pct = (a, b) => (b === 0 ? 'n/a' : (100 * (a - b) / b).toFixed(1) + '%');
  say('un-batched: AWAY vs AT tris', pct(un.away.tris, un.at.tris));
  say('batched:    AWAY vs AT tris', pct(ba.away.tris, ba.at.tris));
  say('control returns (tris AT)', un.at.tris === back.at.tris ? 'EXACTLY' :
      un.at.tris + ' -> ' + back.at.tris);
  say('draw calls AT: un-batched -> batched', [un.at.calls, ba.at.calls]);
  say('AWAY tris: cull off -> on', [off.away.tris, ba.away.tris]);
  say('AWAY calls: cull off -> on', [off.away.calls, ba.away.calls]);
  say('the flag A/B returns', onAgain.away.tris === ba.away.tris && onAgain.at.tris === ba.at.tris ?
      'EXACTLY' : JSON.stringify([onAgain.away.tris, onAgain.at.tris]));

  /* Would tight bounds even help? Only if a batch is spatially LOCAL. Batches group by shape|colour, so
     every grey box in a level is ONE batch — and a batch spanning the map has a bounding volume covering
     the map, which no frustum can reject. That is build 1420's own caveat and it decides whether the fix
     is bounds alone or bounds plus spatial partitioning. Measured on a SCATTERED level, which is what a
     real one looks like. */
  console.log('\n--- how spread is a batch on a scattered level? --------------------------------');
  const spread = await P(`(function(){
    teardownInstancing();
    for(let i=0;i<120;i++){
      const a = i*0.618*Math.PI*2, r = 8 + (i%9)*7;
      spawnProp('box', [Math.cos(a)*r, 0, Math.sin(a)*r, 0,0,0, 1,1,1], ()=>{});
    }
    buildInstancing();
    const V = new THREE.Vector3(), M = new THREE.Matrix4(), out = [];
    scene.traverse(o=>{ if(!o.isInstancedMesh) return;
      let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
      for(let i=0;i<o.count;i++){ o.getMatrixAt(i, M); V.setFromMatrixPosition(M);
        minx=Math.min(minx,V.x); maxx=Math.max(maxx,V.x); minz=Math.min(minz,V.z); maxz=Math.max(maxz,V.z); }
      out.push({ n:o.count, spanX:+(maxx-minx).toFixed(1), spanZ:+(maxz-minz).toFixed(1) }); });
    out.sort((a,b)=>b.n-a.n);
    return { arena: (typeof ARENA!=='undefined'?ARENA:null), batches: out.length, top: out.slice(0,6) };
  })()`);
  say('arena half-extent', spread.arena);
  say('batches', spread.batches);
  for (const b of spread.top) say('  ' + b.n + ' instances', 'span ' + b.spanX + ' x ' + b.spanZ);
}, { settleMs: 5000 });

console.log('');
