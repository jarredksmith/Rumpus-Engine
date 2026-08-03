// Reported from play: turning motion blur above 0 makes edges jagged on the default level.
//
// The metric is build 1126's own: an antialiased edge against the sky has a COVERAGE GRADIENT — at least
// one pixel whose value lies between the two sides. A hard edge has none. So find a silhouette against the
// sky, walk scanlines across it, and count the fraction that show an intermediate pixel. MSAA should give
// that on nearly every scanline; no AA on almost none.
//
// Everything else is pinned: same camera, same frame, auto-exposure and grain off (they move every pixel
// for reasons that have nothing to do with AA).
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');

const SETUP = `(function(){
  // a tall box against open sky, filling a good slice of the frame
  let b = null;
  spawnProp('box', [300, 0, 300, 0,0,0, 6, 14, 6], o=>{ b = o; });
  if(!b) return { err:'no box' };
  applyPropColor(b, 0x2b3a4a);
  camera.position.set(300, 6, 316); camera.lookAt(300, 9, 300);
  camera.updateMatrixWorld(true); player.pos.copy(camera.position);
  worldCfg.autoExp = 0; worldCfg.postGrain = 0; applyWorldCfg();
  editorOpen = false;
  // FORCE THE TOP RUNG. Under SwiftShader the adaptive ladder sits on rung 3, where MSAA is already off
  // (_desiredPostSamples returns 0 below rung 0) — so an unforced run measures a machine that has no MSAA
  // either way, which is not the reported condition. Build 1242 lost a whole capture round to exactly this.
  _adaptOn = false; _prStepI = 0; _prScale = 1; _hiFxOn = true; _hiFxFails = 0;
  _applyPixelRatio(); disposePost(); ensurePost();
  return { ok:true };
})()`;

await withGame(async (P, page) => {
  console.log(JSON.stringify(await P(SETUP)));
  console.log('pipeline: ' + await P(`JSON.stringify({ postOn:_postOn, prStep:_prStepI, hiFx:_hiFxOn,
    samples:(_postRT?_postRT.samples:null), webgl2:renderer.capabilities.isWebGL2,
    dof:!!(worldCfg.dof&&worldCfg.dofStrength>0), pr:renderer.getPixelRatio() })`));

  const measure = async () => {
    fs.writeFileSync(path.join(DIR, 'mb.png'), await page.screenshot());
    return page.evaluate(async () => {
      const img = new Image(); img.src = '/mb.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const L = (x, y) => { const o = (y * img.width + x) * 4; return (d[o] + d[o+1] + d[o+2]) / 3; };
      // find the vertical silhouette: for each scanline in the upper half, the biggest horizontal jump
      let soft = 0, hard = 0, edges = 0, widths = [];
      for (let y = Math.round(img.height * 0.15); y < Math.round(img.height * 0.45); y++) {
        let bx = -1, bd = 0;
        for (let x = Math.round(img.width * 0.2); x < Math.round(img.width * 0.8); x++) {
          const dd = Math.abs(L(x + 1, y) - L(x, y));
          if (dd > bd) { bd = dd; bx = x; }
        }
        if (bd < 25) continue;                       // no real silhouette on this scanline
        edges++;
        const a = L(bx - 3, y), b = L(bx + 4, y), lo = Math.min(a, b), hi = Math.max(a, b);
        // how many pixels across the transition sit strictly between the two plateaus
        let n = 0;
        for (let i = -2; i <= 3; i++) { const v = L(bx + i, y); if (v > lo + (hi - lo) * 0.12 && v < hi - (hi - lo) * 0.12) n++; }
        widths.push(n);
        if (n >= 1) soft++; else hard++;
      }
      const mean = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
      return { scanlines: edges, withGradient: soft, hardStep: hard,
               pctAntialiased: edges ? +(100 * soft / edges).toFixed(1) : null,
               meanGradientPx: +mean.toFixed(2) };
    });
  };

  for (const mb of [0, 0.3, 0.62]) {
    await P(`worldCfg.postMotion = ${mb}; applyWorldCfg(); 1`);
    await new Promise(r => setTimeout(r, 700));
    const m = await measure();
    const live = await P(`JSON.stringify({ mbOn:(_postMotion*((typeof a11y!=='undefined')?a11y.blur:1))>0.01, amt:+_matAfter.uniforms.uAmt.value.toFixed(3), velOn:_matAfter.uniforms.uVelOn.value, samples:(_postRT?_postRT.samples:null) })`);
    console.log('\npostMotion ' + mb + '   ' + live);
    console.log('  ' + JSON.stringify(m));
  }
}, { settleMs: 4500 });
