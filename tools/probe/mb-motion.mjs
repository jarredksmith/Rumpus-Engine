// Second hypothesis, after the first one died: the jaggedness only appears while MOVING, and comes from
// the VELOCITY BUFFER, which build 1246 made HALF RESOLUTION and whose own notes accept a silhouette
// artifact ("the half-res buffer's bilinear boundary mixing weapon and world velocity at the silhouette —
// the standard gather-blur edge artifact, accepted").
//
// The decisive A/B is not blur on/off — it is blur on WITH the velocity buffer vs blur on with build
// 1238's full-res analytic rotation fallback, at the SAME blur strength and the same motion. If the
// half-res buffer is the cause, forcing uVelOn=0 cleans the edge up without changing the amount of blur.
//
// Motion is driven per FRAME, not by wall clock: build 1246 lost a capture round to a setInterval spin
// that tripped the cut guard and zeroed the blur in both runs.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');

const SETUP = `(function(){
  let b = null;
  spawnProp('box', [300, 0, 300, 0,0,0, 6, 14, 6], o=>{ b = o; });
  applyPropColor(b, 0x2b3a4a);
  player.pos.set(300, 6, 316);
  worldCfg.autoExp = 0; worldCfg.postGrain = 0; worldCfg.postMotion = 0.62; applyWorldCfg();
  editorOpen = false;
  _adaptOn = false; _prStepI = 0; _prScale = 1; _hiFxOn = true; _hiFxFails = 0;
  _applyPixelRatio(); disposePost(); ensurePost();
  return { samples:_postRT.samples, pr:renderer.getPixelRatio() };
})()`;

// yaw a fixed amount PER FRAME for N frames, then hold the last pose so the screenshot is deterministic
const SPIN = (force) => `(function(){
  window.__spin = { n:0, force:${force} };
  const step = ()=>{
    const s = window.__spin; if(!s) return;
    camera.position.set(300, 6, 316);
    camera.rotation.set(0, Math.PI + (s.n * 0.010), 0, 'YXZ');   // ~0.6 deg/frame: real turning, well under the cut guard
    camera.updateMatrixWorld(true);
    if(s.force !== null) _matAfter.uniforms.uVelOn.value = s.force;
    if(++s.n < 40) requestAnimationFrame(step); else s.done = true;
  };
  requestAnimationFrame(step);
  return true;
})()`;

await withGame(async (P, page) => {
  console.log('pipeline ' + JSON.stringify(await P(SETUP)));

  const measure = async () => {
    fs.writeFileSync(path.join(DIR, 'mm.png'), await page.screenshot());
    return page.evaluate(async () => {
      const img = new Image(); img.src = '/mm.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const L = (x, y) => { const o = (y * img.width + x) * 4; return (d[o] + d[o+1] + d[o+2]) / 3; };
      // Along a vertical silhouette, find the edge x on each scanline. A clean edge moves smoothly from
      // scanline to scanline; a BLOCKY one jumps in steps. Mean |Δx| between neighbouring scanlines is the
      // jaggedness, and it is exactly what "rough jagged edges" describes.
      const xs = [];
      for (let y = Math.round(img.height * 0.15); y < Math.round(img.height * 0.5); y++) {
        let bx = -1, bd = 0;
        for (let x = Math.round(img.width * 0.15); x < Math.round(img.width * 0.85); x++) {
          const dd = Math.abs(L(x + 1, y) - L(x, y));
          if (dd > bd) { bd = dd; bx = x; }
        }
        if (bd >= 20) xs.push(bx);
      }
      let jag = 0; for (let i = 1; i < xs.length; i++) jag += Math.abs(xs[i] - xs[i-1]);
      // and the softness of the transition, as before
      return { scanlines: xs.length, edgeJaggedness: xs.length > 1 ? +(jag / (xs.length - 1)).toFixed(3) : null };
    });
  };

  for (const [label, mb, force] of [
      ['blur OFF                     ', 0, null],
      ['blur ON, velocity buffer     ', 0.62, null],
      ['blur ON, rotation fallback   ', 0.62, 0]]) {
    await P(`worldCfg.postMotion = ${mb}; applyWorldCfg(); 1`);
    await P(SPIN(force === null ? 'null' : force));
    await new Promise(r => setTimeout(r, 2500));
    const live = await P(`JSON.stringify({ amt:+_matAfter.uniforms.uAmt.value.toFixed(3), velOn:_matAfter.uniforms.uVelOn.value })`);
    console.log('\n' + label + live);
    console.log('  ' + JSON.stringify(await measure()));
  }
  await P('window.__spin = null; 1');
}, { settleMs: 4500 });
