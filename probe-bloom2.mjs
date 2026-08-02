// Does AUTO-EXPOSURE move the frame under a fixed bloom threshold? Same pose, same content, exposure the
// only variable — the three-pose run confounded exposure with what was in shot, so it could not answer this.
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
  const q=function(f){ return +L[Math.min(L.length-1,Math.floor(f*L.length))].toFixed(4); };
  return { exposure:+renderer.toneMappingExposure.toFixed(3), p90:q(0.9), p99:q(0.99), max:+L[L.length-1].toFixed(3),
           over062:over(0.62), over074:over(0.74) };
})()`;

await withGame(async (P, page) => {
  // pin the pose AND disable adaptation, so exposure is the only thing that moves
  await P("player.pos.set(0,EYE,30); player.yaw=0; player.pitch=0.2; worldCfg.autoExp=0; applyWorldCfg(); 1;");
  await page.waitForTimeout(3000);
  for (const ex of [1.0, 1.25, 1.6, 1.9]) {
    await P(`worldCfg.exposure=${ex}; applyWorldCfg(); 1;`);
    await page.waitForTimeout(2200);
    console.log(('authored exposure ' + ex).padEnd(24), JSON.stringify(await P(CODE)));
  }
}, { settleMs: 9000 });
