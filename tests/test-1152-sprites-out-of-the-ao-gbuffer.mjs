// build 1152: transparent decoration stays out of the AO G-buffer.
//
// CONFIRMED by the user's own test: setting World -> Camera & view -> Ambient occlusion to 0 removes the
// square. So the artifact is AO-derived, and a SQUARE AO artifact at a sprite can only come from that
// sprite's footprint in the AO G-buffer, which this hide removes.
//
// Six of my own capture attempts failed to detect it first, and one of them was published as a retraction
// calling the diagnosis disproved. See CLAUDE.md: failing to measure something is not evidence of absence.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the rule, executed
// The hide block is lifted out and driven over a fake scene, because a source pin cannot tell you whether
// the predicate actually catches a SpriteMaterial or restores what it hid.
// build 1158 lifted this out of _renderPostFX into `_aoHideNoDepth`, because the block was applied to the
// world scene only while the muzzle flash lives in the VIEWMODEL scene. Same predicate, one caller became
// two — so this drives the function rather than a block scraped out of the middle of a render pass.
// build 1285: the predicate moved to its own module-scope function (_aoNoDepthMat) so no closure is
// allocated per object. Rigs that EXECUTE _aoHideNoDepth need it too — lifted from real source, not
// restated, so widening the predicate cannot leave these tests passing against a stale copy.
const BLOCK = extractFunction('_aoNoDepthMat') + '\n' + extractFunction('_aoHideNoDepth');
assert(BLOCK, 'the AO prepass sweep is one named function both callers share');

function run(objs){
  const scn = { visible: true, traverse(fn){ for(const o of objs) fn(o); } };
  return new Function('root', 'out', BLOCK + '\nreturn _aoHideNoDepth(root, out);')(scn, []);
}
const obj = (name, mat, visible = true) => ({ name, material: mat, visible });

{
  // the reported case: an additively-blended sprite that does not write depth
  const flash = obj('muzzle', { transparent: true, depthWrite: false });
  const explosion = obj('blast', { transparent: true, depthWrite: false });
  const world = obj('crate', { transparent: false, depthWrite: true });
  const hid = run([flash, explosion, world]);
  eq(hid.length, 2, 'both sprites are hidden for the prepass');
  eq(flash.visible, false, 'the muzzle flash does not enter the G-buffer');
  eq(explosion.visible, false, '...nor the explosion');
  eq(world.visible, true, 'and real geometry still does — the pass would be pointless otherwise');
}
{
  // depthWrite:false alone is enough, even opaque: it does not write depth, so it has no business in a
  // buffer whose whole content is derived from depth
  const o = obj('ring', { transparent: false, depthWrite: false });
  run([o]);
  eq(o.visible, false, 'an opaque object that does not write depth is excluded too');
}
{
  // transparent alone is enough as well: an alpha-blended surface's coverage is not its silhouette
  const o = obj('glass', { transparent: true, depthWrite: true });
  run([o]);
  eq(o.visible, false, 'a transparent surface that does write depth is also excluded');
}
{
  // multi-material meshes: ONE offending slot is enough, because the whole object is drawn or not
  const o = obj('mixed', [{ transparent: false, depthWrite: true }, { transparent: true, depthWrite: false }]);
  run([o]);
  eq(o.visible, false, 'a multi-material mesh with one transparent slot is excluded');
  const clean = obj('solid', [{ transparent: false, depthWrite: true }, { transparent: false, depthWrite: true }]);
  run([clean]);
  eq(clean.visible, true, '...and one that is opaque throughout is kept');
}
{
  // already-hidden objects must not be collected, or restoring would turn them ON
  const off = obj('hidden-editor-gizmo', { transparent: true, depthWrite: false }, false);
  const hid = run([off]);
  eq(hid.length, 0, 'an object that was ALREADY invisible is not collected');
  eq(off.visible, false, '...so restoring cannot switch it on — that would put gizmos into play');
}
{
  // objects with no material at all (Group, Object3D, Bone) must not throw
  const bare = { name: 'group', visible: true };
  const nullMat = obj('weird', null);
  const hid = run([bare, nullMat]);
  eq(hid.length, 0, 'objects with no material are skipped rather than thrown on');
  eq(bare.visible, true, '...and left alone');
}

// ---------------------------------------------------------------- restored afterwards
{
  const fn = extractFunction('_renderPostFX') || src;
  assert(/for\(const o of _aoHid\) o\.visible=true;/.test(src),
    'everything hidden is restored right after the prepass render');
  // ...and the restore must come after the override is put back, i.e. inside the same block
  const i = src.indexOf('scn.overrideMaterial=_matAOGeo;');
  const j = src.indexOf('for(const o of _aoHid) o.visible=true;');
  const k = src.indexOf('scn.overrideMaterial=_pv;', i);
  assert(i > 0 && k > i && j > k, 'the order is: override on, render, override off, un-hide');
}
{
  // the two named cases stay named — they are hidden for reasons the predicate does not cover
  // (the sky dome and the weather points are opaque and DO write depth)
  assert(/if\(_skyMesh\) _skyMesh\.visible=false;/.test(src), 'the sky dome is still hidden by name');
  assert(/_weatherPts\.visible=false/.test(src), '...and so are the weather points');
  // and the reason this is a rule now rather than a third name is written down
  assert(/nothing that does not write depth belongs in a depth-derived\s*\/\/\s*G-buffer/.test(src),
    'the source states the rule, so the fourth instance does not get named either');
}
{
  // the weapon is deliberately still ADDED to the G-buffer (build 1140) — it is opaque geometry and its
  // own occlusion is the whole point of that build. This build must not have swept it out.
  assert(/vmScene\.overrideMaterial=_matAOGeo;/.test(src), 'the viewmodel still writes its own occlusion');
}

done('build 1152: transparent decoration is out of the AO G-buffer — a sprite was writing its quad in as solid geometry, so SSAO cast a drop shadow from an invisible box');
