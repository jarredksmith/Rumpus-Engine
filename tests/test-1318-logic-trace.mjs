import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1318 — editor audit 4.9, MED, and the audit's own pick for leverage:
//
//   "logicFailures surfaced through levelIssues is good and was worth shipping. There is still NO LIVE
//    PULSE, no wire highlight, no variable watch, no breakpoint. The graph is now 22 node types, 26 verbs
//    and an expression language — expressive enough that 'WHY DIDN'T THAT FIRE' is now a real question with
//    no instrument. `_lgPulse` is one function; flashing the node DOM as it executes is ~15 lines and would
//    be the highest-leverage editor addition in the file."
//
// Measured on a real graph in the real board (tools/probe/logic-trace.mjs): a chain of four nodes with the
// fourth wired to nothing.
//   one pulse    -> n1, n2, n3 recorded; wires 0 and 1 recorded; n4 ABSENT
//   ten pulses   -> counts 10 / 10 / 10, and the DOM badges read "10", "10", "10" and NOTHING on n4
//   the glow     -> the fired node carries the accent shadow, the unfired one does not
//   the wires    -> 5.97 px against a 2.5 px base
//   after decay  -> the glow is gone and the BADGE REMAINS
//   board closed -> trace off, frame loop cancelled, ZERO pulses recorded

// ---------------------------------------------------------------- the recorder, executed
const rig = () => {
  const ST = { now: 1000 };
  const fn = new Function('ST',
    'const performance = { now: () => ST.now };\n' +
    'let _lgTraceOn = false;\nconst _lgHitN = new Map(), _lgHitW = new Map();\n' +
    extractFunction('_lgTraceNode') + '\n' + extractFunction('_lgTraceWire') + '\n' + extractFunction('_lgTraceClear') +
    '; return { node:_lgTraceNode, wire:_lgTraceWire, clear:_lgTraceClear, N:_lgHitN, W:_lgHitW,' +
    ' on:(v)=>{ _lgTraceOn=v; }, isOn:()=>_lgTraceOn };')(ST);
  return { fn, ST };
};
{ // it records nothing until the board is open — a published level pays one boolean per pulse
  const { fn } = rig();
  for (let i = 0; i < 100; i++) { fn.node('n1'); fn.wire(0); }
  eq(fn.N.size, 0, 'a hundred pulses with the board CLOSED record nothing');
  eq(fn.W.size, 0);
  fn.on(true);
  fn.node('n1'); fn.wire(0);
  eq(fn.N.size, 1, '...and the first pulse after opening does');
}
{ // the count accumulates and the timestamp refreshes
  const { fn, ST } = rig(); fn.on(true);
  for (let i = 0; i < 7; i++) { ST.now += 100; fn.node('n1'); }
  eq(fn.N.get('n1').n, 7, 'seven pulses is a count of seven');
  eq(fn.N.get('n1').t, ST.now, '...and the timestamp is the LAST one, which is what the flash decays from');
  fn.node('n2');
  eq(fn.N.get('n2').n, 1, 'a different node keeps its own count');
  fn.clear();
  eq(fn.N.size, 0, 'and RESET clears them, so a creator can ask the question again from a known state');
}

// ---------------------------------------------------------------- the two hooks, in the right places
{
  const pulse = extractFunction('_lgPulse');
  assert(/_lgTraceNode\(id\);   \/\* build 1318: after the node is known to be real, before it runs \*\//.test(pulse),
    'every node execution is recorded, in the one function they all go through');
  assert(pulse.indexOf('const n=_lgNode(id); if(!n) return;') < pulse.indexOf('_lgTraceNode(id);'),
    '...after the node is resolved, so a wire pointing at a deleted node does not invent a hit');
  assert(pulse.indexOf('_lgTraceNode(id);') < pulse.indexOf('switch(n.type)'),
    '...and before the switch, so EVERY node type is covered including any added later');
  // the budget guard comes first, so a runaway loop cannot also flood the recorder
  assert(pulse.indexOf('if(++_lgBudget > 400)') < pulse.indexOf('_lgTraceNode(id);'),
    'the pulse budget still returns first — a wiring loop cannot fill the trace either');
  const follow = extractFunction('_lgFollow');
  assert(/for\(let i=0;i<logicGraph\.wires\.length;i\+\+\)\{ const w=logicGraph\.wires\[i\];\n    if\(w\.a===id && w\.o===out\)\{ _lgTraceWire\(i\); _lgPulse\(w\.b, w\.i\); \} \}/.test(follow),
    'and every wire TRAVERSAL is recorded, by index');
  assert(/the behaviour is unchanged/.test(follow),
    '...with the loop converted from for-of only to name the wire');
}

