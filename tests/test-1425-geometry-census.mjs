// build 1425: the THIRD census — geometry.
//
// Build 1257 made the light budget visible because it is "the number a creator most needs and could least
// discover"; 1353 did the same for texture memory. Geometry, the third thing content grows, was reported
// NOWHERE a creator would look: `levelIssues` mentioned triangles zero times.
//
// Reported from play, and it cost somebody an evening: a wooden ramp at 497,912 triangles, Draco-compressed
// to 1.72 MB, in a level reaching 30 MILLION triangles a frame at 102 draw calls. The perf HUD had the
// number all along — behind a backtick, read after you already know something is wrong. Level Check is
// where you look BEFORE you publish.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the census, executed
const mkCensus = (props) => {
  const fn = new Function('propModels', 'MOBILE_TRI_BUDGET', 'assetShortName',
    extractFunction('_geoName') + '\n' + extractFunction('_geoCensus') + '; return _geoCensus;');
  return fn(props, 40000, (s) => 'short:' + s)();
};
// a prop is a group whose traverse yields meshes; geometry is counted by INDEX where there is one
const mesh = (tris, instances) => ({
  isMesh: true, geometry: { index: { count: tris * 3 }, attributes: { position: { count: tris * 3 } } },
  isInstancedMesh: instances != null, count: instances,
});
const prop = (ud, meshes) => ({
  parent: {}, userData: ud,
  traverse(f) { f(this); for (const m of meshes) f(m); },
});

{
  const r = mkCensus([
    prop({ name: 'Wooden Ramp', src: 'x.glb' }, [mesh(497912)]),
    prop({ src: 'crate.glb' }, [mesh(500)]),
  ]);
  eq(r.tris, 498412, 'triangles are counted exactly, not estimated');
  eq(r.props, 2, 'across both props');
  eq(r.over, 1, 'one is over the per-model budget');
  eq(r.worstTris, 497912, '...and the worst is measured');
  eq(r.worst, 'Wooden Ramp', '...and NAMED, so the row can be actionable rather than a scolding');
}
{ // an InstancedMesh draws its geometry once PER INSTANCE, and that is what the GPU is asked for
  const r = mkCensus([prop({ src: 'tree.glb' }, [mesh(1000, 50)])]);
  eq(r.tris, 50000, 'a batch of 50 counts 50 times — the batch is a draw-call saving, not a triangle one');
  eq(r.over, 1, '...so a cheap model batched 50 times is still over the budget');
}
{ // naming falls back through the same vocabulary a creator sees
  eq(mkCensus([prop({ tag: 'plate1', src: 'a.glb' }, [mesh(50000)])]).worst, 'plate1', 'a tag names it');
  eq(mkCensus([prop({ src: 'poly/78846e.glb' }, [mesh(50000)])]).worst, 'short:poly/78846e.glb',
    'else build 1147’s asset shortener, which knows a bare UUID is not a name');
  eq(mkCensus([prop({}, [mesh(50000)])]).worst, 'a prop', 'and an anonymous prop still says something');
}
{ // nothing here may throw out of the panel, and a removed prop is not in the level
  eq(mkCensus([]).tris, 0, 'an empty level counts zero');
  eq(mkCensus([null, undefined]).props, 0, 'holes in propModels are skipped (build 1389)');
  eq(mkCensus([{ parent: null, userData: {}, traverse() {} }]).props, 0,
    'a prop detached from the scene is not drawn, so it is not counted');
  eq(mkCensus([prop({}, [])]).props, 0, 'and a prop with no geometry contributes nothing');
}

// ---------------------------------------------------------------- the thresholds are DERIVED
{
  eq(+extractConst('MOBILE_TRI_BUDGET'), 40000,
    'the per-model threshold is the engine’s OWN optimizer target — a model above it is precisely one the ' +
    'bake would cut, so the row is never arguing with the tool it recommends');
  const cap = +extractConst('LEVEL_TRI_SOFT_CAP');
  eq(cap, 2000000, 'the level cap');
  assert(cap > 524582 * 3,
    '...comfortably above the largest level this repo has MEASURED running well (524,582 triangles across ' +
    '959 props, tools/probe/gauntlet-scale.mjs)');
  assert(cap < 15000000,
    '...and an order of magnitude under the 15-30M measured struggling in the report that produced this build');
  assert(/between the largest level this repo has MEASURED/i.test(src),
    'and the gap it sits in is recorded at the constant, so it reads as a derivation rather than a guess');
}

// ---------------------------------------------------------------- the row
{
  const fn = extractFunction('levelIssues');
  assert(/_geoCensus\(\)/.test(fn), 'the check runs');
  assert(/_issueAt\(/.test(fn.slice(fn.indexOf('_geoCensus()'), fn.indexOf('_geoCensus()') + 1400)),
    'the per-model row is CLICKABLE (build 1300) — there is a specific prop to go and fix');
  assert(/File size does not warn you about this/.test(fn),
    'it says why the file size gave no warning, which is the entire trap: 497,912 triangles in 1.72 MB');
  assert(/Optimize/.test(fn), '...and names the fix, which is one button away');
  // the level-total row is the ELSE, so a level with one huge model is told about the model, not the sum
  const i = fn.indexOf('over the '), j = fn.indexOf('draws about');
  assert(i > 0 && j > i, 'the per-model case is reported FIRST');
  assert(/else if\(g\.tris > LEVEL_TRI_SOFT_CAP\)/.test(fn),
    '...and the total is the fallback, so one row fires, not two');
  // and it names a control that EXISTS. The first draft of this build said "Cull small props", which the
  // editor has never had; the real slider is "Cull below (px)" (build 1267/1273).
  assert(/Cull below \(px\)/.test(fn), 'the total row names the real control');
  assert(/slider\(b,'Cull below \(px\)','lodPx'/.test(src), '...and that control is really there');
}
{ // a panel that always complains is not read (build 1274)
  const fn = extractFunction('levelIssues');
  assert(/if\(g\.over > 0\)/.test(fn), 'nothing is said unless something is actually over budget');
}

done('build 1425: Level Check reports the level’s triangles, names the heaviest model, and takes you to it');
