// vel-discont measured the shipped blur's direction field jumping 0.024 of the screen (15 px of sampling
// offset) between two ADJACENT pixels, on 492 of them — the silhouettes — while the same field with no
// branch in it is perfectly smooth. A plain mix() halves it. This run looks for the right fix rather than
// the first one, with the no-branch control still in the list as the floor.
import { withGame } from './driver.mjs';

const BODY = (pick) => `
varying vec2 vUv; uniform sampler2D tVel; uniform mat3 uMbRot; uniform vec2 uTanF;
uniform float uAmt; uniform float uShutter; uniform float uVelOn; uniform vec2 uVelTexel;
void main(){
  vec4 vv = texture2D(tVel, vUv);
  vec2 dVel = (vv.rg - 0.5) * 0.25 * uAmt * uShutter;
  vec3 v = vec3((vUv*2.0-1.0)*uTanF, -1.0);
  vec3 vp = uMbRot * v;
  vec2 uvPrev = (vp.xy / max(0.05, -vp.z)) / uTanF * 0.5 + 0.5;
  vec2 dRot = (vUv - uvPrev) * uAmt * uShutter;
  // nearest-equivalent: snap to the half-res texel centre, so the flag is a real 0/1 and rg is one surface
  vec2 snap = (floor(vUv / uVelTexel) + 0.5) * uVelTexel;
  vec4 vs = texture2D(tVel, snap);
  vec2 dVelS = (vs.rg - 0.5) * 0.25 * uAmt * uShutter;
  // DILATION: the largest written velocity in the 3x3 half-res neighbourhood. A moving object's blur
  // should bleed OVER its own silhouette rather than being cut off by the static background behind it.
  vec2 best = vec2(0.0); float bestL = -1.0; float anyW = 0.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec4 s = texture2D(tVel, snap + vec2(float(i), float(j)) * uVelTexel);
    vec2 sd = (s.rg - 0.5) * 0.25 * uAmt * uShutter;
    float l = length(sd) * step(0.5, s.a);
    anyW = max(anyW, s.a);
    if(l > bestL){ bestL = l; best = sd; }
  }
  vec2 d = ${pick};
  gl_FragColor = vec4(d, 0.0, 1.0);
}`;

const RUN = (pick) => `(function(){
  const mu = _matAfter.uniforms;
  const m = new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
    uniforms:{ tVel:{value:mu.tVel.value}, uMbRot:{value:mu.uMbRot.value}, uTanF:{value:mu.uTanF.value},
      uAmt:{value:mu.uAmt.value}, uShutter:{value:mu.uShutter.value}, uVelOn:{value:mu.uVelOn.value},
      uVelTexel:{value:new THREE.Vector2(1/_velRT.width, 1/_velRT.height)} },
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
  return JSON.stringify({ maxJumpUV:+maxJ.toFixed(5), maxJumpPX:+(maxJ*W).toFixed(1),
    pixelsOver1_500:big, meanJump:+(sum/n).toExponential(2) });
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
  console.log('presented frames: ' + await P('window.__pf') + '   state ' + await P('JSON.stringify(_aaState())'));

  for (const [tag, pick] of [
    ['CONTROL  rotation only, no branch at all ', 'dRot'],
    ['SHIPPED  hard branch on a sampled flag   ', '(uVelOn > 0.5 && vv.a > 0.5) ? dVel : dRot'],
    ['(a)      mix() by the sampled flag       ', 'mix(dRot, dVel, uVelOn > 0.5 ? vv.a : 0.0)'],
    ['(b)      snap to texel centre (nearest)  ', '(uVelOn > 0.5 && vs.a > 0.5) ? dVelS : dRot'],
    ['(c)      3x3 dilate, then hard branch    ', '(uVelOn > 0.5 && anyW > 0.5) ? best : dRot'],
    ['(d)      3x3 dilate, then mix() by flag  ', 'mix(dRot, best, uVelOn > 0.5 ? vv.a : 0.0)']])
    console.log(tag + '  ' + await P(RUN(pick)));

  await P(`_postQuad.onBeforeRender=function(){}; window.__spin=false; 1`);
}, { settleMs: 8000 });
