// (build 1050) SHARP-ANGLE JOINTS (the crumpled-boot bug) — the joint ramp used to blend along
// the CHILD bone's axis. At the ankle that axis turns ~90°, so the HEEL — behind the ankle
// along the foot's axis — landed on the shin side of the cut plane and inherited shin weights:
// every step dragged the heel and the boot crumpled. The blend axis is now the PARENT bone's
// approach into the joint (identical at collinear knees/elbows, proven by test-1043 passing
// unchanged), and R is capped by both bones so an ankle ramp can never engulf the whole foot.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const env = new Function(
  extractFunction('_arJoints', src) + '\n' + extractFunction('_arJointEnforce', src)
  + '\nreturn { joints: _arJoints, enforce: _arJointEnforce };')();

// an ankle: vertical shin (0.45 long) into a horizontal foot (0.22 long, toes +z)
const J = [
  { name: 'thigh', parent: null },
  { name: 'shin', parent: 'thigh' },
  { name: 'foot', parent: 'shin' },
];
const SEGS = [
  { bi: 1, a: [0, 0.5, 0], b: [0, 0.05, 0], r2: 0.0169 },      // shin, kernel r=0.13
  { bi: 2, a: [0, 0.05, 0], b: [0, 0.02, 0.22], r2: 0.0169 },  // foot: ankle -> toes (+z, slightly down)
];
const joints = env.joints(J, SEGS);
const ankle = joints.find(j => j.child === 2);
assert(ankle, 'the ankle joint exists');
near(ankle.dir[1], -1, 1e-2, 'THE FIX: the blend axis is the shin’s approach (straight down), NOT the foot’s forward axis');
{
  const footLen = Math.hypot(0, 0.03, 0.22);
  near(ankle.R, footLen * 0.35, 1e-6, 'R is capped by the short foot — the ramp cannot engulf the whole boot (uncapped kernel r was 0.13)');
}

// the heel: BEHIND the ankle along the foot axis, but BELOW it along the shin axis
{
  const pos = new Float32Array([
    0, 0.02, -0.06,   // upper heel — behind the ankle, just below it
    0, 0.02, 0.18,    // toes
    0, 0.30, 0.00,    // mid-shin
    0, 0.00, -0.05,   // heel at the SOLE — well below the cut plane
  ]);
  const wl = [[[2, 1]], [[2, 1]], [[1, 1]], [[2, 1]]];   // raw kernel already assigns heel/toes to the foot, shin to the shin
  env.enforce(pos, wl, joints);
  const share = (i, bone) => { const m = new Map(wl[i]); const t = [...m.values()].reduce((a, b) => a + b, 0); return (m.get(bone) || 0) / t; };
  // the OLD child-axis plane measured this same upper-heel vertex at ~6% foot / 94% SHIN — the crumple
  assert(share(0, 2) > 0.7, 'THE HEEL STAYS ON THE FOOT: upper heel ' + share(0, 2).toFixed(3) + ' foot (was ~0.06 under the child axis)');
  assert(share(3, 2) > 0.88, '...and the sole heel is decisively foot-owned: ' + share(3, 2).toFixed(3));
  assert(share(1, 2) > 0.99, 'the toes stay on the foot');
  assert(share(2, 1) > 0.99, 'mid-shin stays on the shin (outside the small ankle ramp)');
}
{ // just above vs just below the ankle: the ramp is there, tight, and correctly ORIENTED
  const R = ankle.R;
  const pos = new Float32Array([ 0, 0.05 + R * 0.6, 0,  0, 0.05 - R * 0.6, 0 ]);
  const wl = [[[1, 0.5], [2, 0.5]], [[1, 0.5], [2, 0.5]]];   // ambiguous kernel weights right at the joint
  env.enforce(pos, wl, joints);
  const share = (i, bone) => { const m = new Map(wl[i]); const t = [...m.values()].reduce((a, b) => a + b, 0); return (m.get(bone) || 0) / t; };
  assert(share(0, 1) > 0.75, 'just above the ankle the shin leads (' + share(0, 1).toFixed(2) + ')');
  assert(share(1, 2) > 0.75, 'just below, the foot leads (' + share(1, 2).toFixed(2) + ')');
}

// degenerate parent (zero length) falls back to the child axis instead of dropping the joint
{
  const J2 = [ { name: 'a', parent: null }, { name: 'b', parent: 'a' } ];
  const S2 = [ { bi: 0, a: [0, 1, 0], b: [0, 1, 0], r2: 0.01 }, { bi: 1, a: [0, 1, 0], b: [0, 0, 0], r2: 0.01 } ];
  const j2 = env.joints(J2, S2);
  eq(j2.length, 1, 'the joint survives a zero-length parent');
  near(j2[0].dir[1], -1, 1e-9, '...blending along the child as a fallback');
}

// pins
assert(/let dx=sg\.a\[0\]-ps\.a\[0\], dy=sg\.a\[1\]-ps\.a\[1\], dz=sg\.a\[2\]-ps\.a\[2\];/.test(src),
  'the axis runs from the parent bone origin to the joint');
assert(/Math\.min\(Math\.sqrt\(sg\.r2\), childLen\*0\.35, \(parentLen\|\|childLen\)\*0\.35\)/.test(src),
  'R is capped by both bones');
assert(/h\*0\.015\), h\*0\.1\)/.test(src), 'the kernel radius floor dropped to 1.5% of height (feet/hands were over-softened)');

done('build 1050: joints cut perpendicular to the limb — heels belong to feet, and small parts get small ramps');
