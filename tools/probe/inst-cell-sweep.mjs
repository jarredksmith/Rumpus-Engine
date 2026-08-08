// How big should a batch's spatial cell be? Swept, not chosen.
//
// Build 1430 split batches per INST_CELL so a batch's volume is small enough for a frustum to reject, and
// picked 24 m from one fixture. The dense-level measurement then found the remaining cost: batching still
// draws +28.8% more triangles than not batching, because a batch draws EVERY instance in its cell when any
// part of that cell is visible.
//
// The obvious next move is per-instance culling — pack the visible matrices to the front and shrink
// `count`. It is WRONG here, and that is worth stating before the sweep: `count` governs every pass, so
// culling instances against the CAMERA frustum removes them from the SHADOW pass too, deleting the shadows
// of every caster behind the player. That is precisely the mistake build 1430 avoided by giving three real
// bounds and letting it cull each pass against its own frustum, and three's InstancedMesh has one `count`
// with no way to express a different one per pass.
//
// So the lever is the cell size, and this measures the curve instead of guessing at it. `_instCellOf` is a
// function declaration, so the probe can rebind it and rebuild — no engine change needed to sweep.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  const setup = await P(`(function(){
    paused = true;
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
    window.__cellOrig = _instCellOf;
    return { placed:n, props:propModels.length };
  })()`);
  say('dense level', setup);

  const run = `(function(cell){
    teardownInstancing();
    if(cell > 0){ _instCellOf = function(o){ const p=o.position;
      return Math.floor(p.x/cell) + ',' + Math.floor(p.z/cell); }; }
    else { _instCellOf = function(){ return '0,0'; }; }   // cell 0 = NO SPLIT: one batch per shape|colour
    buildInstancing();
    camera.position.set(0, 1.7, 0); camera.up.set(0,1,0);
    camera.lookAt(30, 1.4, 30); camera.updateMatrixWorld(true);
    for(let i=0;i<20;i++) renderScene(scene, camera);   // drain the shadow-dirty COUNTER
    renderer.info.reset();
    renderScene(scene, camera);
    let batches = 0, inst = 0;
    scene.traverse(o=>{ if(o.isInstancedMesh){ batches++; inst += o.count; } });
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, batches, inst };
  })`;

  // the floor to beat: every prop its own object, culled exactly, one draw call each
  const un = await P(`(function(){
    teardownInstancing();
    camera.position.set(0, 1.7, 0); camera.lookAt(30, 1.4, 30); camera.updateMatrixWorld(true);
    for(let i=0;i<20;i++) renderScene(scene, camera);
    renderer.info.reset(); renderScene(scene, camera);
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  })()`);
  console.log('\n--- the floor: no batching at all, exact per-object culling ---------------------');
  say('un-batched', un);

  console.log('\n--- the sweep ------------------------------------------------------------------');
  console.log('  cell        calls    tris    batches  inst   vs un-batched (calls / tris)');
  const rows = [];
  for (const cell of [0, 96, 64, 48, 32, 24, 16, 12, 8]) {
    await P(run + `(${cell})`);                    // warm: build 1261 refits on the first visit
    const r = await P(run + `(${cell})`);
    const dc = ((r.calls - un.calls) / un.calls * 100).toFixed(1);
    const dt = ((r.tris - un.tris) / un.tris * 100).toFixed(1);
    rows.push({ cell, ...r, dc: +dc, dt: +dt });
    console.log('  ' + String(cell === 0 ? 'none' : cell + ' m').padEnd(10) +
      String(r.calls).padStart(6) + String(r.tris).padStart(9) +
      String(r.batches).padStart(9) + String(r.inst).padStart(7) +
      '   ' + (dc > 0 ? '+' : '') + dc + '% / ' + (dt > 0 ? '+' : '') + dt + '%');
  }

  console.log('\n--- the control: the shipped 24 m again, which must return ----------------------');
  await P(run + `(24)`);
  const back = await P(run + `(24)`);
  const first = rows.find(r => r.cell === 24);
  say('24 m again', back);
  say('returns', (back.calls === first.calls && back.tris === first.tris) ? 'EXACTLY' :
      JSON.stringify([first.calls, back.calls, first.tris, back.tris]));

  await P(`(function(){ _instCellOf = window.__cellOrig; teardownInstancing(); buildInstancing(); return 1; })()`);
}, { settleMs: 5000 });

console.log('');
