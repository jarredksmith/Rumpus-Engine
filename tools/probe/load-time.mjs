// Where does the load time GO? Reported from play: "it's now taking much longer to load both the editor
// and the default level on deployment. Sometimes it even throws the 'this page is taking a long time' popup."
//
// That popup means the MAIN THREAD blocked for seconds in ONE go, so the measurand is not total time — it
// is LONG TASKS. `PerformanceObserver` for 'longtask' catches every block over 50 ms with no access to the
// game's closure at all, which is what makes it usable here: it is installed before the document loads and
// it cannot be fooled by anything the engine does to itself.
//
// It runs with PHYSICS LIVE. Every probe in this repo until build 1389 stubbed Rapier out (the CDNs hang
// in this sandbox and the boot never settled), so `buildPhysWorld` — the stall this file's own notes call
// "multi-second" — has never been measured by this rig.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const dir = process.argv[2] || path.join(REPO, 'probe-out');
const port = +(process.env.PORT || 8933);

const stamp = fs.existsSync(path.join(dir, 'BUILD')) ? fs.readFileSync(path.join(dir, 'BUILD'), 'utf8').trim() : '(unstamped)';
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: dir, stdio: 'ignore' });
const browser = await chromium.launch({ args: [
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'] });

try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => {
    try { localStorage.setItem('breach_photowarn', '1'); } catch (e) {}
    window.__T0 = performance.now();
    window.__LONG = [];
    window.__MARK = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__LONG.push({ at: +e.startTime.toFixed(0), ms: +e.duration.toFixed(0) });
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) { window.__LONG.push({ at: 0, ms: -1, err: String(e) }); }
    // resource timing gives the asset half for free — which of the first-load fetches are big and slow
    window.__assets = () => performance.getEntriesByType('resource')
      .map(r => ({ n: r.name.split('/').slice(-2).join('/'), ms: +r.duration.toFixed(0), kb: +(r.transferSize / 1024).toFixed(0) }))
      .filter(r => r.ms > 15 || r.kb > 20)
      .sort((a, b) => b.ms - a.ms).slice(0, 14);
  });
  page.on('pageerror', e => console.log('[ERR]', e.message));

  await new Promise(r => setTimeout(r, 1200));
  const tNav = Date.now();
  await page.goto('http://127.0.0.1:' + port + '/probe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn', { timeout: 120000 });
  const tMenu = Date.now();
  await new Promise(r => setTimeout(r, 2500));

  await page.evaluate(() => { window.__tClick = performance.now(); const b = document.getElementById('startBtn'); if (b) b.click(); });
  await page.waitForFunction('!!window.__probe', null, { timeout: 120000 });
  const tHook = Date.now();
  // wait until the game is genuinely settled: the level loader down and a few frames drawn
  await page.waitForFunction(`(function(){ try { return window.__probe('!_levelLoaderActive && _frameNo > 12'); } catch(e){ return false; } })()`,
    null, { timeout: 180000 });
  const tPlay = Date.now();

  const P = (c) => page.evaluate(x => window.__probe(x), c);
  const state = await P(`JSON.stringify({
    frames: _frameNo, props: propModels.length, colliders: colliders.length,
    physBodies: (typeof physWorld!=='undefined' && physWorld) ? physWorld.bodies.len() : -1,
    programs: renderer.info.programs ? renderer.info.programs.length : -1,
    texPending: typeof _texPending!=='undefined' ? _texPending : -1,
    baked: worldCfg.baked, bakeDone: (typeof _bakeDoneN!=='undefined') ? _bakeDoneN : -1
  })`);

  // the EDITOR half of the report, timed on its own
  const tEd0 = Date.now();
  await P('toggleEditor()');
  const tEd1 = Date.now();
  await P('setEditorMode("world")');
  const tEd2 = Date.now();
  await P('if(editorOpen) toggleEditor()');

  const long = await page.evaluate(() => window.__LONG);
  const assets = await page.evaluate(() => window.__assets());
  const clickAt = await page.evaluate(() => window.__tClick);

  console.log('\n  LOAD TIMING — ' + stamp);
  console.log('  ' + '-'.repeat(74));
  console.log('  navigate -> menu button      ' + String(tMenu - tNav).padStart(6) + ' ms');
  console.log('  start click -> __probe hook  ' + String(tHook - tMenu - 2500).padStart(6) + ' ms');
  console.log('  hook -> settled & playing    ' + String(tPlay - tHook).padStart(6) + ' ms');
  console.log('  toggleEditor()               ' + String(tEd1 - tEd0).padStart(6) + ' ms   <-- reported as slow');
  console.log('  setEditorMode("world")       ' + String(tEd2 - tEd1).padStart(6) + ' ms');
  console.log('  state: ' + state);

  const after = long.filter(e => e.at >= clickAt);
  console.log('\n  MAIN-THREAD BLOCKS over 50 ms (the "page unresponsive" measurand)');
  console.log('  total ' + long.length + ', of which ' + after.length + ' after the start click');
  const worst = long.slice().sort((a, b) => b.ms - a.ms).slice(0, 12);
  for (const e of worst) console.log('    ' + String(e.ms).padStart(6) + ' ms   at t+' + e.at +
    (e.at >= clickAt ? '  (after start)' : '  (boot)'));
  const sum = long.reduce((a, e) => a + e.ms, 0);
  console.log('  blocked ' + sum + ' ms across ' + long.length + ' tasks; worst single block ' +
    (worst[0] ? worst[0].ms : 0) + ' ms');

  // where the blocked time actually went, if the staging was built with PROBE_PROF=1
  const prof = await page.evaluate(() => window.__PROF || null);
  if (prof) {
    const rows = Object.entries(prof).filter(([, v]) => v && v.n > 0)
      .sort((a, b) => b[1].ms - a[1].ms).slice(0, 16);
    console.log('\n  WHERE THE TIME WENT (cumulative, whole session)');
    for (const [n, v] of rows) console.log('    ' + String(Math.round(v.ms)).padStart(7) + ' ms  ' +
      String(v.n).padStart(5) + ' calls  worst ' + String(Math.round(v.max)).padStart(6) + ' ms   ' + n);
    const errs = Object.entries(prof).filter(([, v]) => v && v.err);
    if (errs.length) console.log('    (not wrapped: ' + errs.map(([n]) => n).join(', ') + ')');
  } else console.log('\n  (no profiler — rebuild the staging with PROBE_PROF=1)');

  console.log('\n  FIRST-LOAD ASSETS (>15 ms or >20 KB)');
  for (const a of assets) console.log('    ' + String(a.ms).padStart(6) + ' ms  ' + String(a.kb).padStart(6) + ' KB  ' + a.n);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
