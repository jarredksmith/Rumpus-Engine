// The bias trade, measured properly. A first attempt (shadow-sweep.mjs) moved the camera between two
// scenes per sample and produced a saturated gap count and a non-monotonic leak reading — the scene was
// changing between shots, so it was measuring the rig. This one holds ONE camera and ONE scene for the
// whole sweep and changes exactly one number.
//
//   gapPx   — bright pixels between the column's base and where its shadow starts (peter-panning)
//   acne    — MEAN ABSOLUTE FIRST DIFFERENCE along a run of flat lit ground. Acne is a high-frequency
//             stripe; a first difference sees it and ignores any smooth gradient, which a plain SD does not.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');
const BIAS = [0, 0.03, 0.06, 0.1, 0.15, 0.25, 0.45];

const SETUP = `(function(){
  const P = { x: 300, z: 300 };
  let col=null, slab=null;
  spawnProp('box',      [P.x, 0, P.z, 0,0,0, 60, 0.5, 60], o=>{ slab=o; });
  spawnProp('cylinder', [P.x, 0.5, P.z, 0,0,0, 1.2, 6, 1.2], o=>{ col=o; });
  if(!col || !slab) return { err:'props' };
  applyPropColor(slab, 0xcccccc); applyPropColor(col, 0x888888);
  applyPropShine(slab, 0.95, 0);          // matte, so nothing but the shadow varies across it
  camera.position.set(P.x, 5.5, P.z + 10); camera.lookAt(P.x, 0.5, P.z);
  camera.updateMatrixWorld(true); player.pos.copy(camera.position);
  // the controls: auto-exposure adapts to how much of the frame is shadowed, grain is stochastic per frame
  worldCfg.autoExp = 0; worldCfg.postGrain = 0; worldCfg.sunElev = SUNELEV; applyWorldCfg();
  editorOpen = false; _dirtyShadows(3);
  const v = new THREE.Vector3(P.x, 0.5, P.z).project(camera);
  return { ndc:[+v.x.toFixed(4), +v.y.toFixed(4)], onScreen: Math.abs(v.x)<1 && Math.abs(v.y)<1 };
})()`;

await withGame(async (P, page) => {
  for (const elev of [34, 8]) {
    const where = await P(SETUP.replace('SUNELEV', String(elev)));
    if (!where.onScreen) { console.log('column off screen — nothing below would mean anything'); continue; }
    const sun = await P(`(function(){ const d=new THREE.Vector3().copy(moon.position).sub(_sunTarget.position).normalize();
      return { elev:+(Math.asin(d.y)*180/Math.PI).toFixed(1), nb:+moon.shadow.normalBias.toFixed(4),
               texel_cm:+(200*moon.shadow.camera.right/moon.shadow.mapSize.x).toFixed(2) }; })()`);
    console.log('\n===== sun ' + sun.elev + '°   (shipped normalBias ' + sun.nb + ' = ' + (sun.nb / (sun.texel_cm / 100)).toFixed(1) + ' texels of ' + sun.texel_cm + ' cm)');
    console.log('  normalBias   gapPx    acne(mean |Δ|)');
    for (const nb of BIAS) {
      await P(`moon.shadow.normalBias = ${nb}; _dirtyShadows(3); 1`);
      await new Promise(r => setTimeout(r, 550));
      fs.writeFileSync(path.join(DIR, 'sb.png'), await page.screenshot());
      const m = await page.evaluate(async (ndc) => {
        const img = new Image(); img.src = '/sb.png?' + Math.random(); await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const L = (x, y) => { const o = ((y | 0) * img.width + (x | 0)) * 4; return (d[o] + d[o+1] + d[o+2]) / 3; };
        const x = (ndc[0] + 1) / 2 * img.width, y0 = (1 - (ndc[1] + 1) / 2) * img.height;
        // straight down-screen from the base: the shadow runs away from the camera
        const run = []; for (let i = 0; i < 46; i++) run.push(L(x, y0 + i));
        const lo = Math.min(...run), hi = Math.max(...run);
        // the gap ends at the first sample that has fallen most of the way to the shadow floor
        const thresh = lo + (hi - lo) * 0.35;
        let gap = 0; while (gap < run.length && run[gap] > thresh) gap++;
        // acne: a long horizontal run of LIT slab beside the column, high-frequency variation only
        const ay = y0 + 4, flat = [];
        for (let i = 60; i < 200; i++) flat.push(L(x + i, ay));
        let dsum = 0; for (let i = 1; i < flat.length; i++) dsum += Math.abs(flat[i] - flat[i-1]);
        return { gap, acne: +(dsum / (flat.length - 1)).toFixed(3),
                 lit: +(flat.reduce((a,b)=>a+b,0)/flat.length).toFixed(1), head: run.slice(0, 10).map(v=>Math.round(v)) };
      }, where.ndc);
      console.log('  ' + String(nb).padEnd(13) + String(m.gap).padEnd(9) + String(m.acne).padEnd(10) + '  lit ' + m.lit + '   ' + JSON.stringify(m.head));
    }
  }
}, { settleMs: 4500 });
