// vel-filter.mjs reported 44.5% "invented" alpha under BOTH LinearFilter and NearestFilter — identical
// to two decimal places. Two filters cannot agree exactly, so the debug shader was not reaching the frame
// and I was measuring an ordinary game screenshot. This run carries a CONTROL: paint a constant first and
// prove the swap takes before believing anything downstream.
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
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })(); 1`);
  await new Promise(r => setTimeout(r, 700));

  const swap = (fs_) => P(`if(!window.__realFS) window.__realFS = _matAfter.fragmentShader;
    _matAfter.fragmentShader = ${JSON.stringify(fs_)}; _matAfter.needsUpdate = true;
    JSON.stringify({ took: _matAfter.fragmentShader.indexOf('gl_FragColor') >= 0,
                     mbOn: (_postMotion*((typeof a11y!=='undefined')?a11y.blur:1))>0.01 })`);

  const hist = async (tag) => {
    await new Promise(r => setTimeout(r, 700));
    fs.writeFileSync(path.join(DIR, 'vf2.png'), await page.screenshot());
    const r = await page.evaluate(async () => {
      const img = new Image(); img.src = '/vf2.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const b = new Array(9).fill(0); let n = 0, sum = 0;
      for (let y = Math.round(img.height * 0.25); y < Math.round(img.height * 0.9); y++)
        for (let x = 2; x < img.width - 2; x++) {
          const v = d[(y * img.width + x) * 4]; n++; sum += v; b[Math.min(8, v >> 5)]++;
        }
      return { n, mean: +(sum / n).toFixed(1), bins32: b.map(v => +(100 * v / n).toFixed(1)) };
    });
    console.log('  ' + tag + '  ' + JSON.stringify(r));
    return r;
  };

  console.log('\nCONTROL — paint a flat 0.5 red:');
  console.log('  swap ' + await swap(FS_CONST));
  const ctl = await hist('const 0.5');
  if (ctl.mean < 110 || ctl.mean > 145) {
    console.log('  !! the swap is NOT reaching the frame — everything below would be an ordinary screenshot');
  } else {
    console.log('  OK: _matAfter really is what presents, and the swap takes.');
  }

  for (const [tag, filt] of [['LinearFilter (shipped)', 'THREE.LinearFilter'], ['NearestFilter', 'THREE.NearestFilter']]) {
    await swap(FS_ALPHA);
    await P(`_velRT.texture.minFilter=${filt}; _velRT.texture.magFilter=${filt}; _velRT.texture.needsUpdate=true; 1`);
    console.log('\n' + tag + ' — sampled velocity ALPHA (0 = unwritten, 1 = written):');
    const h = await hist('alpha');
    console.log('  strictly between (the sampler inventing a flag that is in neither texel): '
      + (h.bins32.slice(1, 8).reduce((a, b) => a + b, 0)).toFixed(1) + '%');
  }

  await P(`_velRT.texture.minFilter=THREE.LinearFilter; _velRT.texture.magFilter=THREE.LinearFilter;
    _velRT.texture.needsUpdate=true;
    _matAfter.fragmentShader = window.__realFS; _matAfter.needsUpdate = true; window.__spin=false; 1`);
}, { settleMs: 6000 });
