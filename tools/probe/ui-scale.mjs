// build 1333 — INTERFACE SIZE, measured rather than eyeballed. Four things have to be true at once and
// three of them are exactly what a naive `zoom` gets wrong:
//   1. the HUD's own box stays one viewport (or the corner panels walk off screen)
//   2. the readable elements actually change size
//   3. the crosshair stays dead centre
//   4. the RENDER canvas and the touch controls do not move at all
import { withGame } from './driver.mjs';

const SCALES = [1, 0.75, 1.75, 1];

await withGame(async (P, page) => {
  console.log('viewport ' + JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight])));
  // #touchUI is display:none on desktop; show it for the measurement so the exemption can be seen
  await page.evaluate(() => { document.getElementById('touchUI').style.display = 'block'; });

  const rows = [];
  for (const s of SCALES) {
    rows.push(await page.evaluate((S) => {
      document.documentElement.style.setProperty('--uiS', String(S));
      const box = el => { if (!el) return null; const b = el.getBoundingClientRect();
        return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      const id = i => box(document.getElementById(i));
      // the RENDER canvas is the one that is NOT inside #hud (#minimap is)
      const gl = [...document.querySelectorAll('canvas')].find(c => !document.getElementById('hud').contains(c));
      const xh = document.getElementById('crosshair').getBoundingClientRect();
      const ammo = document.getElementById('ammoPanel');
      const onScreen = i => { const e = document.getElementById(i); if (!e) return null; const b = e.getBoundingClientRect();
        return b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; };
      return { S,
        hud: id('hud'), glCanvas: box(gl), touchUI: id('touchUI'), tStick: id('tStick'),
        ammoW: ammo ? +ammo.getBoundingClientRect().width.toFixed(1) : null,
        ammoFont: ammo ? getComputedStyle(ammo).fontSize : null,
        xhOff: [ +(xh.left + xh.width / 2 - innerWidth / 2).toFixed(2), +(xh.top + xh.height / 2 - innerHeight / 2).toFixed(2) ],
        allOnScreen: ['ammoPanel', 'minimap', 'score', 'wavePanel'].every(i => onScreen(i) !== false),
      };
    }, s));
  }
  const f = (k) => rows.map(r => JSON.stringify(r[k])).join('   ');
  console.log('\n                 ' + rows.map(r => ('x' + r.S).padEnd(22)).join(''));
  for (const k of ['hud', 'glCanvas', 'touchUI', 'tStick', 'ammoW', 'ammoFont', 'xhOff', 'allOnScreen'])
    console.log('  ' + k.padEnd(13) + rows.map(r => String(JSON.stringify(r[k])).padEnd(22)).join(''));

  await page.evaluate(() => { document.documentElement.style.removeProperty('--uiS');
    document.getElementById('touchUI').style.display = ''; });
}, { settleMs: 4000 });
