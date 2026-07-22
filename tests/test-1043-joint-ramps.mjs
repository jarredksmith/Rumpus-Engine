// (build 1043) GUARANTEED-WIDTH JOINT RAMPS — crease fix round 3 ("still really creasing").
// Root cause quantified: Laplacian diffusion width scales with EDGE LENGTH (16 rounds ≈ 4
// edges ≈ 2cm on a high-poly mesh) — invisible exactly where it mattered. _arJointEnforce now
// writes an EXACT smoothstep across each joint, half-width = the bone's blend radius in WORLD
// units, so density cannot thin it. The whole weight pipeline also runs on all meshes
// CONCATENATED, so layered clothing shares one field instead of creasing at mesh boundaries.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const env = new Function(
  extractFunction('_arJoints', src) + '\n' + extractFunction('_arJointEnforce', src)
  + '\nreturn { joints:_arJoints, enforce:_arJointEnforce };')();

// ---- joint discovery: thigh-over-shin with a weightless in-between ----
const J = [
  { name: 'hips', parent: null },
  { name: 'thigh', parent: 'hips' },
  { name: 'kneeHelper', parent: 'thigh' },   // no segment of its own — must be climbed past
  { name: 'shin', parent: 'kneeHelper' },
];
const SEGS = [
  { bi: 1, a: [0, 1, 0], b: [0, 0.5, 0], r2: 0.01 },     // thigh, R=0.1
  { bi: 3, a: [0, 0.5, 0], b: [0, 0, 0], r2: 0.0064 },   // shin,  R=0.08
];
const joints = env.joints(J, SEGS);
eq(joints.length, 1, 'one joint: the shin against the thigh (hips has no weight-bearing ancestor)');
eq(joints[0].child, 3, 'child = the shin bone');
eq(joints[0].parent, 1, '...blending against the thigh, climbing past the weightless knee helper');
eq(joints[0].p.join(','), '0,0.5,0', 'the joint sits at the child bone origin (the knee)');
near(joints[0].R, 0.08, 1e-9, 'ramp half-width = the child bone blend radius');
near(joints[0].dir[1], -1, 1e-9, 'the blend axis runs down the child bone');

// ---- enforcement: a HARD step becomes an exact world-width smoothstep — at ANY density ----
function profile(samples) {
  const pos = new Float32Array(samples * 3), wl = [];
  for (let i = 0; i < samples; i++) {
    const y = 1 - i / (samples - 1);            // walk down the limb from hip (y=1) to ankle (y=0)
    pos[i * 3] = 0.05; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 0;   // on the surface, one girth out
    wl.push([[y > 0.5 ? 1 : 3, 1]]);            // pathological raw weights: hard thigh|shin step at the knee
  }
  env.enforce(pos, wl, joints);
  return { pos, wl, shin: (i) => { const m = new Map(wl[i]); const t = [...m.values()].reduce((a, b) => a + b, 0); return (m.get(3) || 0) / t; } };
}
for (const N of [41, 401]) {   // coarse blockout AND dense sculpt — the ramp must be IDENTICAL
  const p = profile(N);
  const at = (y) => p.shin(Math.round((1 - y) * (N - 1)));
  near(at(0.5), 0.5, 0.06, 'N=' + N + ': the knee itself splits ~50/50');
  assert(at(0.55) < 0.3 && at(0.55) > 0.02, 'N=' + N + ': partway up the ramp the thigh leads (' + at(0.55).toFixed(2) + ')');
  assert(at(0.45) > 0.7 && at(0.45) < 0.98, 'N=' + N + ': partway down the shin leads (' + at(0.45).toFixed(2) + ')');
  near(at(0.59), 0, 0.02, 'N=' + N + ': at the ramp edge (one radius up) the thigh owns it fully');
  near(at(0.41), 1, 0.02, 'N=' + N + ': at the other edge the shin owns it fully');
}
{ // the dense case is genuinely smooth per-sample (a hard step would jump 1.0)
  const d = profile(401);
  let maxJump = 0;
  for (let i = 1; i < 401; i++) maxJump = Math.max(maxJump, Math.abs(d.shin(i) - d.shin(i - 1)));
  assert(maxJump < 0.04, 'dense mesh: the largest neighbor jump is ' + maxJump.toFixed(3) + ' — the old hard step (1.0) is gone');
}
{ // density-independence, stated directly: the dense profile matches the coarse one at shared points
  const c = profile(41), d = profile(401);
  for (const y of [0.55, 0.5, 0.45]) {
    const ci = Math.round((1 - y) * 40), di = Math.round((1 - y) * 400);
    near(c.shin(ci), d.shin(di), 0.04, 'the ramp at y=' + y + ' is the same at 41 and 401 samples (world-unit width, not edge-count width)');
  }
}
{ // authority fades: far from the joint the raw weights are untouched
  const pos = new Float32Array([0.05, 0.95, 0, 0.05, 0.05, 0, 0.3, 0.5, 0]);   // near hip, near ankle, far lateral
  const wl = [[[1, 1]], [[3, 1]], [[1, 0.7], [3, 0.3]]];
  env.enforce(pos, wl, joints);
  eq(new Map(wl[0]).get(1), 1, 'high on the thigh: untouched');
  eq(new Map(wl[1]).get(3), 1, 'low on the shin: untouched');
  near(new Map(wl[2]).get(1), 0.7, 0.11, 'beyond 2R laterally the enforcement has (almost) no authority');
}
{ // vertices owned by OTHER bones entirely are left alone
  const pos = new Float32Array([0.05, 0.5, 0]);
  const wl = [[[7, 1]]];   // some unrelated bone
  env.enforce(pos, wl, joints);
  eq(new Map(wl[0]).get(7), 1, 'a vertex with no parent/child share is not redistributed');
}
eq(env.enforce(new Float32Array(0), [], joints).length, 0, 'empty input is a no-op');
eq(env.joints(J, []).length, 0, 'no segments, no joints');

// ---- pipeline wiring: joints -> enforcement -> cross-mesh diffusion ----
assert(/const joints=_arJoints\(J, segs\);/.test(src), 'the bind builds the joint list');
assert(/_arJointEnforce\(allPos, allW, joints\);/.test(src), '...and enforces the ramps between the kernel and the diffusion');
{
  const ap = extractFunction('_autoRigApply', src);
  assert(/for\(const bk of baked\)\{ const n=bk\.g\.attributes\.position\.count; ranges\.push\(\{ bk, base:totalN, n \}\); totalN\+=n; \}/.test(ap),
    'every mesh feeds ONE concatenated pipeline');
  assert(/for\(let k=0;k<a\.length;k\+\+\) tri\.push\(a\[k\]\+base\);/.test(ap), 'triangle indices offset into the shared vertex space');
  assert(/fin\[base\+i\]/.test(ap), 'each mesh reads its slice of the shared result back');
}

// ---- the unclickable view buttons ----
assert(/#animEd \.aeViews \{ position:absolute; right:10px; top:10px; display:flex; gap:4px; z-index:3; \}/.test(html),
  'Front/Side/Back/¾ sit above the viewport canvas now (a later sibling used to cover them)');

done('build 1043: joint ramps have a guaranteed world-unit width — mesh density can no longer crease a bend');
