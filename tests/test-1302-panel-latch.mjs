import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1302 — REPORTED FROM PLAY: "the weapons editor is getting stuck. If I select one weapon, say
// shotgun, the stats section stays on shotgun no matter what other weapon I choose."
//
// It was not the weapons editor. It was EVERY field in the panel, and it had been there since build 1070.
//
// renderEditorFields throttles to one rebuild per 8 ms and defers the rest to requestAnimationFrame behind
// a `_refQueued` latch. The deferred pass set `_refLast = performance.now()` and THEN called the function,
// which opens by asking whether `now - _refLast < 8`. It always was, by microseconds — so the deferred pass
// re-latched, queued another frame, and repeated: an infinite self-rescheduling loop that never rendered,
// with `_refQueued` stuck true so every later call returned immediately.
//
// Reproduced live before the fix — two picks in one tick left curWep 'pistol' with the panel showing
// shotgun's 650 ms and `_refQueued` true forever, and NO later click recovered it. After: all four cases
// match, latch clear.

// The throttle, lifted and driven with a controllable clock and rAF queue.
const rig = () => {
  const st = { now: 1000, raf: [], renders: 0 };
  const body = extractFunction('renderEditorFields');
  const head = body.slice(0, body.indexOf('// The wholesale rebuild below'));
  const fn = new Function('ST',
    'let _refQueued=false, _refLast=0;\n' +
    'const editorEl = {};\n' +
    'const performance = { now: () => ST.now };\n' +
    'const requestAnimationFrame = (cb) => ST.raf.push(cb);\n' +
    head + '\n  ST.renders++;\n}\n' +
    'return { render:renderEditorFields, queued:()=>_refQueued, last:()=>_refLast };')(st);
  return { fn, st };
};
const flush = (r, frameMs = 16) => {   // service one animation frame
  const due = r.st.raf.splice(0, r.st.raf.length);
  r.st.now += frameMs;
  for (const cb of due) cb();
};

// ---------------------------------------------------------------- the throttle still coalesces
{
  const r = rig();
  r.fn.render();
  eq(r.st.renders, 1, 'the first call renders immediately');
  r.st.now += 2; r.fn.render();
  eq(r.st.renders, 1, 'a second call 2 ms later is deferred, not run — the rebuild costs 8-27 ms');
  eq(r.fn.queued(), true, '...and the latch is set');
  eq(r.st.raf.length, 1, '...with exactly one frame queued');
  r.st.now += 2; r.fn.render(); r.fn.render();
  eq(r.st.raf.length, 1, 'further calls inside the window queue nothing extra — that is the coalescing');
}

// ---------------------------------------------------------------- THE BUG: the deferred pass must RUN
{
  const r = rig();
  r.fn.render();                       // 1 render
  r.st.now += 2; r.fn.render();        // deferred
  flush(r);
  eq(r.st.renders, 2, 'THE DEFERRED PASS ACTUALLY RENDERS — before build 1302 it re-latched and rendered nothing');
  eq(r.fn.queued(), false, '...and clears the latch');
  eq(r.st.raf.length, 0, '...and queues no further frame');
}
{ // and the panel is not stuck afterwards: an ordinary later call renders
  const r = rig();
  r.fn.render(); r.st.now += 2; r.fn.render(); flush(r);
  r.st.now += 500; r.fn.render();
  eq(r.st.renders, 3, 'a click half a second later renders — the report was that it never did again');
}
{ // THE EXACT REPRO: two picks inside one animation frame, then slow clicks
  const r = rig();
  r.fn.render();                       // opening the tab
  r.st.now += 1; r.fn.render();        // pick shotgun
  r.st.now += 1; r.fn.render();        // pick pistol, same tick
  flush(r);
  const after = r.st.renders;
  assert(after >= 2, 'the burst still produces a render');
  for (let i = 0; i < 5; i++) { r.st.now += 1000; r.fn.render(); }
  eq(r.st.renders, after + 5, 'and every later pick renders — five clicks, five rebuilds');
  eq(r.fn.queued(), false, 'the latch is not stuck');
}
{ // A HIGH-REFRESH DISPLAY MUST NOT REINTRODUCE IT. Dropping the _refLast line entirely would work at
  // 60 Hz (16 ms > 8) and fail at 120 Hz (8.3 ms) — the "fixed on my machine" this file has been bitten by.
  for (const frameMs of [4, 8.3, 11, 16, 33]) {
    const r = rig();
    r.fn.render(); r.st.now += 1; r.fn.render();
    flush(r, frameMs);
    eq(r.st.renders, 2, 'the deferred pass renders at a ' + frameMs + ' ms frame');
    eq(r.fn.queued(), false, '...and the latch clears at ' + frameMs + ' ms');
  }
}
{ // it cannot spin: however many frames are serviced, no self-rescheduling loop appears
  const r = rig();
  r.fn.render(); r.st.now += 1; r.fn.render();
  let frames = 0;
  while (r.st.raf.length && frames < 50) { flush(r, 4); frames++; }
  assert(frames <= 1, 'ONE frame drains the queue — the old code queued a fresh frame from inside every callback, forever');
  eq(r.st.raf.length, 0);
}

// ---------------------------------------------------------------- the shape of the fix
{
  assert(/requestAnimationFrame\(\(\)=>\{ _refQueued = false; _refLast = 0; renderEditorFields\(\); \}\)/.test(src),
    'the deferred pass clears the latch and RESETS the clock, so it is guaranteed through the window');
  assert(!/_refQueued = false; _refLast = performance\.now\(\); renderEditorFields\(\)/.test(src),
    'the self-re-arming form is gone');
  assert(/if\(_rnow - _refLast < 8\)\{ _refQueued = true;/.test(src), 'the throttle itself is unchanged — it was right');
  assert(/`_refLast = 0` rather than `performance\.now\(\)`: the deferred pass must be GUARANTEED to get through the/.test(src),
    'and why 0 rather than deleting the line is recorded, with the 120 Hz case that would have failed');
  assert(/It was not the weapons editor\. It was every field in\n  \/\/ the panel, and it had been there since build 1070\./.test(src),
    'the report is recorded with what it actually was — the stats section was where the creator happened to be looking');
}

done('build 1302: the editor panel latched itself shut — reported as "the weapons stats section stays on shotgun whatever I pick", it was every field in the inspector and had been since build 1070. The render throttle\'s deferred pass set _refLast to now and then called the function that throttles against _refLast, so it always re-latched and queued another frame: an infinite self-rescheduling loop that rendered nothing and left _refQueued stuck true, so no later interaction could recover. Two clicks inside one animation frame was enough. The deferred pass now resets the clock rather than setting it, which is guaranteed through the window at any refresh rate — dropping the line would have worked at 60 Hz and failed at 120');
