// Boot the probe build under headless Chromium + SwiftShader and hand you an eval-into-the-closure function.
//
//   import { withGame } from './driver.mjs';
//   await withGame(async (P, page) => { console.log(await P('player.pos.toArray()')); });
//
// P(code) evaluates `code` INSIDE the game closure and returns the result (structured-cloned, so return
// plain data — a THREE.Object3D serialises to megabytes or throws).
//
// Three things here are the scar tissue of runs that failed:
//  - `#startBtn` must be clicked via page.evaluate, not page.click — the real click hangs under SwiftShader.
//  - window.__probe only exists AFTER that click (the hook is inside startGame). Wait for the button, click,
//    THEN wait for the hook.
//  - Polling per-frame state from Node is far slower than the frames it samples. For anything time-varying,
//    define a function inside the closure that records to an array off requestAnimationFrame and return the
//    whole array in ONE round trip. A 130-frame trial polled from Node times out; recorded in-page it is
//    seconds.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');

export async function withGame(fn, opts = {}) {
  const dir = opts.dir || path.join(REPO, 'probe-out');
  const port = opts.port || 8899;
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: dir, stdio: 'ignore' });
  const browser = await chromium.launch({ args: [
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'] });
  try {
    const page = await browser.newPage({ viewport: opts.viewport || { width: 640, height: 360 } });
    // build 1333: the photosensitivity warning is a once-per-browser modal at boot, and a fresh Playwright
    // context is always a fresh browser — so without this every probe and every capture would photograph
    // the dialog instead of the game. The driver plays a RETURNING player; pass `firstRun:true` when the
    // dialog itself is what is being measured.
    if (!opts.firstRun) await page.addInitScript(() => { try { localStorage.setItem('breach_photowarn', '1'); } catch (e) {} });
    // build 1335: the third-party block is read at PARSE time from localStorage, so it can only be set
    // before the document loads — an init script is the only place a probe can turn it on.
    if (opts.initBlock != null) await page.addInitScript((v) => { try { localStorage.setItem('breach_tpblock', v ? '1' : '0'); } catch (e) {} }, opts.initBlock);
    page.on('pageerror', e => console.log('[ERR]', e.message));
    if (opts.console) page.on('console', m => console.log('[c]', m.type(), m.text()));
    await new Promise(r => setTimeout(r, 1200));
    await page.goto('http://127.0.0.1:' + port + '/probe.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#startBtn', { timeout: 90000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => { const b = document.getElementById('startBtn'); if (b) b.click(); });
    await page.waitForFunction('!!window.__probe', null, { timeout: 90000 });
    await new Promise(r => setTimeout(r, opts.settleMs != null ? opts.settleMs : 6000));
    const P = (code) => page.evaluate(c => window.__probe(c), code);
    return await fn(P, page);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
}
