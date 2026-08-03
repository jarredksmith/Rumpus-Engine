// Build 1344, verified against the REAL `_matAfter` rather than a reconstruction of it: render the shipped
// blur's own direction field and measure the jump between adjacent pixels. The control is the same field
// with the branch removed, which is smooth by construction and therefore proves the metric can read a
// clean zero. Numbers must match vel-discont2's candidate (b): ~1.6 px max, ~46 pixels.
import { withGame } from './driver.mjs';

// This is _matAfter's OWN direction computation, lifted verbatim from the shipped shader — if it drifts
// from the source this probe stops describing the engine, which is why the test pins the source too.
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
  const mu=_matAfter.uniforms;
  const m=new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
    uniforms:{ tVel:{value:mu.tVel.value}, uMbRot:{value:mu.uMbRot.value}, uTanF:{value:mu.uTanF.value},
      uAmt:{value:mu.uAmt.value}, uShutter:{value:mu.uShutter.value}, uVelOn:{value:mu.uVelOn.value} },
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader:${JSON.stringify(BODY(pick))} });
  const rt=new THREE.WebGLRenderTarget(_compRT.width,_compRT.height,
    { minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, type:THREE.FloatType });
  const keep=_postQuad.material, prev=renderer.getRenderTarget();
  _postQuad.material=m; renderer.setRenderTarget(rt); renderer.render(_postScene,_postCam);
  const b=new Float32Array(rt.width*rt.height*4);
  renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,b);
  _postQuad.material=keep; renderer.setRenderTarget(prev); rt.dispose(); m.dispose();
  const W=rt.width,H=rt.height; let maxJ=0,big=0,n=0,sum=0;
  for(let y=0;y<H;y++) for(let x=0;x<W-1;x++){
    const i=(y*W+x)*4,j=i+4; const dx=b[j]-b[i],dy=b[j+1]-b[i+1];
    const k=Math.sqrt(dx*dx+dy*dy); n++; sum+=k; if(k>maxJ)maxJ=k; if(k>0.002)big++;
  }
  return JSON.stringify({ maxJumpPX:+(maxJ*W).toFixed(1), pixelsOver1_500:big, meanJump:+(sum/n).toExponential(2) });
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0.62; applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false;
    _applyPixelRatio(); disposePost(); ensurePost(); 1`);
  await P(`window.__spin=true; (function(){ let n=0; const step=()=>{ if(!window.__spin) return;
    camera.position.set(Math.sin(n*0.02)*2, 3.2, 30); camera.rotation.set(-0.05, n*0.010, 0, 'YXZ');
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })();
    window.__pf=0; _postQuad.onBeforeRender=function(r){ if(!r.getRenderTarget()) window.__pf++; }; 1`);
  for (let i = 0; i < 40 && +await P('window.__pf') < 3; i++) await new Promise(r => setTimeout(r, 500));

  console.log('state    ' + await P('JSON.stringify(_aaState())'));
  console.log('velRT    ' + await P(`JSON.stringify({ res:[_velRT.width,_velRT.height],
    minFilter:_velRT.texture.minFilter, magFilter:_velRT.texture.magFilter,
    NEAREST:THREE.NearestFilter, LINEAR:THREE.LinearFilter })`));

  console.log('\nCONTROL  the same field with no branch      ' + await P(RUN('dRot')));
  console.log('SHIPPED  as it now stands (build 1344)      ' + await P(RUN('(uVelOn > 0.5 && vv.a > 0.5) ? dVel : dRot')));

  // and the flag itself: with NEAREST there must be NOTHING between 0 and 1
  console.log('\nthe written-flag as the blur pass samples it:');
  console.log('  ' + await P(`(function(){
    const m=new THREE.ShaderMaterial({ depthTest:false, depthWrite:false, uniforms:{ tVel:{value:_velRT.texture} },
      vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader:'varying vec2 vUv; uniform sampler2D tVel; void main(){ float a=texture2D(tVel,vUv).a; gl_FragColor=vec4(a,a,a,1.0); }' });
    const rt=new THREE.WebGLRenderTarget(_compRT.width,_compRT.height,{ minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, type:THREE.FloatType });
    const keep=_postQuad.material, prev=renderer.getRenderTarget();
    _postQuad.material=m; renderer.setRenderTarget(rt); renderer.render(_postScene,_postCam);
    const b=new Float32Array(rt.width*rt.height*4);
    renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,b);
    _postQuad.material=keep; renderer.setRenderTarget(prev); rt.dispose(); m.dispose();
    let z=0,o=0,mid=0,n=0; for(let i=0;i<b.length;i+=4){ const v=b[i]; n++;
      if(v<=0.002)z++; else if(v>=0.998)o++; else mid++; }
    return JSON.stringify({ pctUnwritten:+(100*z/n).toFixed(2), pctWritten:+(100*o/n).toFixed(2),
      pctINVENTED:+(100*mid/n).toFixed(3) }); })()`));

  await P(`_postQuad.onBeforeRender=function(){}; window.__spin=false; 1`);
}, { settleMs: 8000 });
