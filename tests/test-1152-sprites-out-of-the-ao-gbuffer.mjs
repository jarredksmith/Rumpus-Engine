// build 1152: transparent decoration stays out of the AO G-buffer.
//
// NOTE ON WHY THIS EXISTS: it was written to fix a reported bright square around muzzle flashes, and the
// measurement afterwards DISPROVED that diagnosis — a static fully-transparent sprite moved the frame by
// under 0.3 code values with the hide on vs off, less than the drift between consecutive captures. See
// CLAUDE.md. The rule is kept because it is correct on its own terms (a depth-derived buffer should not
// contain objects that do not write depth, and build 1126 hit that twice by name), NOT because it fixed the
// reported artifact. Do not cite this test as evidence for that.
//
// The cause is build 1126's AO prepass. It renders the scene with `scene.overrideMaterial = _matAOGeo`, and
// overrideMaterial replaces `transparent` and `depthWrite:false` along with everything else — so a sprite
// writes its WHOLE QUAD into the half-res G-buffer as though it were solid geometry a metre in front of the
// camera. SSAO then derives that square's occlusion from a flat camera-facing surface, which is unoccluded,
// while the world around it keeps its real occlusion. The square comes out less darkened: visibly brighter,
// with a quad edge.
//
// Builds 1126 and 1128 fixed this same trap twice BY NAME — the sky dome ("overrideMaterial would give the
// dome depthWrite and it would fill the entire buffer"), then the weather points. The flipbook VFX are the
// third instance, and naming them would only buy the fourth. So the test is a property of the material:
// nothing that does not write depth belongs in a depth-derived G-buffer.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the rule, executed
// The hide block is lifted out and driven over a fake scene, because a source pin cannot tell you whether
// the predicate actually catches a SpriteMaterial or restores what it hid.
const BLOCK = (() => {
  const m = src.match(/    const _aoHid=\[\];\n[\s\S]*?_aoHid\.push\(o\); \} \}\);/);
  assert(m, 'the AO prepass hides non-depth-writing objects in one readable block');
  return m[0];
})();

function run(objs){
  const scn = { traverse(fn){ for(const o of objs) fn(o); } };
  const hid = new Function('scn', BLOCK + '\n; return _aoHid;')(scn);
  return hid;
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

done('build 1152: transparent decoration is out of the AO G-buffer — correct hygiene, and measured NOT to be the cause of the reported bright square (see CLAUDE.md)');
