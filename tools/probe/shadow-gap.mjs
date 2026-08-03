// Reported from play, with screenshots: (a) light leaks along edges and inside closed rooms, (b) a column's
// shadow does not start at its base — there is a lit gap first.
//
// Both are the classic signature of shadow-map bias, but this file's rule is to measure the parameter
// before naming it. So: report the LIVE shadow state, then A/B `normalBias` at its current value and at 0,
// and read the ground luminance along a line running out from the column's base in the shadow direction.
// If the gap closes at 0, the bias is the cause and its size is the whole question.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');

const SETUP = `(function(){
  // a clean flat patch far from the stock level's own geometry, with one column on it
  const P = { x: 300, z: 300 };
  let col = null, slab = null;
  spawnProp('box',      [P.x, 0, P.z, 0,0,0, 40, 0.5, 40], o=>{ slab = o; });
  spawnProp('cylinder', [P.x, 0.5, P.z, 0,0,0, 1.2, 6, 1.2], o=>{ col = o; });
  if(!col || !slab) return { err:'no props' };
  applyPropColor(slab, 0xbbbbbb); applyPropColor(col, 0x888888);
  window.__col = col; window.__P = P;
  // stand back and look down at the column's base
  // lookAt, not a hand-built yaw/pitch: the first run put the column's base at ndc y 1.373 — off screen —
  // and every luminance below it was null. The engine's forward is (-sin yaw, -cos yaw), which is easy to
  // get backwards; lookAt cannot be.
  camera.position.set(P.x, 5.5, P.z + 10);
  camera.lookAt(P.x, 0.5, P.z);
  camera.updateMatrixWorld(true);
  player.pos.set(P.x, 5.5, P.z + 10);
  editorOpen = false;
  // CONTROL. Auto-exposure adapts to how much of the frame is in shadow, so changing the bias changes the
  // exposure and every luminance moves for a reason that has nothing to do with the bias. Grain is
  // stochastic per frame. Both off, or the A/B measures the eye rather than the shadow.
  worldCfg.autoExp = 0; worldCfg.postGrain = 0; applyWorldCfg();
  _dirtyShadows(3);
  return { ok:true, autoExp:worldCfg.autoExp, grain:worldCfg.postGrain };
})()`;

const STATE = `(function(){
  const sh = moon.shadow, c = sh.camera;
  const extent = c.right;
  const texel = 2 * extent / sh.mapSize.x;
  const d = new THREE.Vector3().copy(moon.position).sub(_sunTarget.position).normalize();
  return { shadowDist: worldCfg.shadowDist, mapSize: sh.mapSize.x, extent: +extent.toFixed(2),
           texel_cm: +(texel * 100).toFixed(2), normalBias: +sh.normalBias.toFixed(4),
           normalBias_in_texels: +(sh.normalBias / texel).toFixed(1),
           depthBias: sh.bias, near: c.near, far: c.far,
           sunElevation_deg: +(Math.asin(d.y) * 180 / Math.PI).toFixed(1),
           autoUpdate: renderer.shadowMap.autoUpdate, type: renderer.shadowMap.type };
})()`;

await withGame(async (P, page) => {
  console.log('setup            ' + JSON.stringify(await P(SETUP)));
  console.log('\nLIVE SHADOW STATE');
  const st = await P(STATE);
  for (const k in st) console.log('  ' + k.padEnd(22) + st[k]);

  // where is the column on screen? never trust a scanline you have not located (build 1124)
  const where = await P(`(function(){
    camera.updateMatrixWorld(true);
    const v = new THREE.Vector3(window.__P.x, 0.5, window.__P.z);   // the column's BASE
    v.project(camera);
    return { ndc:[+v.x.toFixed(3), +v.y.toFixed(3)], onScreen: Math.abs(v.x)<1 && Math.abs(v.y)<1 };
  })()`);
  console.log('\ncolumn base      ' + JSON.stringify(where));

  const scan = async () => {
    fs.writeFileSync(path.join(DIR, 'sg.png'), await page.screenshot());
    return page.evaluate(async (ndc) => {
      const img = new Image(); img.src = '/sg.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      const x = Math.round((ndc[0] + 1) / 2 * img.width);
      const y0 = Math.round((1 - (ndc[1] + 1) / 2) * img.height);
      // walk DOWN the screen from the base — the camera looks along the shadow, so down-screen is outward
      const out = [];
      for (let y = y0; y < Math.min(img.height, y0 + 60); y += 1) {
        const o = (y * img.width + x) * 4;
        out.push(Math.round((d[o] + d[o + 1] + d[o + 2]) / 3));
      }
      // a flat patch of LIT ground well away from the column, for the acne question
      const ax = Math.round(img.width * 0.78), ay = Math.round(img.height * 0.62);
      const flat = [];
      for (let i = -14; i <= 14; i++) { const o = (ay * img.width + (ax + i)) * 4; flat.push(Math.round((d[o]+d[o+1]+d[o+2])/3)); }
      const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
      const sd = Math.sqrt(flat.reduce((a, b) => a + (b - mean) * (b - mean), 0) / flat.length);
      return { x, y0, lum: out, flatMean: +mean.toFixed(1), flatSD: +sd.toFixed(2) };
    }, where.ndc);
  };

  for (const nb of [null, 0]) {
    if (nb !== null) await P(`moon.shadow.normalBias = ${nb}; _dirtyShadows(3); 1`);
    await new Promise(r => setTimeout(r, 700));
    const s = await scan();
    const lo = Math.min(...s.lum), hi = Math.max(...s.lum), mid = (lo + hi) / 2;
    // how many samples from the base before the first shadowed one
    let firstDark = s.lum.findIndex(v => v < mid);
    console.log('\nnormalBias ' + (nb === null ? String(st.normalBias) + ' (as shipped)' : String(nb)));
    console.log('  luminance out from the base (1px steps): ' + JSON.stringify(s.lum.slice(0, 34)));
    console.log('  first shadowed sample at index ' + firstDark + '  (min ' + lo + ', max ' + hi + ')');
    console.log('  lit ground away from the column: mean ' + s.flatMean + ', SD ' + s.flatSD + '   <- acne shows up as SD');
  }
}, { settleMs: 4500 });
