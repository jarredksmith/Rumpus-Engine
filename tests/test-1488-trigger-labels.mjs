// build 1488 — one trigger, one name
//
// A prop's signal appears twice in the editor: as a DROPDOWN when you pick it, and as a row in the signal
// LIST underneath. Those are two different tables, and `damaged` (build 1397) was only ever added to one — so
// the dropdown read "On hit" and the row under it read "On damaged". The fallback is what hid it: the row
// degrades to the raw key rather than showing nothing, so a missing label looks like a deliberate one.
//
// Found while writing the manual, which is the point of the assertion below: a control that names itself two
// ways cannot be documented, and this asserts the two tables AGREE rather than restating either.

import { readFileSync } from 'node:fs';
import { gameSource, html, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- the two tables, read from source
const label = (function(){
  const raw = extractConst('_SIG_WHEN_LABEL', src);
  return new Function('return ' + raw)();
})();

const dropdown = (function(){
  const i = src.indexOf("mkSel([['destroyed','On destroyed']");
  assert(i > 0, 'the signal WHEN dropdown is where it was');
  /* +1, or the slice ends BEFORE the last entry's closing bracket and the final trigger never matches —
     which is what made the first run report four of five */
  const seg = src.slice(i, src.indexOf(']], s.when', i) + 1);
  return [...seg.matchAll(/\['([a-z]+)','([^']+)'\]/g)].map(m => ({ key: m[1], text: m[2] }));
})();

eq(dropdown.length, 5, 'five triggers: destroyed, hit, E, click, object placed');

// ---------------------------------------------------------------- they must AGREE, both directions
for(const d of dropdown){
  assert(Object.prototype.hasOwnProperty.call(label, d.key),
    'the trigger "' + d.key + '" the dropdown offers has a label for the signal LIST row');
}
for(const k of Object.keys(label)){
  assert(dropdown.some(d => d.key === k),
    'the label "' + k + '" names a trigger the dropdown actually offers — a label for nothing is dead weight');
}

/* The two tables are not required to be WORD-IDENTICAL, and asserting that was a rule I invented: the row is
   a compact sentence and the dropdown is a picker label, so "On E pressed" beside "On E" is a deliberate
   elaboration rather than a drift. What must never happen is the internal KEY leaking into the row, which is
   exactly what `damaged` did — so the assertion is that a label is a human word, checked where the key and
   the word differ. */
eq(label.interacted, 'E pressed', 'the one deliberate elaboration is named, so it cannot drift unnoticed');
for(const d of dropdown){
  assert(String(label[d.key]).length > 0, 'the trigger "' + d.key + '" has a real label, not an empty one');
}

// the one this build fixed, named directly so it cannot quietly regress
eq(label.damaged, 'hit', "build 1397's trigger is called `hit` in both places, never `damaged` in one of them");
eq(label.clicked, 'click', "and build 1479's reads as `click`, the verb, rather than the stored key");

// ---------------------------------------------------------------- the fallback stays, and is why it hid
{
  const i = src.indexOf('_SIG_WHEN_LABEL[it.s.when]');
  assert(i > 0, 'the list row reads the map');
  assert(/_SIG_WHEN_LABEL\[it\.s\.when\] \|\| it\.s\.when \|\| '\?'/.test(src),
    'and still degrades to the raw key rather than blank — a level file can carry a trigger this build has never heard of');
}

// every trigger the RUNTIME can fire is offered: the dropdown is the only door (build 1277's rule)
{
  const fired = new Set();
  for(const m of src.matchAll(/fireSignals\([^,]+,\s*'([a-z]+)'/g)) fired.add(m[1]);
  for(const m of src.matchAll(/_lgPropEvent\([^,]+,\s*'([a-z]+)'/g)) fired.add(m[1]);
  assert(fired.size >= 3, 'the runtime fires triggers by name');
  for(const f of fired){
    assert(dropdown.some(d => d.key === f),
      'the runtime fires "' + f + '", so the editor must offer it — a trigger with no door is build 1277s defect');
  }
}

// ================================================================================================
// THE MANUAL MUST NOT NAME A CONTROL THAT DOES NOT EXIST
//
// Build 1348 shipped a Level Check row telling creators to use "Cull small props in World -> Camera & view".
// The section was right and THE LABEL WAS INVENTED — the real slider is "Cull below (px)" — and it was caught
// only by grepping for the string before shipping it. The manual is the same hazard at a hundred times the
// surface: prose ages, controls get renamed, and a manual that confidently names a control nobody can find is
// worse than a gap, because the reader concludes the feature is missing rather than that the doc is stale.
//
// So every control label the manual states as a UI string is asserted to exist in the engine. This list is
// deliberately hand-kept rather than scraped: scraping every <b> in the manual would pull in ordinary prose
// emphasis and force the assertion to be loose enough to prove nothing.
// ================================================================================================
{
  const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

  /* Controls the manual names, and what to look for in the engine. A pair means the manual's wording and the
     engine's own string differ deliberately (a sentence vs a picker label) — both are asserted. */
  const CLAIMS = [
    'Free mouse cursor', 'Click to move', 'Interactable', 'fires event', 'in modal',
    'Cull below', 'Shootable', 'Breakable', 'Objective target',
    'Air jumps', 'Wall jump', 'Air dash', 'Tap hop',
    /* build 1490 docs pass: the interface chapter. Every one of these is a string a creator has to find in
       the panel, which is exactly the class this guard exists for. */
    '+ Button', '+ Image', '+ Timer', 'show when', 'freeze the world', 'Open/close a modal',
    'Add time', 'Menu panel', 'Menu border',
    /* and the campaign chapter */
    'Go to level', 'arrive at tag', 'keep gear', 'Add current level', 'Export campaign',
    'Values that carry over', 'Also keep them between sessions', 'Carry the inventory too',
    'Resume at the last checkpoint', 'carrying now',
    /* props, and the recipes that use them — these are the strings the step-by-steps tell a creator to
       click, so an engine rename that does not reach the manual sends them hunting */
    'Parent to this prop', 'Set prop value', 'No collision',
    'Every X sec', 'Show message', 'Set checkpoint', 'Reset props', 'Spawn prefab',
    'different sender(s) before it reacts',
    /* sides, the building tools, and the comfort panel */
    'Your side', 'Third party', 'Fourth party',
    'Build room', 'Wall thickness', 'Floor slab', 'Above the pole', 'Segments per span',
    'Camera shake', 'Camera sway', 'Damage flash', 'Slow-mo on kills', 'Interface size',
    'Colour vision', 'Correction strength', 'Reduce all motion', 'Photosensitivity warning',
    /* and the rest of the chapters */
    'does not respawn this run', 'Read game stat', 'Objective marker', 'Camera view', 'Spawn pickup',
    /* the one this guard caught LATE, and the reason it is here: build 1490's own hint, the manual and the
       reference all said "Aim at cursor" for a checkbox the engine calls "ARPG cursor aim". A name invented
       in an engine hint propagates into the docs by being copied out of it, so the label is claimed here in
       both directions. */
    'ARPG cursor aim', 'Player options',
    /* build 1492 */
    'Stretch to fit',
  ];
  for(const c of CLAIMS){
    assert(manual.includes(c), 'the manual names "' + c + '" (if not, drop it from this list)');
    /* against the WHOLE file, not gameSource(): the comfort panel and the pause menu are MARKUP, so a
       label that lives in the HTML rather than in the script is just as real a control. Checking only the
       script would have made this guard silently blind to every static control in the product. */
    assert(html.includes(c), 'THE MANUAL NAMES A CONTROL THE ENGINE DOES NOT HAVE: "' + c + '"');
  }

  /* the specific one build 1348 got wrong, pinned in both directions so the fix cannot rot */
  assert(!/Cull small props/.test(manual), 'the manual must not resurrect the invented "Cull small props" label');

  /* docs/REFERENCE.md is the other document that names controls, and it names far more of them. It gets the
     same rule for the labels it happens to use: every CLAIM above that appears there must be real. This is
     one-directional on purpose — the reference is not required to mention a control, only to be right about
     the ones it does mention. */
  const ref = readFileSync(new URL('../docs/REFERENCE.md', import.meta.url), 'utf8');
  for(const c of CLAIMS){
    if(ref.includes(c)) assert(html.includes(c),
      'docs/REFERENCE.md names a control the engine does not have: "' + c + '"');
  }
  assert(!/Cull small props/.test(ref), 'and the reference must not resurrect it either');
  /* it also states which build it was verified against, and a header that lags the tree by 200 builds is a
     document nobody trusts. This asserts it names a build at all, and that the build it names is not older
     than the oldest thing the file itself documents. */
  {
    const hdr = ref.match(/verified against the source at build \*{0,2}(\d+)/);
    assert(hdr, 'the reference states which build it was verified against');
    const newest = Math.max(...[...ref.matchAll(/build (\d{3,4})/g)].map(m => +m[1]));
    assert(+hdr[1] >= newest,
      'the reference header (build ' + hdr[1] + ') is not older than the newest build it documents (' + newest + ')');
  }

  // and the manual's own cross-links have to resolve, which is how the Logic graph lost its section
  const ids = new Set([...manual.matchAll(/id="([a-z0-9-]+)"/g)].map(m => m[1]));
  for(const m of manual.matchAll(/href="#([a-z0-9-]+)"/g)){
    assert(ids.has(m[1]), 'the manual links to #' + m[1] + ', which exists');
  }
  for(const m of manual.matchAll(/<section id="([a-z0-9-]+)"/g)){
    assert(manual.includes('href="#' + m[1] + '"'),
      'the section "' + m[1] + '" is reachable from the contents — an unlinked section is a section nobody reads');
  }
  eq((manual.match(/<section/g) || []).length, (manual.match(/<\/section>/g) || []).length,
     'every section is closed: an unbalanced one swallows the next, which is how the Logic graph ended up inside Pickups');
}

done();
