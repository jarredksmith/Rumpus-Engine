import { html, assert, eq, done } from './harness.mjs';
// build 1330 — prompted by a report from play that could not be placed: a red bar reading
//   "ERROR: Promise: Cannot access 'FX_PRESETS' before initialization"
// and nothing else. In a 47,000-line single file a message alone narrows it to nothing, and the case that
// is HARDEST to place — a rejected promise, which has no line number of its own — was the one the old code
// stripped hardest: it rebuilt a bare ErrorEvent from `reason.message` and threw the stack away.
//
// The overlay lives in its own <script> before the engine, so it is pinned against `html`, not gameSource().
//
// Verified in a real browser (scratchpad/errtest.mjs, errtest2.mjs):
//   a throw      -> "ERROR: Uncaught Error: a real throw" + at inner / at outer / at eval
//   a rejection  -> "ERROR: Promise: Cannot access 'FX_PRESETS'..." + at loadSomething
//   41 more      -> the FIRST is still shown, with "(+41 more errors since ...)"
//   selection    -> computed user-select is "text"

// ---------------------------------------------------------------- the stack survives both routes
{
  assert(/_errShow\('ERROR', m, \(e\.error && e\.error\.stack\) \|\| e\._stack, e\.filename\?\(e\.filename\+':'\+e\.lineno\):''\)/.test(html),
    'a throw passes its own stack…');
  assert(/ev\._stack = \(r && r\.stack\) \|\| '';/.test(html), '…and a REJECTION carries its stack across the re-dispatch');
  assert(/Carry the stack ACROSS the re-dispatch/.test(html), 'with the reason recorded');
  assert(/the very case that is hardest to place, because it has no line\n     number of its own/.test(html),
    '...and why that route mattered most');
  // the frames are trimmed, because past the first few it is the frame loop calling itself
  assert(/\.filter\(l=>\/\^at \|@\/\.test\(l\)\)\.slice\(0,6\)/.test(html), 'the first six frames are kept');
  assert(/\(no stack \\u2014 the browser did not attach one\)/.test(html),
    'and a missing stack says so rather than showing an empty line');
}

// ---------------------------------------------------------------- the FIRST error wins
{
  assert(/if\(_errFirst\)\{ _errMore\+\+;/.test(html), 'later errors are counted, not painted…');
  assert(/the FIRST one is shown, it is usually the cause/.test(html), '…because the first one is usually the cause');
  assert(/A failure inside the frame loop repeats at 60 Hz and\n\/\/     the original was overwritten before anyone could read it/.test(html),
    'with the failure mode that motivated it: a 60 Hz loop overwrote the original');
  assert(/_errMore\+'\ more error'\+\(_errMore>1\?'s':''\)/.test(html), 'and the count is pluralised');
}

// ---------------------------------------------------------------- it can actually be sent to someone
{
  assert(/user-select:text;-webkit-user-select:text;/.test(html), 'the box is selectable…');
  assert(/max-height:42vh;overflow:auto/.test(html), '…and scrolls rather than covering the screen');
  assert(/because the whole point is that it gets sent to someone/.test(html), 'with the reason');
}

// ---------------------------------------------------------------- build 659's exemption is intact
{
  assert(/if\(\/ResizeObserver loop\/i\.test\(m\)\) return;/.test(html),
    'the benign ResizeObserver warning is still swallowed — it has no stack and nothing is broken');
  assert(/let box = null;   \/\/ build 838/.test(html),
    'and build 838’s declaration is still there — the reporter itself once threw "box is not defined"');
}

done('build 1330: the error overlay reports WHERE. A report from play arrived as "Promise: Cannot access \'FX_PRESETS\' before initialization" with no stack, no line and no way to place it in a 47,000-line file — and the rejected-promise route, the one case with no line number of its own, was exactly where the old code threw the stack away: it rebuilt a bare ErrorEvent from reason.message alone. The stack now survives both routes, the FIRST error is kept rather than the last (a failure inside the frame loop repeats at 60 Hz and overwrote the original before anyone could read it, with later ones counted instead), and the box is selectable and scrolls, because the whole point of it is that it gets sent to someone. Verified in a real browser: a throw shows three named frames, a rejection shows the async function it came from, and 41 subsequent errors leave the first one on screen with a count beside it');
