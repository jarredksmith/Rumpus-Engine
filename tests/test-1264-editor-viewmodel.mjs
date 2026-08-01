import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1264, reported from play: "I can't see any weapons in the editor — adjusting position for
// FPS, aim, third-person weapon adjustment is impossible." Build 1137 hid the viewmodel whenever the
// editor was open (a critic measured the rifle covering 11% of the authoring viewport). Right about
// BUILDING, wrong about the panels whose entire job is posing the weapon: view framing, the ADS pose
// and the throw pose are all authored BY EYE against a weapon that had been hidden from the author.

const fn = extractFunction('_vmWanted');
function wanted(o = {}) {
  return new Function('activeCam','camera','gun','editorOpen','editorActive','_scopedNow','activeViewMode',
    fn + '; return _vmWanted();')(
      () => (o.cam === 'other' ? {} : 'CAM'), 'CAM',
      { visible: o.gunVisible !== false },
      o.editorOpen !== false, o.target || 'props', !!o.scoped,
      () => o.view || 'fps');
}

{ // THE REPORT: the three weapon-posing targets show the weapon again
  for (const t of ['gun', 'aim', 'grenade'])
    assert(wanted({ target: t }) === true, `the viewmodel is drawn on the ${t} target — the reported bug`);
}
{ // 1137's intent is preserved everywhere else
  for (const t of ['props', 'lights', 'spawns', 'turrets', 'triggers', 'pstart'])
    eq(wanted({ target: t }), false, `still hidden while authoring ${t} (build 1137: it covered 11% of the viewport)`);
}
{ // play is completely unaffected
  assert(wanted({ editorOpen: false, target: 'props' }) === true, 'in PLAY the viewmodel draws regardless of any editor target');
}
{ // the older early-outs still win, in order
  eq(wanted({ target: 'gun', gunVisible: false }), false, 'a hidden gun mesh still wins — that flag is gameplay state (third person, melee)');
  eq(wanted({ target: 'gun', cam: 'other' }), false, 'the editor’s top-down camera still has no viewmodel');
  eq(wanted({ target: 'gun', scoped: true }), false, 'and looking through the optic still hides it');
}
{ // a non-first-person authoring camera has no first-person weapon to pose — except for the ADS pose,
  // which is what a creator tunes precisely when the level ships in another view
  eq(wanted({ target: 'gun', view: 'top' }), false, 'gun framing is not posed from a top-down authoring camera');
  assert(wanted({ target: 'aim', view: 'top' }) === true, 'but the ADS pose still is');
}

// --- the other half: a visible MESH with no PASS draws nothing --------------------------------------
assert(/gun\.visible = \(editorActive==='gun' \|\| editorActive==='aim' \|\| editorActive==='grenade'\);/.test(src),
  'the editor camera makes the gun mesh visible for exactly the targets _vmWanted draws for — the two lists must agree, or a visible mesh sits in a pass that never runs (which is precisely what the report was)');

done('build 1264: the weapon is back in the editor for the three targets that pose it, still hidden for every other kind of authoring, with the mesh-visibility list and the draw-pass list proven to agree');
