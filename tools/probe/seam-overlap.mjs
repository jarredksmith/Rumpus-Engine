// edge-line.mjs put the bright line on the wall's INNER face at y = 2.99-3.00 — exactly where the room
// tool butts the wall (y 0..3) against the ceiling (y 3..3.3) — with the occluder 1 MM away. No shadow-map
// parameter can resolve a 1 mm occluder distance at a 5.86 cm texel, so the question is whether the SEAM is
// the problem: two pieces meeting at exactly one plane, with nothing overlapping.
//
// One test: drop the ceiling slab so it overlaps the walls, change nothing else, and re-measure the same
// pixels. Interior height is unchanged from the player's point of view either way; what changes is whether
// the receiver sits at a zero-width junction or well inside a solid occluder.
import { withGame } from './driver.mjs';

const MEASURE = (cx, cz) => `(function(){
  camera.position.set(${cx}, 1.4, ${cz}); camera.rotation.set(0.35, 2.3, 0, 'YXZ'); camera.updateMatrixWorld(true);
  renderer.shadowMap.needsUpdate = true; scene.environment = null;
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
  const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  const b=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,b);
  renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
  const Y=[]; for(let i=0;i<b.length;i+=4) Y.push(0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]);
  const s=Y.slice().sort((p,q)=>p-q), p50=s[s.length>>1], mx=s[s.length-1];
  let hot=0; const thr=Math.max(0.02, p50*3);
  for(const v of Y) if(v>thr) hot++;
  return JSON.stringify({ medianY:+p50.toFixed(5), maxY:+mx.toFixed(4),
    ratio:+(mx/p50).toFixed(1), brightPx:hot, pctBright:+(100*hot/Y.length).toFixed(2) });
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=1.3; worldCfg.bounce=0.5; worldCfg.ambient=0;
    worldCfg.sunAzim=63; worldCfg.sunElev=34; worldCfg.ssao=0; worldCfg.baked=false;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  await P(`player.pos.set(60, 2, 60); if(player.vel) player.vel.set(0,0,0); 1`);
  await new Promise(r => setTimeout(r, 1800));
  const pp = JSON.parse(await P(`JSON.stringify([+player.pos.x.toFixed(2),+player.pos.z.toFixed(2)])`));
  const [cx, cz] = pp;

  await P(`window.__made = buildRoomAt(${cx}, ${cz}, { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true,
    openings:[{ wall:'n', at:0, width:2.0, sill:0, height:2.1 }] }); window.__made.length`);
  await new Promise(r => setTimeout(r, 2200));

  // which piece is the ceiling? the one whose centre is highest
  console.log('pieces ' + await P(`(function(){ const box=new THREE.Box3();
    return JSON.stringify(window.__made.map(o=>{ box.setFromObject(o);
      return { y:[+box.min.y.toFixed(2), +box.max.y.toFixed(2)],
               size:[+(box.max.x-box.min.x).toFixed(1), +(box.max.z-box.min.z).toFixed(1)] }; })); })()`));

  console.log('\nas built (wall top and ceiling underside both at y = 3.00, a zero-width seam):');
  console.log('  ' + await P(MEASURE(cx, cz)));

  /* SHADOW DISTANCE is the one lever never validly tested: it sets the volume, hence the texel size in
     world units, and the leak band is a sub-texel feature. It is also a knob the creator already has.
     Set inside the render block, because _fitSunShadow rewrites the fit every frame. */
  console.log('\nshadow distance (the texel size, and a control the creator already has):');
  for (const sd of [400, 120, 60, 30, 15, 8]) {
    await P(`worldCfg.shadowDist=${sd}; applyWorldCfg(); _dirtyShadows(2); 1`);
    await new Promise(r => setTimeout(r, 1100));
    const t = await P(`(function(){ const c=moon.shadow.camera;
      return (100*(c.right-c.left)/moon.shadow.mapSize.x).toFixed(2); })()`);
    console.log('  shadowDist ' + String(sd).padEnd(4) + ' texel ' + String(t).padStart(6) + ' cm   ' + await P(MEASURE(cx, cz)));
  }
  await P(`worldCfg.shadowDist=60; applyWorldCfg(); _dirtyShadows(2); 1`);
  await new Promise(r => setTimeout(r, 1100));

  for (const drop of [0.03, 0.06, 0.12]) {
    await P(`(function(){ const box=new THREE.Box3(); let top=null, ty=-1e9;
      for(const o of window.__made){ box.setFromObject(o); if(box.min.y > ty){ ty = box.min.y; top = o; } }
      if(!window.__ceilY) window.__ceilY = top.position.y;
      top.position.y = window.__ceilY - ${drop};
      top.updateMatrixWorld(true);
      if(typeof refreshPropCollider==='function') refreshPropCollider(top);
      _dirtyShadows(2); return top.position.y; })()`);
    await new Promise(r => setTimeout(r, 900));
    console.log('  ceiling overlapped by ' + (drop * 100).toFixed(0) + ' cm   ' + await P(MEASURE(cx, cz)));
  }

  // control: put it back, the reading must return
  await P(`(function(){ const box=new THREE.Box3(); let top=null, ty=-1e9;
    for(const o of window.__made){ box.setFromObject(o); if(box.min.y > ty){ ty = box.min.y; top = o; } }
    top.position.y = window.__ceilY; top.updateMatrixWorld(true);
    if(typeof refreshPropCollider==='function') refreshPropCollider(top); _dirtyShadows(2); return 1; })()`);
  await new Promise(r => setTimeout(r, 900));
  console.log('  restored (control)            ' + await P(MEASURE(cx, cz)));
}, { settleMs: 6000 });
