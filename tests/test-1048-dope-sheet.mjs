// (build 1048) DOPE SHEET + IN-PLACE FLATTENER — the timeline grows one labeled row per keyed
// bone (canvas sized to fit, keys grabbable on any row, empty-row clicks select the bone and
// scrub, double-click keys the row under the pointer), and "Flatten to in-place" subtracts the
// hips X/Z drift so an authored walk becomes a clean looping locomotion clip.
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- executable: the flattener ----
{
  const fn = new Function(extractFunction('_aeFlattenRootMotion', src) + '\nreturn _aeFlattenRootMotion;')();
  const clip = { dur: 1, tracks: { hips: { p: [
    [0,   0,    0,    0],
    [0.5, 1.1,  0.08, 0.5],    // mid-stride: drifted + a vertical bob
    [1,   2,    0,    1],      // ends 2 hip-heights forward-right
  ] } } };
  const d = fn(clip);
  near(d.x, 2, 1e-9, 'the removed X drift is reported');
  near(d.z, 1, 1e-9, '...and Z');
  const p = clip.tracks.hips.p;
  eq(p[0].slice(1).join(','), '0,0,0', 'the first key is untouched');
  eq(p[2].slice(1).join(','), '0,0,0', 'the last key lands exactly on the first — the loop closes');
  near(p[1][1], 0.1, 1e-6, 'mid-keys keep only their NON-linear part (1.1 - half the drift)');
  near(p[1][2], 0.08, 1e-9, 'the vertical bob survives untouched');
  near(p[1][3], 0, 1e-6, 'the Z mid-drift is gone too');
  eq(fn(clip).x, 0, 'flattening twice is a no-op (already in place)');
  eq(fn({ dur: 1, tracks: {} }), null, 'no hips positions -> null (the button explains)');
  eq(fn({ dur: 1, tracks: { hips: { p: [[0.5, 1, 0, 1]] } } }), null, 'a single key has no drift to remove');
}

// ---- executable: the dope-sheet row list ----
{
  const rows = new Function('_aeClip', '_aeSel', "const CA_SLOTS=['hips','spine0','head','L:uparm','R:lowleg'];\nconst _aeRigMode='human', _aeBones=null;\n"
    + extractFunction('_aeTLRows', src) + '\nreturn _aeTLRows();');
  eq(rows({ tracks: { head: {}, hips: {} } }, '').join(','), 'hips,head', 'keyed bones appear in skeleton order');
  eq(rows({ tracks: { head: {} } }, 'R:lowleg').join(','), 'head,R:lowleg', 'the selected bone always shows, keyed or not');
  eq(rows({ tracks: {} }, 'L:uparm').join(','), 'L:uparm', 'a fresh clip still shows the selected bone as a target row');
  eq(rows(null, '').length, 0, 'no clip, no rows');
}

// ---- geometry + drawing ----
assert(/const cssH=Math\.max\(64, AE_TL_RULER \+ rows\.length\*rowCss \+ 8\);/.test(src), 'the canvas grows to fit the rows');
assert(/if\(cv\.style\.height!==cssH\+'px'\) cv\.style\.height=cssH\+'px';/.test(src), '...resizing only when the row count changes');
assert(/const padL=86\*dpr/.test(src), 'the left gutter holds the row labels');
assert(/ctx\.fillText\(_caSlotLabel\(slot\)\.slice\(0,13\), g\.padL-6\*dpr, yc\);/.test(src), 'each row is labeled with its friendly bone name');
assert(/const rowCss=rows\.length>9 \? 12 : 15;/.test(src), 'many rows pack tighter instead of overflowing');

// ---- interaction: rows are bones ----
{
  const bind = extractFunction('_aeBindTL', src);
  assert(/const rowAt=\(e\)=>\{/.test(bind), 'pointer-to-row mapping exists');
  assert(/if\(y<g\.ruler\) return null;/.test(bind), 'the ruler band stays a pure scrub zone');
  assert(/else if\(slot!==_aeSel\)\{ _aeSel=slot; _aeRenderTree\(\); _aeRenderInspector\(\); \}   \/\/ keep the multi-selection, make this row active/.test(bind),
    'grabbing a key on another row makes it active (build 1063: keeping any cross-bone selection)');
  assert(/\/\/ empty row spot: a CLICK selects the bone \+ jumps time; a DRAG sweeps a marquee across rows \(build 1056\/1063\)/.test(bind),
    'clicking an empty row still selects its bone and jumps the playhead (dragging became the cross-row marquee)');
  assert(/const slot=rowAt\(e\) \|\| _aeSel;   \/\/ build 1048: double-click keys the row under the pointer/.test(bind),
    'double-click keys whichever row is under the pointer');
}

// ---- the flatten button ----
assert(/fb\.textContent='Flatten to in-place';/.test(src), 'the button exists in the clip settings');
assert(/if\(_aeRootPathOn\) _aeRootPathSync\(\);/.test(extractFunction('_aeEnsureDom', src)) || /_aeQueueRebuild\(\); _aeDrawTL\(\); if\(_aeRootPathOn\) _aeRootPathSync\(\);/.test(src),
  'flattening refreshes the Root path so the result is visible immediately');
assert(/toast\('Drift removed \('/.test(src), '...and reports how much drift was removed');
assert(/dope sheet<\/b>/.test(manual) && /Flatten to in-place<\/b>/.test(manual), 'the field manual covers both');

done('build 1048: the timeline is a dope sheet, and authored walks flatten into clean in-place loops');
