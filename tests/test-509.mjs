import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 659: "ResizeObserver loop completed with undelivered notifications" was painting the scary on-screen
// error box. It's a benign browser quirk (layout needed an extra frame). Two-part fix: the global error handler
// swallows that specific message, and the editor FAB-placement observer now defers to requestAnimationFrame so
// it never writes layout synchronously inside the observer callback (the thing that generated the warning).

// --- the on-page error overlay ignores the benign message ---
assert(/if\(\/ResizeObserver loop\/i\.test\(m\)\) return;/.test(html), 'the global error handler swallows the ResizeObserver-loop warning');
// ...but still reports real errors (the box-building code is still there)
assert(/box = document\.createElement\('div'\); box\.id='errbox';/.test(html), 'genuine errors still surface in the on-screen box');

// --- root-cause fix: the FAB observer is rAF-coalesced, not synchronous ---
assert(/let _fabRaf=0; new ResizeObserver\(\(\)=>\{ if\(_fabRaf\) return; _fabRaf=requestAnimationFrame\(\(\)=>\{ _fabRaf=0; placeFab\(\); \}\); \}\)\.observe\(ed\)/.test(src), 'placeFab runs on the next frame, coalesced, so the observer never re-enters layout');
// the old synchronous form is gone
assert(!/new ResizeObserver\(placeFab\)\.observe\(ed\)/.test(src), 'the old synchronous observer form is gone');

done('build 659: silence the benign ResizeObserver-loop warning + fix its source');
