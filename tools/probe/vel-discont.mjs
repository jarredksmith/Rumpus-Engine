// The blur's direction field, measured for CONTINUITY — which is the property that decides whether a pass
// hardens an edge, and it has a right answer rather than needing a judgement about a picture.
//
// `_matAfter` picks its blur direction with a hard branch:  if(vv.a > 0.5) velocity-path else rotation-path.
// `vv.a` is sampled from a HALF-RES buffer, so vel-filter4 measured it coming back as 0.75 / 0.25 on 0.74%
// of the frame — the silhouettes. Those neighbouring pixels therefore take ENTIRELY DIFFERENT directions
// (the rotation path ignores camera translation and object motion altogether), quantised to 2 screen
// pixels, after the MSAA resolve. This renders `d` itself and measures the jump between adjacent pixels,
// for the shipped branch and for a continuous mix() of the same two terms.
import { withGame } from './driver.mjs';

const BODY = (pick) => `
varying vec2 vUv; uniform sampler2D tVel; uniform mat3 uMbRot; uniform vec2 uTanF;
uniform float uAmt; uniform float uShutter; uniform float uVelOn;
void main(){
  vec4 vv = texture2D(tVel, vUv);
  vec2 dVel = (vv.rg - 0.5) * 0.25 * uAmt * uShutter;
  vec3 v = vec3((vUv*2.0-1.0)*uTanF, -1.0);
  vec3 vp = uMbRot * v;
  vec2 uvPrev = (vp.xy / max(0.05, -vp.z)) / uTanF * 0.5 + 0.5;
  vec2 dRot = (vUv - uvPrev) * uAmt * uShutter;
  vec2 d = ${pick};
  gl_FragColor = vec4(d, 0.0, 1.0);
}`;

const RUN = (pick) => `(function(){
  const mu = _matAfter.uniforms;
  const m = new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
    uniforms:{ tVel:{value: mu.tVel.value}, uMbRot:{value: mu.uMbRot.value}, uTanF:{value: mu.uTanF.value},
               uAmt:{value: mu.uAmt.value}, uShutter:{value: mu.uShutter.value}, uVelOn:{value: mu.uVelOn.value} },
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader:${JSON.stringify('')} + ${JSON.stringify(BODY(pick))} });
  const rt = new THREE.WebGLRenderTarget(_compRT.width, _compRT.height,
    { minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, type:THREE.FloatType });
  const keep=_postQuad.material, prev=renderer.getRenderTarget();
  _postQuad.material=m; renderer.setRenderTarget(rt); renderer.render(_postScene,_postCam);
  const b=new Float32Array(rt.width*rt.height*4);
  renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,b);
  _postQuad.material=keep; renderer.setRenderTarget(prev); rt.dispose(); m.dispose();
  const W=rt.width, H=rt.height, jumps=[];
  let maxJ=0, big=0, n=0;
  for(let y=0;y<H;y++) for(let x=0;x<W-1;x++){
    const i=(y*W+x)*4, j=i+4;
    const dx=b[j]-b[i], dy=b[j+1]-b[i+1];
    const k=Math.sqrt(dx*dx+dy*dy); n++;
    if(k>maxJ) maxJ=k;
    if(k>0.002) big++;                       // > 1/500 of the screen between two ADJACENT pixels
    if(jumps.length<400000) jumps.push(k);
  }
  jumps.sort((p,q)=>p-q);
  const q=(f)=>+jumps[Math.min(jumps.length-1,Math.floor(jumps.length*f))].toFixed(5);
  return JSON.stringify({ uAmt:+mu.uAmt.value.toFixed(3), velOn:mu.uVelOn.value,
    maxAdjacentJump:+maxJ.toFixed(5), p999:q(0.999), p9999:q(0.9999),
    pixelsWithHardJump:big, pctHardJump:+(100*big/n).toFixed(3) });
})()`;

await withGame(async (P) => {
  console.log('setup ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0.62;
    applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false;
    _applyPixelRatio(); disposePost(); ensurePost(); JSON.stringify(_aaState())`));
  await P(`window.__spin=true; (function(){ let n=0; const step=()=>{ if(!window.__spin) return;
    camera.position.set(Math.sin(n*0.02)*2, 3.2, 30); camera.rotation.set(-0.05, n*0.010, 0, 'YXZ');
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })();
    window.__pf=0; _postQuad.onBeforeRender=function(r){ if(!r.getRenderTarget()) window.__pf++; }; 1`);
  for (let i = 0; i < 40 && +await P('window.__pf') < 3; i++) await new Promise(r => setTimeout(r, 500));
  console.log('presented frames: ' + await P('window.__pf'));

  console.log('\nCONTROL — rotation path alone (one continuous expression, no branch anywhere):');
  console.log('  ' + await P(RUN('dRot')));
  console.log('\nSHIPPED — hard branch on a bilinearly sampled flag:');
  console.log('  ' + await P(RUN('(uVelOn > 0.5 && vv.a > 0.5) ? dVel : dRot')));
  console.log('\nCANDIDATE — mix() the same two terms by that same flag:');
  console.log('  ' + await P(RUN('mix(dRot, dVel, uVelOn > 0.5 ? vv.a : 0.0)')));

  await P(`_postQuad.onBeforeRender=function(){}; window.__spin=false; 1`);
}, { settleMs: 8000 });
