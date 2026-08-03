// The bias trade, swept. normalBias exists to stop ACNE; too much of it detaches contact shadows
// (peter-panning) and pushes the sample point straight through a thin wall (light leak). So the sweep has
// to measure BOTH ends or it is just picking the number that fixes the report:
//   gapPx    — bright pixels between a column's base and where its shadow starts
//   acneSD   — luminance variation across flat LIT ground (acne is a stripe pattern, so it shows as SD)
//   leak     — mean luminance on the floor INSIDE a closed, roofed box
// Swept at two sun elevations, because acne is worst at grazing angles — and the report's screenshots are
// a sunset.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');
const BIAS = [0, 0.04, 0.08, 0.12, 0.2, 0.45];

const SETUP = `(function(){
  const P = { x: 300, z: 300 };
  let col=null, slab=null;
  spawnProp('box',      [P.x, 0, P.z, 0,0,0, 40, 0.5, 40], o=>{ slab=o; });
  spawnProp('cylinder', [P.x, 0.5, P.z, 0,0,0, 1.2, 6, 1.2], o=>{ col=o; });
  applyPropColor(slab, 0xbbbbbb); applyPropColor(col, 0x888888);
  // a CLOSED room 30m away: four 0.3m walls and a roof — a creator's ordinary interior
  const R = { x: P.x + 30, z: P.z };
  const W = 0.3, S = 8, H = 4;
  spawnProp('box', [R.x, 0.5, R.z, 0,0,0, S, W, S], ()=>{});              // floor
  spawnProp('box', [R.x, 0.5+H, R.z, 0,0,0, S, W, S], ()=>{});           // roof
  spawnProp('box', [R.x-S/2, 0.5, R.z, 0,0,0, W, H, S], ()=>{});
  spawnProp('box', [R.x+S/2, 0.5, R.z, 0,0,0, W, H, S], ()=>{});
  spawnProp('box', [R.x, 0.5, R.z-S/2, 0,0,0, S, H, W], ()=>{});
  spawnProp('box', [R.x, 0.5, R.z+S/2, 0,0,0, S, H, W], ()=>{});
  window.__P = P; window.__R = R;
  worldCfg.autoExp = 0; worldCfg.postGrain = 0; applyWorldCfg();   // the control, per shadow-gap.mjs
  editorOpen = false;
  return { ok:true };
})()`;

const look = (what) => `(function(){
  const P = window.__P, R = window.__R;
  if('${what}'==='col'){ camera.position.set(P.x, 5.5, P.z + 10); camera.lookAt(P.x, 0.5, P.z); }
  else { camera.position.set(R.x, 2.2, R.z); camera.lookAt(R.x, 0.8, R.z + 3); }   // INSIDE the closed room
  camera.updateMatrixWorld(true); player.pos.copy(camera.position);
  _dirtyShadows(3);
  const v = new THREE.Vector3(P.x, 0.5, P.z).project(camera);
  return [+v.x.toFixed(3), +v.y.toFixed(3)];
})()`;

await withGame(async (P, page) => {
  console.log(JSON.stringify(await P(SETUP)));
  const sun = async () => (await P(`(function(){ const d=new THREE.Vector3().copy(moon.position).sub(_sunTarget.position).normalize();
    return +(Math.asin(d.y)*180/Math.PI).toFixed(1); })()`));

  const shot = async (mode, ndc) => {
    fs.writeFileSync(path.join(DIR, 'ss.png'), await page.screenshot());
    return page.evaluate(async ([mode, ndc]) => {
      const img = new Image(); img.src = '/ss.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const L = (x, y) => { const o = ((y | 0) * img.width + (x | 0)) * 4; return (d[o] + d[o+1] + d[o+2]) / 3; };
      if (mode === 'room') {
        // the floor of the closed room: any light here has come through a wall
        let s = 0, n = 0;
        for (let y = img.height * 0.6; y < img.height * 0.9; y += 4)
          for (let x = img.width * 0.3; x < img.width * 0.7; x += 4) { s += L(x, y); n++; }
        return { leak: +(s / n).toFixed(1) };
      }
      const x = (ndc[0] + 1) / 2 * img.width, y0 = (1 - (ndc[1] + 1) / 2) * img.height;
      const lum = []; for (let i = 0; i < 40; i++) lum.push(L(x, y0 + i));
      const dark = Math.min(...lum);
      // the gap: how many pixels from the base stay more than 25% above the shadow floor
      let gap = 0; while (gap < lum.length && lum[gap] > dark * 1.25) gap++;
      const ax = img.width * 0.8, ay = img.height * 0.55, flat = [];
      for (let i = -16; i <= 16; i++) flat.push(L(ax + i, ay));
      const m = flat.reduce((a, b) => a + b, 0) / flat.length;
      return { gapPx: gap, shadowLum: +dark.toFixed(1),
               acneSD: +Math.sqrt(flat.reduce((a, b) => a + (b - m) * (b - m), 0) / flat.length).toFixed(2) };
    }, [mode, ndc]);
  };

  for (const elev of ['default', 'grazing']) {
    if (elev === 'grazing') await P(`worldCfg.sunElev = 8; applyWorldCfg(); _dirtyShadows(3); 1`);
    await new Promise(r => setTimeout(r, 400));
    console.log('\n===== sun elevation ' + (await sun()) + '°');
    console.log('  bias     gapPx   acneSD   roomLeak');
    for (const nb of BIAS) {
      const ndc = await P(look('col'));
      await P(`moon.shadow.normalBias = ${nb}; _dirtyShadows(3); 1`);
      await new Promise(r => setTimeout(r, 450));
      const a = await shot('col', ndc);
      await P(look('room'));
      await P(`moon.shadow.normalBias = ${nb}; _dirtyShadows(3); 1`);
      await new Promise(r => setTimeout(r, 450));
      const b = await shot('room', ndc);
      console.log('  ' + String(nb).padEnd(8) + String(a.gapPx).padEnd(8) + String(a.acneSD).padEnd(9) + b.leak);
    }
  }
}, { settleMs: 4500 });
