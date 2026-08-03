// build 1334 — colour-vision correction, measured on real composited pixels.
//
// The filter is applied by the compositor, so nothing inside the page can see it: `getImageData` on a
// canvas reads that canvas's backing store, not the screen. So the frame is SCREENSHOT, written to the
// probe's own directory, and loaded back into an offscreen canvas — where the pixels are the ones the
// screen actually showed, and the readback is not itself filtered.
//
// Three known swatches ride along as the control: a dichromat sees a neutral grey as a neutral grey, so
// GREY MUST NOT MOVE AT ALL under any correction. If it does, the matrix or the colour space is wrong.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '..', '..', 'probe-out');
const SWATCH = [['red', '#ff0000'], ['green', '#00c000'], ['grey', '#808080'], ['teal', '#38f5b5']];

await withGame(async (P, page) => {
  // fixed swatches at known screen positions, OUTSIDE #hud so the interface-size setting cannot move them
  await page.evaluate((sw) => {
    const host = document.createElement('div');
    host.id = '__cbsw';
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:999;display:flex;';
    for (const [name, col] of sw) {
      const d = document.createElement('div');
      d.style.cssText = 'width:40px;height:40px;background:' + col + ';';
      host.appendChild(d);
    }
    document.body.appendChild(host);
  }, SWATCH);

  const sample = async (label) => {
    const file = path.join(DIR, 'cbshot.png');
    fs.writeFileSync(file, await page.screenshot({ clip: { x: 0, y: 0, width: SWATCH.length * 40, height: 40 } }));
    const px = await page.evaluate(async (n) => {
      const img = new Image(); img.src = '/cbshot.png?' + Math.random();
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      const out = [];
      for (let i = 0; i < n; i++) {
        const x = i * 40 + 20, y = 20, o = (y * img.width + x) * 4;
        out.push([d[o], d[o + 1], d[o + 2]]);
      }
      return out;
    }, SWATCH.length);
    return px;
  };

  const rows = [];
  for (const [mode, str] of [['off', 1], ['protan', 1], ['deutan', 1], ['tritan', 1], ['protan', 0.5], ['off', 1]]) {
    await P(`cbMode=${JSON.stringify(mode)}; cbStrength=${str}; applyColorBlind(); 1`);
    await new Promise(r => setTimeout(r, 250));
    rows.push({ mode, str,
      filter: await page.evaluate(() => document.body.style.filter || '(none)'),
      px: await sample(mode) });
  }

  console.log('\n            filter                ' + SWATCH.map(s => s[0].padEnd(16)).join(''));
  for (const r of rows)
    console.log('  ' + (r.mode + '@' + r.str).padEnd(12) + String(r.filter).padEnd(22)
      + r.px.map(p => ('[' + p.join(',') + ']').padEnd(16)).join(''));

  const base = rows[0].px, gi = SWATCH.findIndex(s => s[0] === 'grey');
  console.log('\nINVARIANT  grey must not move under any correction:');
  for (const r of rows.slice(1, 5)) {
    const d = r.px[gi].map((v, i) => v - base[gi][i]);
    console.log('  ' + (r.mode + '@' + r.str).padEnd(14) + 'grey delta ' + JSON.stringify(d)
      + (d.every(v => Math.abs(v) <= 1) ? '   OK' : '   *** MOVED ***'));
  }
  console.log('\nlayout under a body filter (fixed children must not shift):');
  console.log('  ' + JSON.stringify(await page.evaluate(() => {
    const b = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    return { hud: b('hud'), gl: b('minimap') };
  })));
  await page.evaluate(() => { const h = document.getElementById('__cbsw'); if (h) h.remove(); });
}, { settleMs: 4000 });
