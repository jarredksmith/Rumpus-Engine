// Build 1292's claim: the SAME scene luminance blooms whatever the eye has adapted to.
// Drive the real _bloomThreshNow across the exposure sweep and measure coverage at the value it returns.
import { withGame } from './tools/probe/driver.mjs';

const CODE = `(function(){
  const rw=320, rh=180;
  const rt=new THREE.WebGLRenderTarget(rw,rh,{ type:THREE.FloatType, format:THREE.RGBAFormat, minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter });
  const old=renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const buf=new Float32Array(rw*rh*4); renderer.readRenderTargetPixels(rt,0,0,rw,rh,buf);
  renderer.setRenderTarget(old); rt.dispose();
  const L=[]; for(let i=0;i<rw*rh;i++){ const l=0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2]; if(isFinite(l)) L.push(l); }
  L.sort(function(a,b){return a-b;});
  const over=function(t){ let c=0; for(let i=0;i<L.length;i++) if(L[i]>t) c++; return +(100*c/L.length).toFixed(2); };
  // _expAuto is reset every frame when adaptation is off, so the live multiplier cannot be pinned from
  // outside. Sweep the AUTHORED exposure instead (which does stick) and ask the game's OWN _acesFit /
  // _acesFitInv for the threshold a level authored at 1.25 should use at this exposure — which is exactly
  // what _bloomThreshNow computes from _expBase.
  const th = _acesFit(_acesFitInv(0.62) * renderer.toneMappingExposure / 1.25);
  return { exposure:+renderer.toneMappingExposure.toFixed(3), threshPredicted:+th.toFixed(4),
           OLD_fixed062:over(0.62), NEW_adaptive:over(th) };
})()`;

await withGame(async (P, page) => {
  await P("player.pos.set(0,EYE,30); player.yaw=0; player.pitch=0.2; worldCfg.autoExp=0; worldCfg.exposure=1.25; applyWorldCfg(); 1;");
  await page.waitForTimeout(3000);
  for (const ex of [1.0, 1.25, 1.6, 1.9]) {
    await P(`worldCfg.exposure=${ex}; applyWorldCfg(); 1;`);
    await page.waitForTimeout(2200);
    console.log(('live exposure ' + ex).padEnd(20), JSON.stringify(await P(CODE)));
  }
}, { settleMs: 9000 });
