// (build 892) MOBILE GAMEPLAY WAS VERTICALLY SQUISHED — on phones the browser bar hides/shows around
// gameplay and the canvas's displayed box (CSS 100% of the LAYOUT viewport) diverges from
// innerWidth/innerHeight, often with NO window resize event. camera.aspect went stale and the world
// rendered smooshed (reproduced headless: shrink the canvas box eventlessly -> squish factor 0.858,
// never self-healing). Fix: one true viewport size (_vpW/_vpH) read from the canvas's OWN client box,
// a visualViewport resize listener, and a ~2Hz drift watchdog in the render loop. Verified headless:
// the same eventless bar transition now refits within half a second (squish 1.0 both directions).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const fit = extractFunction('_fitViewport', src);
const drift = extractFunction('_vpDriftTick', src);

// ---- wiring pins ----
assert(/let _vpW = innerWidth, _vpH = innerHeight;/.test(src), 'the one true viewport size exists');
assert(/function _postSize\(\)\{ return \[Math\.max\(2, Math\.floor\(_vpW \* renderer\.getPixelRatio\(\)\)\)/.test(src), 'post targets size from the canvas box');
assert(/function _dofSize\(\)\{ return \[Math\.max\(2, Math\.floor\(_vpW \* renderer\.getPixelRatio\(\)\)\)/.test(src), 'DoF targets size from the canvas box');
assert(/if\(window\.visualViewport\) visualViewport\.addEventListener\('resize', _fitViewport\);/.test(src), 'visualViewport resizes (bar/keyboard) refit');
assert(/if\(typeof _vpDriftTick==='function'\) _vpDriftTick\(_anow\);/.test(src), 'the render loop runs the drift watchdog');
assert(/\|\| innerWidth;/.test(fit) && /\|\| innerHeight;/.test(fit), 'window numbers remain the fallback (canvas not laid out yet)');

// ---- executable: canvas box wins; watchdog refits on drift, throttled to ~2Hz ----
const run = new Function('renderer', 'camera', 'innerWidth', 'innerHeight', `
  let _vpW=innerWidth, _vpH=innerHeight, _vpCheckAt=0;
  ${fit}
  ${drift}
  const log=[];
  _fitViewport();                                   // window says 390x844, the CANVAS box says 390x724
  log.push({ w:_vpW, h:_vpH, aspect:camera.aspect, buf:[renderer._w, renderer._h] });
  _vpDriftTick(100);                                // no drift -> nothing changes, arms the throttle
  renderer.domElement.clientHeight = 844;           // the bar hides eventlessly
  _vpDriftTick(300);                                // inside the 500ms window -> not checked yet
  log.push({ aspect:camera.aspect });
  _vpDriftTick(700);                                // next check -> catches the drift, refits
  log.push({ aspect:camera.aspect, h:_vpH, buf:[renderer._w, renderer._h] });
  return log;
`);
const cam = { aspect: 0, updateProjectionMatrix(){} };
const ren = { domElement: { clientWidth: 390, clientHeight: 724 }, setSize(w,h){ this._w=w; this._h=h; } };
const log = run(ren, cam, 390, 844);
eq(log[0].w, 390, 'width from the canvas box');
eq(log[0].h, 724, 'height from the CANVAS box, not the stale window number');
near(log[0].aspect, 390/724, 1e-9, 'camera aspect matches what is actually displayed');
eq(log[0].buf.join('x'), '390x724', 'drawing buffer matches too');
near(log[1].aspect, 390/724, 1e-9, 'watchdog is throttled — no layout reads every frame');
near(log[2].aspect, 390/844, 1e-9, 'eventless bar transition caught by the watchdog');
eq(log[2].h, 844, '...and the size store follows');
eq(log[2].buf.join('x'), '390x844', '...and the buffer follows');

// the fallback path: canvas not in the DOM yet -> window numbers
const cam2 = { aspect: 0, updateProjectionMatrix(){} };
const ren2 = { domElement: { clientWidth: 0, clientHeight: 0 }, setSize(w,h){ this._w=w; this._h=h; } };
const log2 = run(ren2, cam2, 1280, 800);
near(log2[0].aspect, 1280/800, 1e-9, 'zero client box falls back to the window');

done('build 892: viewport drift watchdog — the world can no longer stay squished after a phone bar move');
