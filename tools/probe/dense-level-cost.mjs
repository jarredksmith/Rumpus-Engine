// Do builds 1430 and 1431 actually help a DENSE level, from a real play camera?
//
// Asked from use: "should these new builds make the game run smoother with a lot of props in the scene?"
// Everything measured so far was a small fixture aimed at isolating one mechanism. This asks the question
// a creator asks — hundreds of props, camera at eye height in the middle of it — and it asks the honest
// downside too: build 1430 splits batches per spatial cell, so a level could end up with MORE draw calls
// than before, and that trade has only been measured on 120 props.
//
// Frame TIME is deliberately not the measurand. SwiftShader's noise floor is larger than anything being
// asked about (build 1414), so draw calls and triangles — integers, from renderer.info — are what can be
// trusted here. A creator's own machine is the only place the wall clock means anything.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(32) + JSON.stringify(v));

await withGame(async (P) => {
  const setup = await P(`(function(){
    paused = true;
    /* A DENSE, VARIED level: eight shapes at varied scales and colours scattered over the arena, which is
       what a showcase level is made of and what defeats batching by colour. Inside +-ARENA (build 1405). */
    const shapes = ['box','cyl','sphere','wedge','cone','pillar','dome','tube'];
    let n = 0;
    for(let i=0;i<600;i++){
      const a = i*0.618*Math.PI*2, r = 6 + (i%11)*5.6;
      const x = Math.cos(a)*r, z = Math.sin(a)*r;
      if(Math.abs(x)>66 || Math.abs(z)>66) continue;
      const s = 0.8 + (i%5)*0.5;
      spawnProp(shapes[i%shapes.length], [x, 0, z, 0, (i%7)*0.4, 0, s, s, s], (o)=>{
        if(o){ o.userData.col = [0x8a8f96,0x6d5a44,0x3f5a6b,0x7a6d8f][i%4]; n++; } });
    }
    return { placed: n, props: propModels.length };
  })()`);
  say('dense level', setup);

  const shot = `(function(cull){
    for(const im of instanceMeshes) im.frustumCulled = cull;
    /* eye height, in the middle of it, looking along the ground — where the game puts you */
    camera.position.set(0, 1.7, 0); camera.up.set(0,1,0);
    camera.lookAt(30, 1.4, 30); camera.updateMatrixWorld(true);
    for(let i=0;i<20;i++) renderScene(scene, camera);   // drain the shadow-dirty COUNTER (build 1270)
    renderer.info.reset();
    renderScene(scene, camera);
    let batches = 0, inst = 0;
    scene.traverse(o=>{ if(o.isInstancedMesh){ batches++; inst += o.count; } });
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, batches, inst };
  })`;

  await P(`(function(){ teardownInstancing(); return 1; })()`);
  console.log('\n--- un-batched: what every prop costs as its own object ------------------------');
  await P(shot + `(false)`); const un = await P(shot + `(false)`); say('un-batched', un);

  await P(`(function(){ buildInstancing(); return 1; })()`);
  console.log('\n--- batched, culling OFF (every build before 1430) -----------------------------');
  await P(shot + `(false)`); const off = await P(shot + `(false)`); say('pre-1430', off);

  console.log('\n--- batched, culling ON (shipped) ---------------------------------------------');
  await P(shot + `(true)`); const on = await P(shot + `(true)`); say('1430', on);

  console.log('\n--- control: back to culling OFF, which must return ----------------------------');
  await P(shot + `(false)`); const back = await P(shot + `(false)`); say('pre-1430 again', back);

  console.log('\n--- what it means -------------------------------------------------------------');
  const pct = (a, b) => (b === 0 ? 'n/a' : ((a - b) / b * 100).toFixed(1) + '%');
  say('control returns', (back.calls === off.calls && back.tris === off.tris) ? 'EXACTLY' :
      JSON.stringify([off.calls, back.calls, off.tris, back.tris]));
  say('batches on this level', on.batches);
  say('draw calls  1430 vs pre', [on.calls, off.calls, pct(on.calls, off.calls)]);
  say('triangles   1430 vs pre', [on.tris, off.tris, pct(on.tris, off.tris)]);
  say('draw calls  1430 vs un-batched', [on.calls, un.calls, pct(on.calls, un.calls)]);
  say('triangles   1430 vs un-batched', [on.tris, un.tris, pct(on.tris, un.tris)]);
}, { settleMs: 5000 });

console.log('');
