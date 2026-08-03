// The reporter's readout: AA MSAA x4, render 1.00/1.00, rung 0, +blur — and still jagged. So MSAA IS
// reaching the frame at native resolution, and whatever hardens the edge happens AFTER the resolve, in
// the post chain. The only thing they change is motion blur.
//
// `_matAfter` reads `tVel` (= _velRT, HALF RES, LinearFilter) and branches on `vv.a > 0.5`. A full-res
// pixel samples the half-res buffer at +-0.25 of a texel from its centre, so bilinear ALWAYS returns a
// 0.75/0.25 mix of two texels — never a pure one. At a silhouette that makes the written-flag come back
// as 0.75 or 0.25, and the hard threshold then flips between two completely unrelated blur directions
// along a boundary quantised to 2 screen pixels.
//
// This probe does not measure the frame (five image metrics have already lied to me in this file). It
// renders the SHADER'S OWN DECISION: replace the blur's fragment shader with one that outputs the sampled
// alpha as luminance, and count pixels where the sampler invented a value that is in neither texel.
// With NearestFilter that count must be exactly zero. That is a property, not a judgement.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');

const DEBUG_FS = `
varying vec2 vUv; uniform sampler2D tNew; uniform sampler2D tVel; uniform float uVelOn;
uniform mat3 uMbRot; uniform vec2 uTanF; uniform float uAmt; uniform float uShutter;
void main(){
  float a = texture2D(tVel, vUv).a;
  gl_FragColor = vec4(a, a, a, 1.0);
}`;

await withGame(async (P, page) => {
  console.log('setup ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0.62;
    applyWorldCfg(); editorOpen=false;
    _adaptOn=false; _prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false;
    _applyPixelRatio(); disposePost(); ensurePost();
    JSON.stringify(_aaState())`));

  // real per-frame motion, or nothing writes a velocity at all
  await P(`window.__spin=true; (function(){ let n=0; const step=()=>{ if(!window.__spin) return;
    camera.position.set(Math.sin(n*0.02)*2, 3.2, 30); camera.rotation.set(-0.05, n*0.010, 0, 'YXZ');
    camera.updateMatrixWorld(true); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })(); 1`);
  await new Promise(r => setTimeout(r, 800));

  console.log('velocity buffer ' + await P(`JSON.stringify({
    velWant: _postMotion>0.01 && _prStepI===0 && !!_velRT && !!_matVel,
    velRes: _velRT ? [_velRT.width, _velRT.height] : null,
    postRes: _postSize(),
    minFilter: _velRT.texture.minFilter, magFilter: _velRT.texture.magFilter,
    LINEAR: THREE.LinearFilter, NEAREST: THREE.NearestFilter })`));

  await P(`window.__realFS = _matAfter.fragmentShader;
    _matAfter.fragmentShader = ${JSON.stringify(DEBUG_FS)}; _matAfter.needsUpdate = true; 1`);

  const count = async () => {
    await new Promise(r => setTimeout(r, 600));
    fs.writeFileSync(path.join(DIR, 'vf.png'), await page.screenshot());
    return page.evaluate(async () => {
      const img = new Image(); img.src = '/vf.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let zero = 0, one = 0, mid = 0, n = 0;
      // skip the HUD strip at the top-left; sample the world
      for (let y = Math.round(img.height * 0.25); y < Math.round(img.height * 0.9); y++)
        for (let x = 2; x < img.width - 2; x++) {
          const v = d[(y * img.width + x) * 4]; n++;
          if (v <= 6) zero++; else if (v >= 249) one++; else mid++;
        }
      return { sampled: n, written: one, unwritten: zero,
               INVENTED: mid, pctInvented: +(100 * mid / n).toFixed(2) };
    });
  };

  console.log('\nLinearFilter (as shipped):');
  console.log('  ' + JSON.stringify(await count()));

  await P(`_velRT.texture.minFilter = THREE.NearestFilter; _velRT.texture.magFilter = THREE.NearestFilter;
    _velRT.texture.needsUpdate = true; 1`);
  console.log('\nNearestFilter:');
  console.log('  ' + JSON.stringify(await count()));

  await P(`_matAfter.fragmentShader = window.__realFS; _matAfter.needsUpdate = true; window.__spin=false; 1`);
}, { settleMs: 6000 });
