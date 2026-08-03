// vel-filter2's control proved `_matAfter` is not what presents the frame, which also means build 1342's
// four "blur does not harden an edge" measurements were made on a pass that may never have run. Before any
// further theory: WHICH post passes actually execute per frame? `_postQuad` is the fullscreen quad every
// pass renders through, so its onBeforeRender sees each one by identity.
import { withGame } from './driver.mjs';

const NAME = `(function(m){ return m===_matComp?'comp': m===_matAfter?'after(blur)': m===_matFXAA?'fxaa':
  m===_matCopy?'copy': (m&&m.name)||'other'; })`;

await withGame(async (P) => {
  console.log('setup ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false;
    _applyPixelRatio(); disposePost(); ensurePost(); JSON.stringify(_aaState())`));

  await P(`window.__spin=true; (function(){ let n=0; const step=()=>{ if(!window.__spin) return;
    camera.position.set(Math.sin(n*0.02)*2, 3.2, 30); camera.rotation.set(-0.05, n*0.010, 0, 'YXZ');
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })(); 1`);

  await P(`window.__c = {};
    _postQuad.onBeforeRender = function(r){
      const k = ${NAME}(_postQuad.material) + (r.getRenderTarget() ? '' : ' ->SCREEN');
      window.__c[k] = (window.__c[k]||0) + 1;
    }; 1`);

  for (const [tag, js] of [
      ['blur OFF ', 'worldCfg.postMotion = 0;    applyWorldCfg();'],
      ['blur 0.62', 'worldCfg.postMotion = 0.62; applyWorldCfg();'],
      ['blur 0.05', 'worldCfg.postMotion = 0.05; applyWorldCfg();']]) {
    await P(js + ' window.__c = {}; 1');
    await new Promise(r => setTimeout(r, 1500));
    const n = await P(`(function(){ let t=0; for(const k in window.__c) if(k.indexOf('comp')===0) t+=window.__c[k];
      const o={}; for(const k in window.__c) o[k] = +(window.__c[k]/Math.max(1,t)).toFixed(2);
      return JSON.stringify({ compFrames:t, perFrame:o,
        mbOn:(_postMotion*((typeof a11y!=='undefined')?a11y.blur:1))>0.01,
        velWant:(_postMotion>0.01 && _prStepI===0 && !!_velRT && !!_matVel),
        samples:_postRT.samples, fxaaExists:!!_matFXAA }); })()`);
    console.log('\n' + tag + '  ' + n);
  }
  await P(`_postQuad.onBeforeRender = function(){}; window.__spin=false; 1`);
}, { settleMs: 6000 });
