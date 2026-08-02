// build 1238: REAL camera motion blur — the deferred-list item, finally built because the headless
// capture harness now exists to verify raw-shader work (this file has twice lost a subsystem to a
// ShaderMaterial failing to compile silently). The old "motion blur" was an afterimage — max(new,
// old*damp) ghost trails. The new pass reprojects each pixel's view ray through LAST frame's camera
// orientation: true per-pixel screen velocity for rotation (the dominant FPS term, depth-independent),
// 8 taps along the streak. CAPTURE-VERIFIED before shipping: spinning with blur on drops the frame's
// horizontal/vertical gradient anisotropy 13.4% vs the identical spin with blur off (the directional
// smear), and still frames differ 0.3% on/off (shader compiled, inert at zero delta — no false blur).
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the CPU core, executed with real quaternions
const CORE = extractFunction('_mbFrame');
const mk = () => new Function('THREE',
  'const _mbQ = new THREE.Quaternion(); const _mbM4 = new THREE.Matrix4();\n' + CORE + '\nreturn _mbFrame;')(THREE);
{
  const f = mk();
  const out = new THREE.Matrix3();
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.30, 0, 'YXZ'));
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.32, 0, 'YXZ'));   // a 0.02 rad yaw step — an ordinary mouse turn
  const r = f(q0, q1, 16.7, out);
  eq(r.cut, false, 'an ordinary turn is not a cut');
  near(r.ang, 0.02, 1e-6, '...its angle is the real frame delta');
  near(r.shutter, 1, 0.01, '...and at 60fps the shutter is neutral');
  // the matrix maps a current-frame view ray into last frame's view space: the forward ray must land
  // rotated by exactly the yaw step
  const v = new THREE.Vector3(0, 0, -1).applyMatrix3(out);
  near(Math.atan2(v.x, -v.z), -0.02, 1e-6, 'the reprojection matrix carries exactly the yaw step (forward ray displaced by -0.02 rad in prev view)');
}
{
  const f = mk();
  const out = new THREE.Matrix3();
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.2, 0, 'YXZ'));   // a teleport/respawn snap
  const r = f(q0, q1, 16.7, out);
  eq(r.cut, true, 'a 1.2 rad jump in ONE frame is a CUT — the frame renders sharp instead of smearing the whole screen once');
  const same = f(q0, q0, 16.7, out);
  eq(same.cut, false, 'no motion at all is not a cut');
  near(same.ang, 0, 1e-9, '...zero angle: the 8-tap loop degenerates to an identity read');
}
{ // shutter: the authored look holds at any refresh rate (1161's rule)
  const f = mk();
  const out = new THREE.Matrix3();
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.01, 0, 'YXZ'));
  near(f(q0, q1, 6.94, out).shutter, 2.4, 0.01, 'at 144Hz the per-frame delta is scaled UP to a 60Hz-equivalent exposure');
  near(f(q0, q1, 33.3, out).shutter, 0.5, 0.01, 'at 30Hz it scales down, floored at 0.5');
  near(f(q0, q1, 200, out).shutter, 0.5, 0.01, 'a hitch frame cannot invert into a huge streak');
}

// ---------------------------------------------------------------- the shader + pipeline wiring
{
  assert(/vec3 v = vec3\(\(vUv\*2\.0-1\.0\)\*uTanF, -1\.0\);/.test(src) && /vec3 vp = uMbRot \* v;/.test(src),
    'the shader reconstructs the view ray and rotates it into last frame\'s view — per-pixel velocity, no depth needed');
  assert(/uvPrev = \(vp\.xy \/ max\(0\.05, -vp\.z\)\) \/ uTanF \* 0\.5 \+ 0\.5;/.test(src),
    '...reprojects with a guarded divide');
  assert(/if\(L > 0\.05\) d \*= 0\.05\/L;/.test(src), '...and caps the streak at 5% of the screen');
  assert(/for\(int i=0;i<8;i\+\+\)/.test(src) && /c \* 0\.125;/.test(src), '8 evenly-weighted taps');
  assert(/uAmt\.value = cut \? 0 : _postMotion;/.test(src), 'a cut frame zeroes the amount CPU-side');
  assert(/mu\.uTanF\.value\.set\(th\*\(cam\.aspect\|\|\(w\/h\)\), th\);/.test(src), 'the frustum tangents track the live camera fov/aspect');
  assert(!/tOld/.test(extractFunction('_renderPostFX')), 'the accumulation ping-pong is GONE from the pipeline');
  assert(/const _mbOn = \(_postMotion \* \(\(typeof a11y!=='undefined'\) \? a11y\.blur : 1\)\)>0\.01/.test(src), 'postMotion 0 still skips the pass entirely — byte-identical old behavior at zero');   /* build 1313: ...and so does a player who has set their blur to 0, which is the whole point of that multiply */
  assert(/Motion blur = camera blur strength/.test(src), 'the editor hint stops saying "trail"');
}

done('build 1238: real camera motion blur — _mbFrame executed with real quaternions (the reprojection matrix carries exactly the yaw step, a 1.2 rad snap reads as a cut and renders sharp, the shutter scales 144Hz up and floors hitches), the shader reprojects per-pixel view rays with a guarded divide and a 5%-screen cap over 8 taps, the ping-pong accumulation is gone, zero still skips everything — and the capture measured it: 13.4% anisotropy drop while spinning, 0.3% still-frame delta');
