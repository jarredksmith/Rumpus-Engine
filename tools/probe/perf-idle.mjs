// build 1426 — does the perf HUD tell WORK apart from WAITING?
//
// `other` was `totMs - render - phys - net - mini`, and `totMs` is the wall clock from one rAF to the next
// — pinned by VSYNC at a capped frame rate however little work is done. On a healthy frame (61 fps, 0.6 ms
// of render) it read `other 15.7 ms`, and 15.4 of that was the browser sitting idle. I read the same
// counter on a reporter's screenshots and concluded 13 ms of hidden cost that did not exist.
//
// TWO THINGS THIS ENVIRONMENT CANNOT TEST, stated rather than faked:
//   - the VSYNC case. SwiftShader renders this scene at 3-4 fps with no frame cap, so there is no slack
//     for `idle` to be holding. The vsync half is arithmetic and is proven in tests/test-1426 instead.
//   - "the frame interval barely moves while `other` grows", which is only true when vsync HAD slack.
//     Here every burned millisecond genuinely lengthens the frame. Asserting it would be measuring the
//     absence of a frame cap.
// What IS testable here, and is the load-bearing claim: work done inside the frame callback lands in
// `other` and NOT in `idle`.
//
// The burn must run INSIDE the game's own `loop()`, so it wraps a function `loop` calls every frame. The
// first draft burned inside the PROBE's `requestAnimationFrame` await — outside the measured callback
// entirely — and measured pure noise.
import { withGame } from './driver.mjs';

const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });

await withGame(async (P) => {
  await P(`(function(){
    perfOn = true;
    const el = document.getElementById('perfHud'); if(el) el.style.display = '';
    window.__burn = 0;
    /* updatePerfHud is called from loop() every frame, at the top — wrapping it puts the burn inside the
       callback the microtask brackets. */
    const _orig = updatePerfHud;
    updatePerfHud = function(){
      if(window.__burn){ const t = _pnow() + window.__burn; while(_pnow() < t){} }
      return _orig.apply(this, arguments);
    };
    return 1;
  })()`);

  const sample = (burnMs) => P(`(async function(){
    window.__burn = ${burnMs};
    const el = document.getElementById('perfHud');
    const t0 = _pnow();
    while(_pnow() - t0 < 2500) await new Promise(r=>requestAnimationFrame(r));
    const txt = el ? el.textContent : '';
    const g = (re)=>{ const m = txt.match(re); return m ? +m[1] : null; };
    return { fps:g(/FPS (\\d+)/), tot:g(/\\(([\\d.]+) ms\\)/), render:g(/render ([\\d.]+)/),
             other:g(/other ([\\d.]+)/), idle:g(/idle ([\\d.]+)/),
             why:(txt.match(/idle [\\d.]+ ms \\(([^)]+)\\)/)||[])[1] };
  })()`);

  console.log('\n--- no burn --------------------------------------------------------------------');
  const a = await sample(0);
  console.log('  ', JSON.stringify(a));
  P_(a.idle != null && a.other != null, 'the HUD reports work and idle separately', [a.other, a.idle]);
  P_(a.render + a.other <= a.tot + 1, 'accounted work never exceeds the frame', [a.render, a.other, a.tot]);
  P_(a.why === 'GPU-bound?',
    'and on THIS renderer it correctly says GPU-bound — SwiftShader at ' + a.fps + ' fps with ' +
    Math.round(a.idle) + ' ms of a ' + Math.round(a.tot) + ' ms frame spent outside our callback is exactly that',
    [a.fps, a.idle, a.tot]);

  console.log('\n--- 60 ms of real JS burned INSIDE the frame callback ---------------------------');
  const b = await sample(60);
  console.log('  ', JSON.stringify(b));
  P_(b.other > a.other + 40,
    'THE BURN LANDS IN `other` — the counter tracks work done, not what is left over',
    [a.other, b.other]);
  P_(b.idle < b.other + b.render + 1 || b.idle - a.idle < 40,
    '...and NOT in `idle`: idle did not grow by the burn', [a.idle, b.idle]);

  console.log('\n--- and back -------------------------------------------------------------------');
  const c = await sample(0);
  console.log('  ', JSON.stringify(c));
  P_(c.other < b.other - 40, 'CONTROL RETURNS: stop burning and `other` drops back', [b.other, c.other]);

  console.log('\n--- off costs nothing ----------------------------------------------------------');
  const off = await P(`({ gated: /if\\(perfOn\\)\\{ const _w0/.test(String(loop)) })`);
  P_(off.gated, 'the stamp is gated on perfOn, so a normal session queues no microtask', off.gated);
}, { settleMs: 4000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   ' + String(JSON.stringify(o.detail)).slice(0, 130) : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
