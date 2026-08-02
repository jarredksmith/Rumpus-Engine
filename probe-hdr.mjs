// How much dynamic range does a real frame actually carry, in scene-linear space?
// The rendering audit's headline claim is that ACES applies inside every material, so the post chain sees
// already-tone-mapped values and bloom cannot tell a 3x lamp from a 1000x sun. That is true of the CODE.
// Whether it MATTERS depends on whether the content has the range — so measure before rebuilding anything.
import { withGame } from './tools/probe/driver.mjs';

const HIST = `(function(){
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{ type:THREE.FloatType, format:THREE.RGBAFormat, minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter });
  const tm=renderer.toneMapping, en=renderer.outputEncoding, old=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.outputEncoding=THREE.LinearEncoding;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const buf=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,buf);
  renderer.setRenderTarget(old); renderer.toneMapping=tm; renderer.outputEncoding=en; rt.dispose();
  let n=0, mx=0, sum=0; const vals=[];
  for(let i=0;i<W*H;i++){
    const L=0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2];
    if(!isFinite(L)) continue;
    n++; sum+=L; if(L>mx) mx=L; vals.push(L);
  }
  vals.sort(function(a,b){return a-b;});
  const q=function(f){ return +vals[Math.min(vals.length-1,Math.floor(f*vals.length))].toFixed(4); };
  const over=function(t){ let c=0; for(let i=0;i<vals.length;i++) if(vals[i]>t) c++; return +(100*c/n).toFixed(2); };
  return { mean:+(sum/n).toFixed(4), max:+mx.toFixed(2),
    over:{ '1':over(1), '2':over(2), '4':over(4), '8':over(8), '16':over(16) },
    q:{ p50:q(0.5), p90:q(0.9), p99:q(0.99), p999:q(0.999) } };
})()`;

await withGame(async (P, page) => {
  const shot = async (label) => { await page.waitForTimeout(2200); console.log(label.padEnd(20), JSON.stringify(await P(HIST))); };
  await P("player.pos.set(0,EYE,30); player.yaw=0; player.pitch=0; 1;");
  await shot('stock, spawn');
  await P("player.pitch=0.5; 1;");
  await shot('stock, sky in frame');
  await P("player.pitch=0; player.pos.set(0,EYE,8); 1;");
  await shot('stock, near pillars');
  // and with a genuinely bright source, to show what the range WOULD be if content had it
  await P("worldCfg.sun=8; applyWorldCfg(); 1;");
  await shot('sun 8 (5.3x)');
}, { settleMs: 8000 });
