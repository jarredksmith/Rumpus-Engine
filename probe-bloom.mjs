// What fraction of a real frame actually crosses the bloom threshold?
// _postRT is MULTISAMPLED, so readRenderTargetPixels on it returns zeros (build 1152's failure #6, and
// build 1182 already had to blit through _matCopy for exactly this reason). So: render the live scene into
// our OWN single-sample target with the renderer's real tone mapping and exposure — which is what _postRT
// holds — and read that. WITH A CONTROL: a known clear colour read back through the identical path,
// because "all zeros" is indistinguishable from a broken instrument otherwise — and the first version of
// this probe DID read all zeros, control included, because a HalfFloat target read into a Float32Array
// yields nothing here. FloatType is the type that reads back.
import { withGame } from './tools/probe/driver.mjs';

const CODE = `(function(){
  const rw=320, rh=180;
  const rt=new THREE.WebGLRenderTarget(rw,rh,{ type:THREE.FloatType, format:THREE.RGBAFormat, minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter });
  const old=renderer.getRenderTarget();
  // ---- CONTROL: clear to a known value and read it back through the same call
  const cc=renderer.getClearColor(new THREE.Color()), ca=renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x808080, 1); renderer.clear(true,true,true);
  const ctl=new Float32Array(16); renderer.readRenderTargetPixels(rt,0,0,2,2,ctl);
  renderer.setClearColor(cc, ca);
  // ---- the frame, tone-mapped exactly as _postRT is
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const buf=new Float32Array(rw*rh*4);
  renderer.readRenderTargetPixels(rt,0,0,rw,rh,buf);
  renderer.setRenderTarget(old); rt.dispose();
  let n=0,sum=0,mx=0; const L=[];
  for(let i=0;i<rw*rh;i++){
    const l=0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2];
    if(!isFinite(l)) continue; n++; sum+=l; if(l>mx)mx=l; L.push(l);
  }
  L.sort(function(a,b){return a-b;});
  const q=function(f){ return +L[Math.min(L.length-1,Math.floor(f*L.length))].toFixed(4); };
  const over=function(t){ let c=0; for(let i=0;i<L.length;i++) if(L[i]>t) c++; return +(100*c/n).toFixed(3); };
  const th=_postThresh, knee=Math.max(1e-4,th*0.5);
  let energy=0; for(let i=0;i<L.length;i++){ const l=L[i];
    let s=Math.min(Math.max(l-th+knee,0),2*knee); s=s*s/(4*knee+1e-4);
    const w=Math.max(s, l-th); if(w>0) energy+=w; }
  return { CONTROL:[+ctl[0].toFixed(3),+ctl[1].toFixed(3),+ctl[2].toFixed(3)],
    tone:(renderer.toneMapping===THREE.ACESFilmicToneMapping?'ACES':renderer.toneMapping),
    thresh:+th.toFixed(3), bloomAmt:+_postBloom.toFixed(2), exposure:+renderer.toneMappingExposure.toFixed(3),
    mean:+(sum/n).toFixed(4), max:+mx.toFixed(3), q:{p50:q(0.5),p90:q(0.9),p99:q(0.99),p999:q(0.999)},
    pctOverThresh:over(th), meanBloomEnergy:+(energy/n).toFixed(5),
    sweep:{ '0.62':over(0.62), '0.66':over(0.66), '0.70':over(0.70), '0.74':over(0.74), '0.78':over(0.78), '0.82':over(0.82), '0.86':over(0.86) } };
})()`;

await withGame(async (P, page) => {
  const shot = async (label) => { await page.waitForTimeout(2200); console.log(label.padEnd(24), JSON.stringify(await P(CODE))); };
  await P("player.pos.set(0,EYE,30); player.yaw=0; player.pitch=0; 1;");
  await shot('stock, spawn');
  await P("player.pos.set(0,EYE,8); player.pitch=0; 1;");
  await shot('stock, near pillars');
  await P("player.pitch=0.5; 1;");
  await shot('stock, sky in frame');
}, { settleMs: 9000 });
