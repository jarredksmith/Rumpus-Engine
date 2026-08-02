import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1293: `renderEditorFields` tore down and re-created the WHOLE panel on every call — every mode's
// sections, whichever mode was showing. Measured in the real editor on the stock level, in Build mode
// (the default, and where every gizmo drag, selection change and undo happens): the Environment, Enemies,
// Objectives, Crosshair and Loot hosts held 1,867 DOM nodes between them, ALL of them off screen, and every
// one was destroyed and rebuilt on every call.
//
//   Build mode      26.7 ms -> 8.1 ms      panel 5,191 nodes -> 3,150
//   Scene/Enemies/Rules/HUD    unchanged — those modes show the sections, so they build them
//
// It is 82% of what a fast undo costs (build 1291 measured serializeLevel beside it at 5.8 ms), and it runs
// on every selection change and every field edit, not just undo.

const onScreen = new Function(extractFunction('_edOnScreen') + '; return _edOnScreen;')();
const anyOn = new Function(extractFunction('_edOnScreen') + '\n' + extractFunction('_edAnyOnScreen') +
  '; return _edAnyOnScreen;')();

// ---------------------------------------------------------------- the predicate
{
  eq(onScreen({ offsetParent: {} }), true, 'an element with an offset parent is on screen');
  eq(onScreen({ offsetParent: null }), false,
    'offsetParent null is exactly "display:none somewhere above me" — which covers BOTH the hidden mode and the collapsed fold, without this function knowing which is which');
  eq(onScreen(null), false, 'a missing host is not on screen');
  eq(onScreen(undefined), false);
  // ON ERROR IT ANSWERS TRUE — the old behaviour. A panel that builds too much is a slow editor;
  // a panel that builds too little is an empty one, and that is the far worse failure.
  eq(onScreen({ get offsetParent() { throw new Error('detached'); } }), true,
    'a throwing lookup falls back to building, never to skipping');
}
{
  eq(anyOn([]), false, 'nothing to show, nothing to build');
  eq(anyOn([{ offsetParent: null }, { offsetParent: null }]), false, 'all hidden -> skip');
  eq(anyOn([{ offsetParent: null }, { offsetParent: {} }]), true, 'ANY one visible builds them all');
  eq(anyOn([{ offsetParent: {} }, { offsetParent: null }]), true, '...whichever one it is');
  eq(anyOn([null, undefined, { offsetParent: {} }]), true, 'missing hosts do not stop a present one');
  eq(anyOn([null, undefined]), false);
  { // it stops at the first hit rather than touching every element
    let looked = 0;
    const el = () => ({ get offsetParent() { looked++; return {}; } });
    anyOn([el(), el(), el()]);
    eq(looked, 1, 'short-circuits — offsetParent forces layout, so asking six times would be the cost back');
  }
}

// ---------------------------------------------------------------- the gate is ALL-OR-NOTHING per group
{
  const fn = extractFunction('renderEditorFields');
  assert(/if\(worldHost && _edAnyOnScreen\(\[worldHost, enemyHost, gameHost, lootHost, crosshairHost\]\)\)\{/.test(fn),
    'the global block runs when ANY of its five hosts is visible');
  // Deliberately not per-host: those five are built INTERLEAVED across 3,000 lines by helpers that take a
  // host argument, so gating each one would mean a null host reaching every build site. Any one visible
  // builds all five — less aggressive, and a section can never be half-built.
  assert(/deliberately less aggressive than gating each host/.test(src),
    'and the source says why it is not per-host, which is the question the next reader will have');
  assert(/const invItemsHost = editorEl\.querySelector\('#edInvItems'\); if\(invItemsHost && _edOnScreen\(invItemsHost\)/.test(fn),
    'the inventory host is separate from that block, so it gates on its own visibility');
}

// ---------------------------------------------------------------- expanding a fold must rebuild it
{
  // Nothing called renderEditorFields on a fold toggle before this build, because the content was always
  // there. With the gate, a section skipped while hidden is EMPTY until something rebuilds it.
  const stat = src.slice(src.indexOf("s.querySelector('.edSecHead').onclick"));
  const body = stat.slice(0, stat.indexOf('};') + 2);
  assert(/if\(!s\.classList\.contains\('collapsed'\) && typeof renderEditorFields==='function'\) renderEditorFields\(\);/.test(body),
    'the static fold rebuilds on expand');
  assert(/s\.classList\.toggle\('collapsed'\);[\s\S]*renderEditorFields\(\)/.test(body),
    '...after the class is toggled, or the visibility test would still read the old state');
  assert(/head\.onclick = \(\)=>\{ sec\.classList\.toggle\('collapsed'\); if\(!sec\.classList\.contains\('collapsed'\) && typeof renderEditorFields==='function'\) renderEditorFields\(\); \};/.test(src),
    'and so does the JS-built fold — one of these without the other is a section that stays blank');
  // ONLY ON EXPAND. Collapsing reveals nothing, and rebuilding there would be exactly the cost removed.
  eq((body.match(/renderEditorFields\(\)/g) || []).length, 1, 'the static fold rebuilds once, not on both edges');
  assert(/Only on EXPAND: collapsing reveals nothing/.test(src), 'and that asymmetry is stated');
}

// ---------------------------------------------------------------- the paths that reveal a section
{
  // applyEditorMode is what hides these (it sets display on .edSection by mode), so setEditorMode is the
  // path that must bring them back — and it must show them BEFORE it rebuilds, or the render sees the old
  // visibility and skips the very sections the mode switch just revealed.
  assert(/editorEl\.querySelectorAll\('\.edSection'\)\.forEach\(sx=>\{ sx\.style\.display = \(secs\.indexOf\(sx\.dataset\.sec\)>=0\) \? '' : 'none'; \}\);/.test(src),
    'applyEditorMode is what hides the sections');
  const sem = extractFunction('setEditorMode');
  assert(/applyEditorMode\(\);/.test(sem) && /renderEditorFields\(\);/.test(sem),
    'setEditorMode does both');
  assert(sem.indexOf('applyEditorMode()') < sem.indexOf('renderEditorFields()'),
    'IN THAT ORDER — reveal, then build. Reversed, a mode switch would land on an empty panel.');
}

// ---------------------------------------------------------------- the measurement is recorded
{
  assert(/1,867 DOM nodes between them, ALL SIX are\n\/\/ off screen/.test(src),
    'what was being rebuilt for nobody is recorded beside the code');
  assert(/26\.7 ms/.test(src) && /82% of what a fast undo now costs/.test(src),
    '...with the cost, and what share of the interaction it was');
  assert(/a panel that builds too much is a\n\/\/ slow editor, a panel that builds too little is an empty one/.test(src),
    'and the direction the fallback leans, which is the whole safety argument');
}

done('build 1293: the editor panel stops rebuilding what nobody can see — renderEditorFields re-created every mode’s sections on every call, and in Build mode (the default, where every gizmo drag and selection change happens) that was 1,867 DOM nodes, all of them off screen, on every interaction: 26.7 ms -> 8.1 ms, panel 5,191 nodes -> 3,150. The gate is offsetParent, which covers the hidden mode and the collapsed fold alike without a section map to keep in sync; it is all-or-nothing per group so a section can never be half-built; expanding a fold now rebuilds it; and every error path answers "build it", because a slow editor beats an empty one');
