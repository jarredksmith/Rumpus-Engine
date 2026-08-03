// build 1332 — does the page still boot with SRI + CSP, and is the SRI check actually DOING anything?
//
// Booting successfully proves the hash is not wrong. It does NOT prove the browser verified it — an
// `integrity` attribute the browser ignored (missing crossOrigin, an unsupported algorithm, a typo in the
// attribute NAME) boots exactly the same way. So this runs a control pair: the shipped bytes, and then ONE
// FLIPPED BYTE in the same file. If the tampered run boots too, the check is inert and the whole build is
// theatre.
//
//   node tools/probe/mkprobe.mjs && node tools/probe/sri-csp.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const DIR = path.join(REPO, 'probe-out');
const THREE = path.join(DIR, 'three.min.js');

async function run(label, port) {
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: DIR, stdio: 'ignore' });
  const browser = await chromium.launch({ args: [
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'] });
  const rec = { label, csp: [], errs: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    // the listener must exist before the document's own scripts run, or a violation at parse time is missed
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', e =>
        window.__csp.push(e.violatedDirective + ' <- ' + (e.blockedURI || '(inline)')));
    });
    page.on('pageerror', e => rec.errs.push(e.message.slice(0, 120)));
    await new Promise(r => setTimeout(r, 1200));
    await page.goto('http://127.0.0.1:' + port + '/probe.html', { waitUntil: 'domcontentloaded' });
    // a blocked three.js never defines THREE and never reaches GAME_START, so give it a bounded wait
    try { await page.waitForFunction('!!window.THREE', null, { timeout: 20000 }); } catch (e) {}
    rec.three = await page.evaluate(() => !!window.THREE && window.THREE.REVISION);
    if (rec.three) {
      try {
        await page.waitForSelector('#startBtn', { timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));
        await page.evaluate(() => { const b = document.getElementById('startBtn'); if (b) b.click(); });
        await page.waitForFunction('!!window.__probe', null, { timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));
        rec.started = await page.evaluate(() => window.__probe('({gameOn, props: propModels.length, frame: _frameNo, peerSri: (function(){var m=String(ensurePeerJS).match(/integrity=.([^\\u0027]+)/); return m?m[1].slice(0,14)+"\\u2026":null;})()})'));
      } catch (e) { rec.started = 'FAILED: ' + e.message.slice(0, 80); }
    }
    // POSITIVE CONTROL. "0 violations" reads identically whether the policy is clean or IGNORED — and a
    // CSP <meta> found after content has been parsed IS ignored, which is what this build shipped first.
    // So provoke one: a <base> tag is exactly what base-uri forbids, and nothing in the engine uses one.
    rec.probeFired = await page.evaluate(async () => {
      const before = window.__csp.length;
      const b = document.createElement('base'); b.href = 'https://evil.example/'; document.head.appendChild(b);
      await new Promise(r => setTimeout(r, 150));
      const fired = window.__csp.length > before, hijacked = document.baseURI.indexOf('evil.example') === 0;
      b.remove(); window.__csp.length = before;
      return { fired, baseHijacked: hijacked };
    });
    rec.csp = await page.evaluate(() => window.__csp || []);
    rec.overlay = await page.evaluate(() => {
      const b = document.body ? document.body.innerText : '';
      const m = b.match(/ERROR:[^\n]*/); return m ? m[0].slice(0, 110) : null;
    });
  } finally { await browser.close().catch(() => {}); server.kill(); }
  return rec;
}

const show = r => {
  console.log('\n== ' + r.label);
  console.log('  THREE            ' + (r.three ? 'r' + r.three : 'ABSENT — the script did not execute'));
  console.log('  game             ' + JSON.stringify(r.started ?? null));
  console.log('  CSP violations   ' + (r.csp.length ? JSON.stringify(r.csp) : '0'));
  console.log('  CSP live? (ctl)  ' + JSON.stringify(r.probeFired ?? null));
  console.log('  page errors      ' + (r.errs.length ? JSON.stringify(r.errs) : '0'));
  console.log('  error overlay    ' + (r.overlay || 'none'));
};

const good = fs.readFileSync(THREE);
show(await run('SHIPPED BYTES (the hash in breach.html)', 8901));

// negative control: flip one byte inside a comment-free region of the minified bundle
const bad = Buffer.from(good);
bad[bad.length - 2] = bad[bad.length - 2] === 0x20 ? 0x09 : 0x20;
fs.writeFileSync(THREE, bad);
try { show(await run('ONE BYTE FLIPPED (must be REFUSED)', 8902)); }
finally { fs.writeFileSync(THREE, good); }
console.log('\n(local three.min.js restored)');