// ---------------------------------------------------------------- the painter
{
  const paint = extractFunction('_lgTracePaint');
  assert(/if\(!_lgTraceOn \|\| !_lgBoard\)\{ _lgTraceRaf = 0; return; \}/.test(paint),
    'the painter stops itself when the board goes away');
  assert(/_lgBoard\.querySelectorAll\('\[data-node\]'\)/.test(paint),
    'it pokes the DOM the renderer already built…');
  assert(!/_lgRender\(\)/.test(paint),
    '…and never re-renders the board, which would fight every drag, every open select and every field being typed into');
  assert(/rides the DOM|Pokes the DOM the renderer already built rather than re-rendering/.test(src),
    'with that reason recorded');
  // the flash decays, the badge does not — the half that answers the audit's question
  assert(/const k = h \? Math\.max\(0, 1 - \(now - h\.t\)\/LG_TRACE_MS\) : 0;/.test(paint),
    'the glow is a linear decay over LG_TRACE_MS');
  assert(/badge\.textContent = h\.n > 999 \? '999\+' : String\(h\.n\);/.test(paint),
    'the COUNT is shown, capped so a hot node cannot widen its own card');
  assert(/\} else if\(badge\) badge\.remove\(\);/.test(paint),
    'and a node with no hits carries NO badge — which is the "why did that not fire" answer, not an absence of feedback');
  assert(/A node\n\/\/ that lights up tells you it fired; a node showing 0 after a minute of play tells you it never did/.test(src),
    'the count is argued for as the half that answers the question');
  assert(/pth\.setAttribute\('stroke-width', \(2\.5 \+ 3\.5\*k\)\.toFixed\(2\)\);/.test(paint),
    'and the wire thickens as the pulse goes down it');
}

// ---------------------------------------------------------------- the variable watch
{
  const w = extractFunction('_lgWatchPaint');
  assert(/const keys = Object\.keys\(logicVars \|\| \{\}\)\.sort\(\);/.test(w),
    'the watch IS logicVars — the graph’s whole memory, so there is nothing to subscribe to or keep in sync');
  assert(/logicVars` IS the graph's whole memory, so listing it is the whole feature/.test(src),
    '...with that stated');
  assert(/const v = logicVars\[k\], changed = _lgWatchPrev\[k\] !== v;/.test(w),
    'a value that changed since the last frame is highlighted');
  // untrusted: a variable NAME comes from the level file, and a VALUE can come from anywhere
  const esc = (w.match(/replace\(\/\[&<>\]\/g,c=>\(\{'&':'&amp;','<':'&lt;','>':'&gt;'\}\[c\]\)\)/g) || []).length;
  eq(esc, 2, 'BOTH the name and the value are escaped — a level file authors both');
  assert(/No variables yet \\u2014 they appear here the moment a Set\/Add\/Math node writes one/.test(w),
    'and an empty store explains itself rather than showing a blank box');
}

// ---------------------------------------------------------------- it costs nothing when closed
{
  assert(/_lgTraceOn = true;\n  if\(!_lgTraceRaf\) _lgTraceRaf = requestAnimationFrame\(_lgTracePaint\);/.test(src),
    'the trace starts with the board…');
  const close = extractFunction('_lgClose');
  assert(/_lgTraceOn=false; if\(_lgTraceRaf\)\{ cancelAnimationFrame\(_lgTraceRaf\); _lgTraceRaf=0; \}/.test(close),
    '…and stops dead with it, frame loop cancelled');
  assert(/A published level running someone else's graph pays\n     one boolean per pulse and nothing else/.test(src),
    'with the cost stated');
  // counts deliberately SURVIVE a close/reopen
  assert(!/_lgTraceClear\(\)/.test(close), 'closing does NOT clear the counts…');
  assert(/Counts survive a close\/reopen on purpose —\n     you open the graph, play, come back, and the numbers are still there to read/.test(src),
    '…because open-the-graph, play, come-back is exactly how the question gets asked');
  assert(/rb\.onclick=\(\)=>\{ _lgTraceClear\(\); _lgTracePaint\(\); \}/.test(src), 'and RESET is explicit');
}
{ // the panel exists and does not cover the thing a creator reaches for
  assert(/id="lgWatchBox"[^>]*right:12px;bottom:12px/.test(src),
    'the watch sits bottom-right, away from the + ADD NODE menu at top-left');
  assert(/id="lgMenu" style="position:absolute;left:14px;top:12px/.test(src), '...which is where that menu is');
  assert(/id="lgTraceReset"/.test(src) && /id="lgWatch"/.test(src), 'with a reset and a list');
}

done('build 1318 (editor audit 4.9): the logic graph shows its work — 22 node types, 26 verbs and an expression language had made "why didn\'t that fire" a real question with no instrument at all. Two hooks (one in _lgPulse, one in _lgFollow) and a painter: a node glows as it executes and carries a running FIRE COUNT, the wire thickens as the pulse travels down it, and a live variable watch lists logicVars with changed values highlighted. The count is the half that answers the audit\'s question — a node lighting up says it fired, a node showing NO badge after a minute of play says it never did. Measured on a real four-node graph in the real board: one pulse recorded three nodes and two wires with the unwired fourth absent, ten pulses read "10" on three badges and nothing on the fourth, the glow decayed while the badge stayed, and with the board CLOSED a hundred pulses recorded exactly zero');
