// What does a gauntlet-scale level actually COST?
//
// The engine has instancing (1192), a collider grid (1188), screen-size culling (1267/1270) and an
// adaptive ladder (1141). None of that has been measured end to end on a level the size of the thing this
// is being built for. Wall-clock frame time is unreliable under SwiftShader — build 1348 lost a whole
// feature to that — so this counts DRAW CALLS and TRIANGLES, which are integers and are what a shadow map
// and a batch actually change.
//
// The question that decides whether there is a finding: does cost grow LINEARLY with props, and does
// anything the engine already ships bend that curve? Repeated props should batch; varied props should not.
import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const r = await probe(`(function(){
    const R = { rows: [] };
    paused = true; _tabHidden = true; _adaptOn = false; _prStepI = 0;
    player.pos.set(0, 2.9, 30); camera.position.set(0, 2.9, 30);
    camera.rotation.set(-0.1, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);

    function sample(){
      try{ renderer.info.reset(); }catch(e){}
      renderer.shadowMap.needsUpdate = true;
      renderScene(scene, camera);
      const i = renderer.info.render;
      let lights = 0, casters = 0, colliders = 0, boxes = 0;
      scene.traverseVisible(o=>{ if(o.isLight){ lights++; if(o.castShadow) casters++; } });
      for(const c of colliders_ref){ colliders++; boxes += (c.boxes ? c.boxes.length : 1); }
      return { calls: i.calls, tris: i.triangles, lights: lights, casters: casters,
               colliders: colliders, boxes: boxes, props: propModels.length };
    }
    const colliders_ref = (typeof colliders !== 'undefined') ? colliders : [];

    const made = [];
    /* VARIED props — different shapes, sizes and colours, which is what a showcase level is made of and
       what defeats instancing. A field of identical boxes would flatter the numbers. */
    const shapes = ['box','cylinder','cone','sphere','wedge','stairs','pillar','torus'];
    function add(n){
      for(let i = 0; i < n; i++){
        const k = made.length, s = shapes[k % shapes.length];
        let o = null;
        spawnProp(s, [ -60 + (k % 24) * 5, 0, 20 + Math.floor(k / 24) * 5,
                       0, (k * 0.31) % 6.28, 0,
                       1 + (k % 5) * 0.3, 1 + (k % 3) * 0.7, 1 + (k % 4) * 0.4 ], (b)=>{o=b;});
        if(o) made.push(o);
      }
    }

    sample(); sample();
    R.rows.push(Object.assign({ label: 'stock' }, sample()));
    for(const target of [100, 250, 500, 900]){
      add(target - made.length);
      sample();
      R.rows.push(Object.assign({ label: '+' + target }, sample()));
    }

    /* INSTANCING (build 1192) runs at DEPLOY, not while authoring — so every row above is the UNBATCHED
       state, which is what the EDITOR shows and not what a player gets. Measuring only that would have
       reported a cost the shipped game never pays. */
    try{ teardownInstancing(); buildInstancing(); }catch(e){ R.instErr = String(e && e.message); }
    sample();
    R.batched = Object.assign({ label: 'deployed (batched)' }, sample());

    /* WHY do the triangles go UP when the calls go down? Build 1192 sets frustumCulled=false on every
       batch — deliberately, because three derives a mesh's bounding sphere from its ORIGINAL geometry (a
       unit box at the origin for an instanced batch), so culling it would use the wrong bounds. The
       consequence is that a batch spread across the map is never culled AT ALL, while the un-batched props
       it replaced were frustum-culled per object. Test it directly: r149's InstancedMesh HAS
       computeBoundingSphere(), which accounts for the instance matrices. */
    const batches = [];
    scene.traverse(o=>{ if(o.isInstancedMesh) batches.push(o); });
    R.batchCount = batches.length;
    R.batchSpans = batches.map(function(b){
      try{ b.computeBoundingSphere(); return +(b.boundingSphere ? b.boundingSphere.radius : -1).toFixed(1); }
      catch(e){ return -1; }
    });
    for(const b of batches){ try{ b.computeBoundingSphere(); b.frustumCulled = true; }catch(e){} }
    sample();
    R.frustum = Object.assign({ label: 'batched + frustum' }, sample());
    for(const b of batches) b.frustumCulled = false;
    sample();
    R.frustumBack = Object.assign({ label: 'frustum off (control)' }, sample());

    /* what the shipped culling would buy on this level — OFF by default since build 1273 */
    const before = worldCfg.lodPx;
    worldCfg.lodPx = 2;
    for(let i=0;i<40;i++){ if(typeof _lodTick==='function') _lodTick(1/60); }
    sample();
    R.culled = Object.assign({ label: 'lodPx 2' }, sample());
    R.lodReport = (typeof lodReport==='function') ? lodReport() : null;
    worldCfg.lodPx = before;
    for(let i=0;i<40;i++){ if(typeof _lodTick==='function') _lodTick(1/60); }
    sample();
    R.restored = Object.assign({ label: 'lodPx 0 (control)' }, sample());

    for(const o of made){ const i = propModels.indexOf(o); if(i>=0) removeProp(i); }
    paused = false; _tabHidden = false;
    return R;
  })()`);

  const hdr = 'level'.padEnd(18) + 'props'.padStart(6) + 'calls'.padStart(8) + 'tris'.padStart(10) +
              'lights'.padStart(8) + 'colliders'.padStart(11) + 'boxes'.padStart(8);
  console.log('        ' + hdr);
  const line = (x) => '        ' + x.label.padEnd(18) + String(x.props).padStart(6) +
    String(x.calls).padStart(8) + String(x.tris).padStart(10) + String(x.lights).padStart(8) +
    String(x.colliders).padStart(11) + String(x.boxes).padStart(8);
  for (const x of r.rows) console.log(line(x));
  console.log('');
  console.log(line(r.batched) + '   <- what a PLAYER gets');
  console.log(line(r.frustum));
  console.log(line(r.frustumBack));
  console.log(line(r.culled));
  console.log(line(r.restored));
  console.log('');
  if (r.lodReport) console.log('        lodReport: ' + JSON.stringify(r.lodReport) + '\n');

  const a = r.rows[1], z = r.rows[r.rows.length - 1];
  const perProp = (z.calls - a.calls) / (z.props - a.props);
  console.log('        draw calls per added prop: ' + perProp.toFixed(2) +
              '   (1.00 = no batching at all)');
  console.log('        instancing at deploy: ' + z.calls + ' -> ' + r.batched.calls + ' calls  (' +
              (100 * (1 - r.batched.calls / z.calls)).toFixed(0) + '% off)' +
              (r.instErr ? '   [threw: ' + r.instErr + ']' : ''));
  console.log('        culling at lodPx 2 on the ' + z.props + '-prop level: ' +
              z.calls + ' -> ' + r.culled.calls + ' calls  (' +
              (100 * (1 - r.culled.calls / z.calls)).toFixed(0) + '% off)');
  console.log('        ' + r.batchCount + ' batches, bounding radii: ' + JSON.stringify(r.batchSpans));
  console.log('        frustum-culling the batches: ' + r.batched.tris + ' -> ' + r.frustum.tris +
              ' triangles, control back to ' + r.frustumBack.tris +
              (r.frustumBack.tris === r.batched.tris ? '  — exactly' : '  — DRIFTED'));
  console.log('        control returns to ' + r.restored.calls +
              (r.restored.calls === r.batched.calls ? '  — exactly (vs the BATCHED baseline, which is what it should return to)'
                                                       : '  — DRIFTED, treat the row above with suspicion') + '\n');
}, { settleMs: 4000 });
