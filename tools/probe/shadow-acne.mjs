// room-leak7 found the corner leak's remaining lever: `moon.shadow.bias`, shipped at -0.0004. Measured in a
// sealed room, with the sun the only light and everything stated per row:
//
//   shadow.bias   0      -0.0001   -0.0004(shipped)   -0.0005   -0.002   -0.008   -0.03
//   leaking px    151      208          354             404      1500     7417    25986
//   peak        0.087    0.106        0.144           0.152     0.156    0.156    0.156
//
// Monotonic: a more negative depth bias leaks more. But a negative depth bias is there to prevent ACNE, and
// build 1341 recorded acne as unmeasured. So this is the control that decides whether it can go — a large
// flat surface under a LOW sun, which is the worst case for acne, with the fraction of pixels wrongly in
// shadow as the metric. A leak fix that trades a corner line for a speckled field is not a fix.
import { withGame } from './driver.mjs';

const SHOT = (el, db, nb) => `(function(){
  worldCfg.sunElev = ${el}; applyWorldCfg();
  moon.shadow.bias = ${db}; if(typeof moonFar!=='undefined'&&moonFar) moonFar.shadow.bias = ${db};
  ${nb === null ? '' : `moon.shadow.normalBias = ${nb}; if(typeof moonFar!=='undefined'&&moonFar) moonFar.shadow.normalBias = ${nb};`}
  renderer.shadowMap.needsUpdate = true;
  scene.environment = null;
  // stand back and look down at open ground: a big flat lit surface with nothing casting onto it
  camera.position.set(${'ORIGIN_X'}, 14, ${'ORIGIN_Z'}); camera.rotation.set(-0.95, 0.7, 0, 'YXZ'); camera.updateMatrixWorld(true);
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
  const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  const b=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,b);
  renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
  const Y=[]; for(let i=0;i<b.length;i+=4) Y.push(0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]);
  const s=Y.slice().sort((p,q)=>p-q); const p90=s[Math.floor(s.length*0.9)], p50=s[Math.floor(s.length*0.5)];
  // ACNE = a pixel far darker than the lit level around it. On a clean render the histogram is bimodal
  // (lit ground / genuinely shadowed props); acne fills the gap with isolated dark speckle, so count
  // pixels that are dark AND whose 4 neighbours are lit — a real shadow has dark neighbours.
  let speckle=0, lit=0;
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
    const i=y*W+x, v=Y[i];
    if(v > p90*0.6){ lit++; continue; }
    const n=[Y[i-1],Y[i+1],Y[i-W],Y[i+W]].filter(u=>u>p90*0.6).length;
    if(n>=3) speckle++;
  }
  return JSON.stringify({ p50:+p50.toFixed(4), p90:+p90.toFixed(4), litPx:lit,
    ACNE_speckle:speckle, pctSpeckle:+(100*speckle/(W*H)).toFixed(3) });
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=0; worldCfg.bounce=0; worldCfg.ambient=0;
    worldCfg.sunAzim=63; worldCfg.ssao=0; worldCfg.baked=false; worldCfg.shadowDist=60;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  await P(`player.pos.set(0, 3, 0); if(player.vel) player.vel.set(0,0,0); 1`);
  await new Promise(r => setTimeout(r, 2000));
  const pp = JSON.parse(await P(`JSON.stringify([+player.pos.x.toFixed(2),+player.pos.z.toFixed(2)])`));
  console.log('player ' + JSON.stringify(pp) + '   (stock level geometry, sun the only light)');
  const S = (el, db, nb) => SHOT(el, db, nb).replace(/ORIGIN_X/g, String(pp[0])).replace(/ORIGIN_Z/g, String(pp[1]));

  for (const el of [8, 20, 45]) {
    console.log('\nsun elevation ' + el + ' deg' + (el === 8 ? '   <- the worst case for acne' : ''));
    for (const db of [0, -0.0001, -0.0004, -0.002]) {
      await P(S(el, db, null) + '; 1'); await new Promise(r => setTimeout(r, 500));
      console.log('  shadow.bias ' + String(db).padEnd(9) + await P(S(el, db, null)));
    }
    // and the same with normalBias removed, to show it is normalBias (build 1341) doing the acne work
    await P(S(el, 0, 0) + '; 1'); await new Promise(r => setTimeout(r, 500));
    console.log('  bias 0 AND normalBias 0  ' + await P(S(el, 0, 0)));
  }
}, { settleMs: 6000 });
