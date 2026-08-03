// Third run. post-passes.mjs found the reason the last control failed: under SwiftShader with MSAA and the
// full post chain this scene renders about ONE frame per second, so a 700 ms wall-clock wait screenshotted
// a frame drawn BEFORE the shader swap. Every wait here is on FRAMES ACTUALLY PRESENTED, counted through
// _postQuad's own onBeforeRender, and the control runs first.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');
const HDR = 'varying vec2 vUv; uniform sampler2D tNew; uniform sampler2D tVel; uniform float uVelOn;\n'
  + 'uniform mat3 uMbRot; uniform vec2 uTanF; uniform float uAmt; uniform float uShutter;\n';
const FS_CONST = HDR + 'void main(){ gl_FragColor = vec4(0.5, 0.0, 0.0, 1.0); }';
const FS_ALPHA = HDR + 'void main(){ float a = texture2D(tVel, vUv).a; gl_FragColor = vec4(a, a, a, 1.0); }';

await withGame(async (P, page) => {
  console.log('setup ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0.62;
    applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false;
    _applyPixelRatio(); disposePost(); ensurePost(); JSON.stringify(_aaState())`));

  await P(`window.__spin=true; (function(){ let n=0; const step=()=>{ if(!window.__spin) return;
    camera.position.set(Math.sin(n*0.02)*2, 3.2, 30); camera.rotation.set(-0.05, n*0.010, 0, 'YXZ');
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })();
    window.__pf = 0;
    _postQuad.onBeforeRender = function(r){ if(_postQuad.material === _matAfter && !r.getRenderTarget()) window.__pf++; };
    1`);

  // wait until N more frames have actually been PRESENTED through the blur pass
  const frames = async (n) => {
    const start = +await P('window.__pf');
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (+await P('window.__pf') >= start + n) return true;
    }
    return false;
  };

  const swap = (f) => P(`if(!window.__realFS) window.__realFS = _matAfter.fragmentShader;
    _matAfter.fragmentShader = ${JSON.stringify(f)}; _matAfter.needsUpdate = true; 1`);

  const hist = async () => {
    fs.writeFileSync(path.join(DIR, 'vf3.png'), await page.screenshot());
    return page.evaluate(async () => {
      const img = new Image(); img.src = '/vf3.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let n = 0, sum = 0, lo = 0, hi = 0, mid = 0;
      for (let y = Math.round(img.height * 0.25); y < Math.round(img.height * 0.92); y++)
        for (let x = 2; x < img.width - 2; x++) {
          const v = d[(y * img.width + x) * 4]; n++; sum += v;
          if (v <= 6) lo++; else if (v >= 249) hi++; else mid++;
        }
      return { mean: +(sum / n).toFixed(1), pctZero: +(100*lo/n).toFixed(1),
               pctOne: +(100*hi/n).toFixed(1), pctBETWEEN: +(100*mid/n).toFixed(2) };
    });
  };

  console.log('\nCONTROL — flat 0.5 red through _matAfter:');
  await swap(FS_CONST);
  console.log('  frames presented: ' + await frames(2));
  const ctl = await hist();
  console.log('  ' + JSON.stringify(ctl));
  const ok = ctl.mean > 110 && ctl.mean < 145;
  console.log(ok ? '  OK — the swap reaches the frame, so the readings below mean something.'
                 : '  !! still not reaching the frame — STOP, nothing below is evidence.');
  if (!ok) { await P(`_matAfter.fragmentShader=window.__realFS; _matAfter.needsUpdate=true; window.__spin=false; 1`); return; }

  for (const [tag, filt] of [['LinearFilter (as shipped)', 'THREE.LinearFilter'], ['NearestFilter', 'THREE.NearestFilter']]) {
    await swap(FS_ALPHA);
    await P(`_velRT.texture.minFilter=${filt}; _velRT.texture.magFilter=${filt}; _velRT.texture.needsUpdate=true; 1`);
    await frames(2);
    console.log('\n' + tag + ' — the velocity buffer\'s WRITTEN flag as the blur pass samples it:');
    console.log('  ' + JSON.stringify(await hist()));
  }

  await P(`_velRT.texture.minFilter=THREE.LinearFilter; _velRT.texture.magFilter=THREE.LinearFilter;
    _velRT.texture.needsUpdate=true; _matAfter.fragmentShader=window.__realFS; _matAfter.needsUpdate=true;
    _postQuad.onBeforeRender=function(){}; window.__spin=false; 1`);
}, { settleMs: 8000 });
