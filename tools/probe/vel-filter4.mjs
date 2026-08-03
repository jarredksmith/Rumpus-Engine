// Fourth run, and the instrument changes rather than the hypothesis. Runs 1-3 all went through
// page.screenshot(): run 1 had no control and lied, run 2's control caught a stale frame, and run 3 waited
// on REAL presented frames and the control STILL failed — a flat 0.5 red painted through the presenting
// pass came back as mean 83. So the page screenshot is not a faithful read of this canvas and no amount of
// waiting fixes that.
//
// So: no screenshot, no compositor, no DOM. Render the question into a render target with the engine's own
// fullscreen quad and read it back with readRenderTargetPixels. The question is exactly one thing — what
// does `texture2D(tVel, vUv).a` return at FULL-RES uvs, given _velRT is HALF res? A full-res pixel samples
// at +-0.25 of a half-res texel from its centre, so under LinearFilter bilinear must return a 0.75/0.25
// mix of two texels and can never return a pure 0 or 1 at any boundary. Under NearestFilter it must return
// exactly 0 or 1 everywhere. That is a property with a right answer, not a judgement about a picture.
import { withGame } from './driver.mjs';

const PROBE = (filt) => `(function(){
  const T = _velRT.texture;
  T.minFilter = ${filt}; T.magFilter = ${filt}; T.needsUpdate = true;
  const m = new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
    uniforms:{ tVel:{ value:T } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform sampler2D tVel; void main(){ float a=texture2D(tVel,vUv).a; gl_FragColor=vec4(a,a,a,1.0); }' });
  const rt = new THREE.WebGLRenderTarget(_compRT.width, _compRT.height,
    { minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, type:THREE.FloatType });
  const keep = _postQuad.material, prev = renderer.getRenderTarget();
  _postQuad.material = m; renderer.setRenderTarget(rt); renderer.render(_postScene, _postCam);
  const buf = new Float32Array(rt.width * rt.height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  _postQuad.material = keep; renderer.setRenderTarget(prev);
  rt.dispose(); m.dispose();
  let zero=0, one=0, mid=0, n=0, minv=9, maxv=-9;
  const bins = {};
  for(let i=0;i<buf.length;i+=4){
    const v = buf[i]; n++;
    if(v < minv) minv = v; if(v > maxv) maxv = v;
    if(v <= 0.002) zero++; else if(v >= 0.998) one++; else { mid++; const k=v.toFixed(2); bins[k]=(bins[k]||0)+1; }
  }
  const top = Object.keys(bins).sort((a,b)=>bins[b]-bins[a]).slice(0,6)
    .map(k=>k+': '+(100*bins[k]/n).toFixed(2)+'%');
  return JSON.stringify({ res:[rt.width,rt.height], velRes:[_velRT.width,_velRT.height],
    pctUnwritten:+(100*zero/n).toFixed(2), pctWritten:+(100*one/n).toFixed(2),
    pctBETWEEN:+(100*mid/n).toFixed(2), min:+minv.toFixed(3), max:+maxv.toFixed(3),
    commonestIntermediates: top });
})()`;

await withGame(async (P) => {
  console.log('setup ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0.62;
    applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false;
    _applyPixelRatio(); disposePost(); ensurePost(); JSON.stringify(_aaState())`));

  // real per-frame motion, or the velocity buffer is all zeros and the question is meaningless
  await P(`window.__spin=true; (function(){ let n=0; const step=()=>{ if(!window.__spin) return;
    camera.position.set(Math.sin(n*0.02)*2, 3.2, 30); camera.rotation.set(-0.05, n*0.010, 0, 'YXZ');
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })();
    window.__pf=0; _postQuad.onBeforeRender = function(r){ if(!r.getRenderTarget()) window.__pf++; }; 1`);
  for (let i = 0; i < 40 && +await P('window.__pf') < 3; i++) await new Promise(r => setTimeout(r, 500));
  console.log('presented frames: ' + await P('window.__pf'));

  // CONTROL: the velocity buffer must actually contain written pixels, or "0% between" proves nothing
  console.log('\nvelocity buffer contents (control — there must be BOTH written and unwritten texels):');
  console.log('  ' + await P(`(function(){
    const buf = new Float32Array(_velRT.width*_velRT.height*4);
    renderer.readRenderTargetPixels(_velRT, 0, 0, _velRT.width, _velRT.height, buf);
    let z=0,o=0,m=0; for(let i=3;i<buf.length;i+=4){ const a=buf[i]; if(a<=0.002)z++; else if(a>=0.998)o++; else m++; }
    const n=z+o+m; return JSON.stringify({ storedUnwritten:+(100*z/n).toFixed(1),
      storedWritten:+(100*o/n).toFixed(1), storedBetween:+(100*m/n).toFixed(2) }); })()`));

  console.log('\nsampled at FULL-RES uvs, LinearFilter (as shipped):');
  console.log('  ' + await P(PROBE('THREE.LinearFilter')));
  console.log('\nsampled at FULL-RES uvs, NearestFilter:');
  console.log('  ' + await P(PROBE('THREE.NearestFilter')));

  await P(`_velRT.texture.minFilter=THREE.LinearFilter; _velRT.texture.magFilter=THREE.LinearFilter;
    _velRT.texture.needsUpdate=true; _postQuad.onBeforeRender=function(){}; window.__spin=false; 1`);
}, { settleMs: 8000 });
