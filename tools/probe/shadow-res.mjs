// The corner leak is a fixed number of TEXELS wide: halving shadowDist halves it, exactly proportionally
// (400/120/60/30/15/8 -> 910/300/141/75/37/28 leaking px). texel = 2*extent / mapSize, so the map size is
// the other half of that same ratio and the only lever that does not shorten the shadow range.
//
// So: does 4096 on the NEAR cascade halve the leak, and what does it cost? Both measured here — a fix that
// doubles the shadow cost on the machines that already shed MSAA is not a fix.
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
  const s=Y.slice().sort((p,q)=>p-q), p50=s[s.length>>1];
  let hot=0; const thr=Math.max(0.02, p50*3); for(const v of Y) if(v>thr) hot++;
  const c=moon.shadow.camera;
  return JSON.stringify({ mapSize:moon.shadow.mapSize.x,
    texelCm:+(100*(c.right-c.left)/moon.shadow.mapSize.x).toFixed(2), brightPx:hot });
})()`;

const TIME = (n) => `(function(){ return new Promise(res=>{
  const t=[]; let last=performance.now(), i=0;
  const step=()=>{ const now=performance.now(); t.push(now-last); last=now;
    if(++i<${n}) requestAnimationFrame(step);
    else { t.sort((a,b)=>a-b); res(String(t[t.length>>1].toFixed(1))); } };
  requestAnimationFrame(step); }); })()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=1.3; worldCfg.bounce=0.5; worldCfg.ambient=0;
    worldCfg.sunAzim=63; worldCfg.sunElev=34; worldCfg.ssao=0; worldCfg.baked=false; worldCfg.shadowDist=60;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  await P(`player.pos.set(60, 2, 60); if(player.vel) player.vel.set(0,0,0); 1`);
  await new Promise(r => setTimeout(r, 1800));
  const pp = JSON.parse(await P(`JSON.stringify([+player.pos.x.toFixed(2),+player.pos.z.toFixed(2)])`));
  const [cx, cz] = pp;
  await P(`buildRoomAt(${cx}, ${cz}, { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true,
    openings:[{ wall:'n', at:0, width:2.0, sill:0, height:2.1 }] }).length`);
  await new Promise(r => setTimeout(r, 2200));

  for (const px of [2048, 4096, 8192, 2048]) {
    await P(`moon.shadow.mapSize.set(${px}, ${px});
      if(moon.shadow.map){ moon.shadow.map.dispose(); moon.shadow.map = null; }
      _dirtyShadows(3); 1`);
    await new Promise(r => setTimeout(r, 1400));
    const leak = await P(MEASURE(cx, cz));
    const ms = await P(TIME(50));
    console.log('  near map ' + String(px).padEnd(5) + leak + '   median frame ' + ms + ' ms');
  }
}, { settleMs: 6000 });
