// Third attempt, on the reported conditions rather than a convenient synthetic one:
//   * the DEFAULT level's own geometry, not a box I spawned in an empty field
//   * screenshot MID-MOTION, with the spin still running — the previous probe photographed the frame after
//     the spin had stopped, where the blur is back to zero and the two conditions are identical by
//     construction (they measured 21.472 both times, which should have been the tell)
//   * a tracked edge: follow the silhouette from one scanline to the next instead of re-searching for the
//     strongest gradient each time, which hopped between different edges of the same box
//
// The A/B is the velocity buffer, disabled at SOURCE by nulling _matVel (so _velWant goes false and the
// shader takes build 1238's full-res analytic rotation path) rather than by writing uVelOn, which
// _renderPostFX overwrites every frame.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');

const SETUP = `(function(){
  worldCfg.autoExp = 0; worldCfg.postGrain = 0; applyWorldCfg();
  editorOpen = false;
  _adaptOn = false; _prStepI = 0; _prScale = 1; _hiFxOn = true; _hiFxFails = 0;
  _applyPixelRatio(); disposePost(); ensurePost();
  window.__savedVel = _matVel;
  return { samples:_postRT.samples, pr:renderer.getPixelRatio(), props:propModels.length };
})()`;

// spin forever until stopped, so the screenshot lands MID-motion
const SPIN = `(function(){
  window.__spin = true;
  let n = 0;
  const step = ()=>{
    if(!window.__spin) return;
    camera.position.set(0, 3.2, 30);
    camera.rotation.set(-0.05, n * 0.012, 0, 'YXZ');    // ~0.7 deg/frame, well under the cut guard
    camera.updateMatrixWorld(true);
    n++; requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return true;
})()`;

await withGame(async (P, page) => {
  console.log('pipeline ' + JSON.stringify(await P(SETUP)));
  await P(SPIN);

  const measure = async () => {
    fs.writeFileSync(path.join(DIR, 'md.png'), await page.screenshot());
    return page.evaluate(async () => {
      const img = new Image(); img.src = '/md.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const L = (x, y) => { const o = (y * img.width + x) * 4; return (d[o] + d[o+1] + d[o+2]) / 3; };
      // Every strong vertical transition in the upper half of the frame, wherever it is: for each, does the
      // pixel run across it contain an intermediate value (antialiased) or step straight over (hard)?
      let soft = 0, hard = 0;
      const y0 = Math.round(img.height * 0.2), y1 = Math.round(img.height * 0.55);
      for (let y = y0; y < y1; y += 1) {
        for (let x = Math.round(img.width * 0.1); x < Math.round(img.width * 0.9); x++) {
          const a = L(x, y), b = L(x + 1, y);
          if (Math.abs(b - a) < 30) continue;                       // not a silhouette
          // The intermediate pixel of an antialiased edge IS one of the two forming the transition, not a
          // neighbour of them. Take the PLATEAUS from further out and count how many pixels across the
          // transition lie strictly between — the previous version looked at x-1 and x+2, which are the
          // plateaus themselves, so it called every antialiased edge hard and reported 91%.
          const p0 = L(x - 2, y), p1 = L(x + 3, y);
          const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
          if (hi - lo < 30) continue;
          let mid = 0;
          for (let i = -1; i <= 2; i++) { const v = L(x + i, y); if (v > lo + (hi - lo) * 0.15 && v < hi - (hi - lo) * 0.15) mid++; }
          if (mid > 0) soft++; else hard++;
          x += 3;                                                    // don't count the same edge twice
        }
      }
      const n = soft + hard;
      return { edges: n, antialiased: soft, hardStep: hard, pctHard: n ? +(100 * hard / n).toFixed(1) : null };
    });
  };

  for (const [label, js] of [
      ['blur OFF                   ', 'worldCfg.postMotion = 0; applyWorldCfg(); _matVel = window.__savedVel;'],
      ['blur 0.62, velocity buffer ', 'worldCfg.postMotion = 0.62; applyWorldCfg(); _matVel = window.__savedVel;'],
      ['blur 0.62, rotation only   ', 'worldCfg.postMotion = 0.62; applyWorldCfg(); _matVel = null;']]) {
    await P(js + ' 1');
    await new Promise(r => setTimeout(r, 1600));
    const live = await P(`JSON.stringify({ amt:+_matAfter.uniforms.uAmt.value.toFixed(3), velOn:_matAfter.uniforms.uVelOn.value, samples:_postRT.samples })`);
    console.log('\n' + label + live);
    console.log('  ' + JSON.stringify(await measure()));
  }
  await P('window.__spin = false; _matVel = window.__savedVel; 1');
}, { settleMs: 5000 });
