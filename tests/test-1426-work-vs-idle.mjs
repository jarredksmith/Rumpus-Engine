// build 1426: the perf HUD stops presenting a residual as a cost.
//
// `other` was `totMs - render - phys - net - mini`, and `totMs` is the wall clock from one rAF to the next
// — which at a capped frame rate is pinned by VSYNC however little work is done. Reported from play on a
// perfectly healthy frame: 61 fps, `render 0.6`, `other 15.7 ms`. Nearly all of that 15.7 was the browser
// sitting idle waiting for the next vblank.
//
// It is not a cosmetic complaint. I read the SAME counter on a reporter's screenshots earlier in that
// session and concluded there were 13 ms of hidden cost in their frame. There were not; the real signal
// was `tris 29993k` beside `rung 3 fxOff`. A meter that misleads the person reading it hardest is worse
// than no meter.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the split, executed
// The vsync case cannot be measured in the headless probe — SwiftShader runs this scene at 3-4 fps with no
// frame cap, so there is no slack for `idle` to be holding (tools/probe/perf-idle.mjs says so). It is
// arithmetic, so it is executed here instead.
const _u = extractFunction('updatePerfHud');
// Sliced between NAMED anchors, both asserted. A line-count or character-budget window is the trap this
// repo records under builds 1149 and 1341 — it goes stale the moment a comment lands inside the block.
const _a = _u.indexOf('const work='), _b = _u.indexOf('\n', _u.indexOf('const idleWhy ='));
assert(_a > 0 && _b > _a, 'the split arithmetic extracted');
const _SPLIT = _u.slice(_a, _b).replace(/\/\*[\s\S]*?\*\//g, '');
const split = (totMs, _prof, f) => new Function('totMs', '_prof', 'f',
  'const r=_prof.render/f, p=_prof.phys/f, n=_prof.net/f, mi=_prof.mini/f;\n' + _SPLIT +
  '\nreturn { r, other, idle, idleWhy };')(totMs, _prof, f);

{ // THE REPORTED FRAME: 61 fps, almost no work, and the old counter shouting 15.7
  const r = split(16.4, { render: 0.6, phys: 0.0, net: 0.0, mini: 0.1, work: 1.0 }, 1);
  near(r.other, 0.3, 0.01, 'un-profiled WORK is 0.3 ms — which is the truth about that frame');
  near(r.idle, 15.4, 0.01, '...and 15.4 ms of it was the browser waiting, not the engine working');
  eq(r.idleWhy, 'vsync', 'at 61 fps the wait is the frame cap, and it says so');
  // the old formula, for the record — this is the number that misled me
  const oldOther = 16.4 - 0.6 - 0.0 - 0.0 - 0.1;
  near(oldOther, 15.7, 0.01, 'the OLD `other` read 15.7 on that same frame');
  assert(r.other < oldOther / 40,
    '...so the new figure is ~50x smaller, because 98% of what it reported was idle');
}
{ // a frame that really is busy: the burn shows up as work, not as waiting
  const r = split(16.7, { render: 2.0, phys: 1.0, net: 0.2, mini: 0.1, work: 12.0 }, 1);
  near(r.other, 8.7, 0.01, 'un-profiled work is what is left of the CALLBACK, not of the frame');
  near(r.idle, 4.7, 0.01, '...and idle is only the real slack');
  eq(r.idleWhy, 'vsync', 'still capped, so still vsync');
}
{ // GPU-bound: under the cap, and most of the frame spent outside our callback
  const r = split(50.0, { render: 3.0, phys: 0.5, net: 0, mini: 0.1, work: 6.0 }, 1);
  near(r.idle, 44.0, 0.01, '44 of 50 ms outside the callback');
  eq(r.idleWhy, 'GPU-bound?',
    'a SLOW frame that is mostly idle is the browser blocking on a full GPU queue at presentation — ' +
    'WebGL’s render() returns immediately, so back-pressure lands here and not in the render figure. ' +
    'This is the single most useful thing the meter can say and it could not say it before');
  // measured live: SwiftShader at 2 fps, idle 399 of a 420 ms frame, correctly labelled
}
{ // slow but CPU-bound must NOT be blamed on the GPU
  const r = split(50.0, { render: 3.0, phys: 1.0, net: 0, mini: 0.1, work: 45.0 }, 1);
  near(r.other, 40.9, 0.01, 'the work is ours');
  eq(r.idleWhy, 'vsync', '...so it is not called GPU-bound, which would send someone the wrong way');
}
{ // arithmetic that must never go negative or exceed the frame, whatever the sampler hands it
  const r = split(16.0, { render: 20.0, phys: 0, net: 0, mini: 0, work: 2.0 }, 1);
  assert(r.other >= 0 && r.idle >= 0, 'both clamp at zero on an inconsistent window');
  const z = split(16.0, { render: 0, phys: 0, net: 0, mini: 0, work: 0 }, 1);
  near(z.idle, 16.0, 0.01,
    'a window with no work sample yet reads as all idle rather than inventing work');
}

// ---------------------------------------------------------------- where the work figure comes from
{
  const l = extractFunction('loop');
  assert(/if\(perfOn\)\{ const _w0 = _pnow\(\);/.test(l),
    'the callback is stamped at the TOP of loop, right after the rAF re-arm');
  assert(/queueMicrotask\(_mark\)/.test(l) && /Promise\.resolve\(\)\.then\(_mark\)/.test(l),
    'and closed by a MICROTASK, which runs the moment the JS stack empties — i.e. exactly when loop() ' +
    'returns. That brackets every path out of the loop including its early returns, with no ' +
    'end-of-function hook to keep in step, and it has a fallback');
  assert(/_prof\.work \+= _pnow\(\) - _w0;/.test(l), 'and it accumulates into the same window as the rest');
  const i = l.indexOf('requestAnimationFrame(loop)'), j = l.indexOf('const _w0');
  assert(i >= 0 && j > i, 'the re-arm comes first, so a throw in the stamp cannot stop the game');
  assert(/if\(perfOn\)/.test(l.slice(0, j + 1)),
    'gated, so a normal session queues no microtask per frame at all');
}
{
  const u = extractFunction('updatePerfHud');
  assert(/_prof\.work=0;/.test(u), 'the work accumulator is reset with the rest of the window');
  assert(/idle '\+idle\.toFixed\(1\)\+' ms \('\+idleWhy\+'\)/.test(u), 'the HUD shows it, labelled');
  assert(/other '\+other\.toFixed\(1\)/.test(u), '...beside the work figure it used to be confused with');
  assert(!/other=Math\.max\(0, totMs - r - p - n - mi\)/.test(u),
    'and the old whole-frame residual is gone — that formula was the defect');
}
{ // the reasoning is recorded where the next reader will be, because I got this wrong from the same line
  assert(/A RESIDUAL PRESENTED AS A COST/.test(src), 'why it changed is written at the site');
  assert(/`idle` is NOT automatically good/.test(src),
    '...including that idle is not automatically healthy, which is the half a label could hide');
}

done('build 1426: the frame meter separates work we did from waiting we did not');
