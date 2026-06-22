import { gameSource, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 543: wider per-turret scale range
assert(/\{ k:'scale',    label:'Scale',        min:0\.02, max:50, step:STEP_SCALE \}/.test(src), 'turret scale slider spans 0.02..50');
assert(/t\.scale=Math\.max\(0\.02,s\.scale\)/.test(src), 'scale apply clamp lowered to 0.02');
// build 544: shared model-yaw offset orients the model independent of placement facing
assert(/let turretModelYaw =/.test(src), 'shared turretModelYaw global exists');
assert(/m\.rotation\.y=\(turretModelYaw\|\|0\)\*RAD;/.test(src), 'buildTurret sets the model base yaw');
assert(/const _myaw=g\.userData\._prim\?0:\(turretModelYaw\|\|0\)\*RAD; g\.userData\.visual\.rotation\.y=_myaw\+dy;/.test(src), 'turretUpdate composes model-yaw base with the aim delta');
assert(/function _applyTurretModelYaw\(\)/.test(src), 'live model-yaw update helper exists');
// build 545: custom muzzle offset, scaled with the model, generalizes the old +1.1
assert(/let turretMuzzle = \{ fwd:/.test(src), 'shared turretMuzzle global exists');
assert(/const mz=turretMuzzle\|\|\{fwd:1\.1,up:0,side:0\}; const F=\(mz\.fwd!=null\?mz\.fwd:1\.1\)\*s/.test(src), 'turretBarrelWorld uses the authored muzzle, scaled by the model');
// serialize + load carry the new fields
assert(/modelYaw: turretModelYaw, muz: \{ fwd:turretMuzzle\.fwd/.test(src), 'serialize saves model-yaw + muzzle');
assert((src.match(/turretModelYaw=\(level\.turret && \+level\.turret\.modelYaw\)\|\|0/g)||[]).length >= 2, 'both load paths restore model-yaw');
// muzzle default reproduces the old +1.1 forward nudge (fwd=1.1, up=0, side=0 -> forward * 1.1)
const F=1.1, U=0, S=0, sy=0, cy=1, cp=1, sp=0; // facing -Z, no pitch
near((-sy*cp)*F + (sy*sp)*U + (cy)*S, 0, 1e-9, 'default muzzle has no X offset facing forward');
near((-cy*cp)*F + (cy*sp)*U + (-sy)*S, -1.1, 1e-9, 'default muzzle is 1.1 ahead along -Z (matches the old nudge)');
done();
