// build 1435 — the editor never outlines a box it does not have.
//
// REPORTED FROM PLAY, in the same message as the decal ghost: "if I press 'p' and open the editor, it
// shows a huge bounding box on the prop. If I drag one of the gizmo handles, after a second it resizes to
// the correct size." Build 1434 measured `userData.box` and found it exact at load and unchanged by a
// refresh, so the collider was never it. The outline is a THREE.BoxHelper, and three's own update() ends
// its measure with `if ( _box.isEmpty() ) return;` — it KEEPS ITS PREVIOUS GEOMETRY rather than clearing.
//
// So pointing a helper at something with nothing in it yet — a prop whose model has not landed — and then
// setting .visible = true outlines it with whatever the helper last held. For the pooled helpers that was
// worse: they were built as `new THREE.BoxHelper(scene)`, so "whatever it last held" was THE WHOLE LEVEL.
//
// Measured live, with a fully loaded prop as the control in the same run:
//   single helper, empty target   drew the PREVIOUS prop's box (8 x 5.08 x 1.4, 80 m away), visible
//   pooled helper, empty target   drew 142 x 28 x 142 — the entire scene — visible
//   after the fix                 neither is drawn; the control and the recovery are unchanged
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';

const src = gameSource();

/* ---- THE PREMISE, against the real three build --------------------------------------------------- */
// If an upgrade ever makes BoxHelper clear itself on an empty box, this build's reason evaporates and we
// should find out here rather than by reading code that no longer needs to exist.
const upd = THREE.BoxHelper.prototype.update.toString();
assert(/_box\s*\.\s*isEmpty\s*\(\s*\)\s*\)?\s*return/.test(upd.replace(/\s+/g, ' ')) || /isEmpty\(\)\)return/.test(upd.replace(/\s+/g, '')),
  'PREMISE: three.js BoxHelper.update() returns early on an empty box, keeping its previous geometry');

/* ---- EXECUTED: the one outline writer ------------------------------------------------------------ */
const outline = new Function('THREE', `
  const _selB3 = new THREE.Box3();
  ${extractFunction('_selOutline', src)}
  return _selOutline;
`)(THREE);

const mkHelper = () => {
  const h = { visible: true, setCalls: [] };
  h.setFromObject = (o) => { h.setCalls.push(o); return h; };
  return h;
};

const real = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
real.position.set(10, 0, 10); real.updateMatrixWorld(true);
const empty = new THREE.Group();
empty.position.set(-40, 0, -40); empty.updateMatrixWorld(true);
assert(new THREE.Box3().setFromObject(empty).isEmpty(),
  'PREMISE: a prop with nothing in it yet measures to an EMPTY box — the un-landed model, exactly');
assert(!new THREE.Box3().setFromObject(real).isEmpty(), 'PREMISE: and a real one does not');

{
  const h = mkHelper();
  eq(outline(h, real), true, 'a real object is outlined');
  eq(h.visible, true, '...and shown');
  eq(h.setCalls.length, 1, '...measured once');
  eq(h.setCalls[0], real, '...from the object itself');
}
{
  const h = mkHelper();
  h.visible = true;                       // as if it had just outlined something else
  eq(outline(h, empty), false, 'an object with nothing to measure is NOT outlined');
  eq(h.visible, false, '...and the helper is HIDDEN rather than left showing its last box');
  eq(h.setCalls.length, 0, '...and never re-pointed, so it cannot silently keep a stale one');
}
{
  // the reported sequence: outline a big prop, then select one whose model has not landed
  const h = mkHelper();
  outline(h, real);
  outline(h, empty);
  eq(h.visible, false, 'the reported sequence no longer draws the previous prop around the new one');
}
{
  const h = mkHelper();
  eq(outline(h, null), false, 'no object: refused'); eq(h.setCalls.length, 0, '...and untouched');
  eq(outline(null, real), false, 'no helper: refused, and no throw out of a selection change');
}

/* ---- the wiring: one writer, and no bare shows --------------------------------------------------- */
const hi = extractFunction('updateSelectionHighlight', src);
assert(/_selOutline\(selBoxes\[i\], boxOf\(o\)\)/.test(hi), 'the pooled path goes through it');
assert(/_selOutline\(selBox, o\)/.test(hi), 'and so does the single selection');
assert(!/selBox\.visible\s*=\s*true/.test(hi) && !/b\.visible\s*=\s*true/.test(hi),
  'nothing shows an outline without having measured one first');
// hiding is still allowed — that is the safe direction, and both early returns rely on it
assert(/selBox\.visible\s*=\s*false/.test(hi), 'and an empty selection still hides the outline');

const ens = extractFunction('ensureSelBoxes', src);
assert(/new THREE\.BoxHelper\(_selSeed,/.test(ens) && !/BoxHelper\(scene/.test(ens),
  'the pooled helpers are seeded from an empty group, not from the whole scene');
assert(/const _selSeed = new THREE\.Group\(\);/.test(src), '...which is declared once');
assert(!/new THREE\.BoxHelper\(scene/.test(src),
  'and nothing anywhere seeds a helper by measuring the entire level');

/* ---- the outline appears when the model finally lands -------------------------------------------- */
const fin = extractFunction('finalizeProp', src);
assert(/if\(editorOpen && typeof updateSelectionHighlight==='function'\) updateSelectionHighlight\(\);/.test(fin),
  'a landed model refreshes the highlight — otherwise the box only appears on the next nudge');
// `editorOpen` is declared near the top of the file for exactly this class of boot-time callback, and it
// is false for every boot-time call, which is what keeps this out of `selBox`'s temporal dead zone.
const iOpen = src.indexOf('let editorOpen'), iFin = src.indexOf('function finalizeProp');
assert(iOpen > 0 && iFin > iOpen, 'and the flag it reads is declared above it (build 1127/1331 ordering)');

done('build 1435: the editor measures a selection before it outlines it, so a prop whose model has not ' +
     'landed is not wrapped in the previous prop’s box — or, for a pooled helper, in the whole level ' +
     '— and the outline appears the moment the model arrives');
