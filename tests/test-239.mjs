import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 335: (1) a fired 'once' mechanism no longer offers the E prompt,
//            (2) pickup doubles fixed: live pads hide while editing, editor markers hide on close.

// --- once-mechanism prompt ---
const cp = extractFunction('checkProximity');
// build 1451 collapsed the five walks into one, so the scan and the skip are now one condition. What this
// always meant — a spent Once mechanism is rejected BEFORE it can win the distance ranking — is asserted
// directly: the exclusion is part of the test that gates the distance, not a later filter.
const scanI = cp.indexOf("a.trig==='interact'");
assert(scanI > 0, 'xanim interact scan present');
const skip = cp.indexOf("!(a.mode==='once' && a.dest)");
assert(skip > scanI && skip < cp.indexOf('_dXa', skip),
  'spent Once mechanism skipped before distance ranking');
// the toggle-side guard this mirrors is still in place
assert(/if\(a\.mode==='once' && a\.dest\)\{ return; \}/.test(extractFunction('xaToggle')), 'xaToggle still no-ops a fired Once');

// --- pickup visibility lifecycle ---
const te = extractFunction('toggleEditor');
const openI = te.indexOf('refreshPickupMarkers();');
const hidePads = te.indexOf('for(const p of powerups){ if(p.mesh) p.mesh.visible=false; }');
assert(openI > 0 && hidePads > openI, 'editor open: live pads hidden right after markers refresh');
const closeI = te.indexOf('} else {');
const hideMarks = te.indexOf("setPickupMarkersVisible(false);");
assert(hideMarks > closeI, 'editor close: pickup markers hidden (the stuck double)');
assert(te.indexOf('setSpawnMarkersVisible(false)') < hideMarks, 'sits with the other marker teardown');
// close-restore reasoning: the resumed update loop re-shows ready pads itself
assert(/if\(p\.mesh\)\{ p\.mesh\.visible=true; _animatePickup\(p\.mesh, dt\); \}/.test(extractFunction('updatePowerups')), 'updatePowerups re-shows ready pads after the editor closes');
assert(/if\(!isClient && !editorOpen\) updatePowerups\(dt\);/.test(src), 'pads stay frozen while the editor is open');
done();
