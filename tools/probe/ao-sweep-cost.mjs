// What does the no-depth sweep actually cost?
//
// Build 1168 named "replacing _aoHideNoDepth's traverse with a transparent-material registry" as the half it
// did not finish, and 1353 did the cheap half (the four buffers). Before building a registry — which is the
// hand-kept-list shape this file records as its most repeated defect, and whose staleness here would put a
// solid rectangle back in the AO buffer — measure whether the traverse is worth replacing at all.
//
// The measurand is NODE VISITS, not the clock: integers, and SwiftShader's noise floor exceeds the effect
// (build 1414, re-confirmed at 1.88x in build 1451's probe).
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

const COUNT = `(function(){
  /* count what the sweep would visit, using three's own traverse — the same walk the sweep performs */
  let nodes = 0, meshes = 0, hits = 0;
  const seen = (root) => { let n=0, m=0, h=0;
    root.traverse(o=>{ n++; if(!o.visible) return; const mt=o.material; if(!mt) return; m++;
      const bad = Array.isArray(mt) ? mt.some(q => q && (q.depthWrite===false || q.transparent===true || (q.alphaTest||0)>0))
                                    : !!(mt && (mt.depthWrite===false || mt.transparent===true || (mt.alphaTest||0)>0));
      if(bad) h++; });
    return { n, m, h }; };
  const w = seen(scene), v = (typeof vmScene!=='undefined' && vmScene) ? seen(vmScene) : { n:0, m:0, h:0 };
  return { worldNodes: w.n, worldMeshes: w.m, worldHits: w.h,
           vmNodes: v.n, vmMeshes: v.m, vmHits: v.h,
           props: propModels.length };
})()`;

await withGame(async (P) => {
  say('settled', await P(`(function(){ return { build: BUILD_VERSION, props: propModels.length }; })()`));

  console.log('\n--- the stock level -------------------------------------------------------------------');
  const stock = await P(COUNT);
  say('one sweep visits', stock);

  console.log('\n--- how many sweeps run in a frame ----------------------------------------------------');
  say('gates', await P(`(function(){
    return { aoWant: (typeof _aoWant!=='undefined') ? !!_aoWant : '(not in scope)',
             geoWant: (typeof _geoWant!=='undefined') ? !!_geoWant : '(not in scope)',
             velWant: (typeof _velWant!=='undefined') ? !!_velWant : '(not in scope)',
             ssao: worldCfg.ssao, motion: worldCfg.postMotion, ssr: worldCfg.ssr };
  })()`));
  say('call sites in source', await P(`(function(){
    /* four: world+viewmodel for the AO G-buffer, world+viewmodel for the velocity buffer */
    return { sites: 4, note: 'AO world, AO viewmodel, velocity world, velocity viewmodel' };
  })()`));

  console.log('\n--- at gauntlet scale -----------------------------------------------------------------');
  say('600 more props', await P(`(function(){
    for(let i=0;i<600;i++){
      const a=(i/600)*Math.PI*2, r=20+(i%7)*3;
      spawnProp('box', [40+Math.cos(a)*r, 0, 40+Math.sin(a)*r, 0, 0, 0, 1, 1, 1]);
      const o=propModels[propModels.length-1]; if(o) o.userData.__probeFix=1;
    }
    return { props: propModels.length };
  })()`));
  const big = await P(COUNT);
  say('one sweep visits', big);
  say('per frame (4 sweeps)', { worldNodes: big.worldNodes * 2, vmNodes: big.vmNodes * 2,
                                total: big.worldNodes * 2 + big.vmNodes * 2 });

  console.log('\n--- what a registry would have to track ------------------------------------------------');
  say('the hit set', await P(`(function(){
    const kinds = {};
    scene.traverse(o=>{ if(!o.visible) return; const m=o.material; if(!m) return;
      const bad = Array.isArray(m) ? m.some(q=>q&&(q.depthWrite===false||q.transparent===true||(q.alphaTest||0)>0))
                                   : !!(m&&(m.depthWrite===false||m.transparent===true||(m.alphaTest||0)>0));
      if(bad){ const k = o.type + (o.userData && o.userData.src ? ':model' : ''); kinds[k] = (kinds[k]||0)+1; } });
    return kinds;
  })()`));
  console.log('\n--- candidate 1: traverseVisible, which skips an invisible SUBTREE ---------------------');
  say('traverse vs traverseVisible', await P(`(function(){
    /* the predicate already starts \`if(!o.visible) return\`, but three's traverse still DESCENDS into an
       invisible subtree and calls back on every child. three's own renderer skips such a subtree entirely
       (projectObject returns early), so nothing under an invisible ancestor is drawn.
       MEASURED, and the sets are NOT the same: 24 against 5. The 19 extra are VISIBLE children of an
       INVISIBLE parent — the current sweep hides and then restores each of them, a net no-op for the
       render but 19 pointless writes a pass. So traverseVisible is equivalent for the FRAME and different
       for the LIST, which is exactly the distinction build 1152 had to make ("already-invisible objects
       are not collected, or the restore would switch them ON"). Printed rather than assumed. */
    let all = 0, vis = 0;
    scene.traverse(()=>{ all++; });
    scene.traverseVisible(()=>{ vis++; });
    let allV = 0, visV = 0;
    if(typeof vmScene!=='undefined' && vmScene){ vmScene.traverse(()=>{ allV++; }); vmScene.traverseVisible(()=>{ visV++; }); }
    /* and the ANSWER must be identical: collect both ways and compare */
    const bad = (m) => Array.isArray(m) ? m.some(q=>q&&(q.depthWrite===false||q.transparent===true||(q.alphaTest||0)>0))
                                        : !!(m&&(m.depthWrite===false||m.transparent===true||(m.alphaTest||0)>0));
    const A = []; scene.traverse(o=>{ if(!o.visible) return; if(o.material && bad(o.material)) A.push(o); });
    const B = []; scene.traverseVisible(o=>{ if(o.material && bad(o.material)) B.push(o); });
    const sameSet = A.length === B.length && A.every(o => B.indexOf(o) >= 0);
    return { worldAll: all, worldVisible: vis, saved: all - vis,
             vmAll: allV, vmVisible: visV,
             hitsTraverse: A.length, hitsTraverseVisible: B.length, sameSet };
  })()`));

  console.log('\n--- THE VERDICT ----------------------------------------------------------------------');
  console.log('  A registry would save walking ~1,554 nodes to find a set of 24 that does NOT grow with');
  console.log('  content — and its failure mode is a solid rectangle back in the AO buffer, the bug builds');
  console.log('  1126/1128/1152/1158/1285 exist to prevent, six arrivals of one rule. traverseVisible saves');
  console.log('  4.4% of the visits. Neither is worth touching this code for. Recorded, not built.');

  say('cleanup', await P(`(function(){
    let n=0; for(let i=propModels.length-1;i>=0;i--) if(propModels[i]&&propModels[i].userData.__probeFix){ removeProp(i); n++; }
    return { removed: n, left: propModels.length };
  })()`));
}, { settleMs: 6000 });

console.log('');
