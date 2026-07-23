// (build 1061) EDIT AN EXISTING ANIMATION — author: "can we make it so that all existing
// animations can be edited in the animation editor? A user could take the default quaternius
// animations, and tweak them as needed." _aeSampleClip plays any clip already on the model (its
// own or a retargeted pack clip) on a fresh clone and reads each bone's WORLD delta from rest —
// the exact inverse of _caBuildClip — then reduces keyframes so the result is hand-editable.
// This test exercises the pure keyframe reducers directly (the full sample→rebuild round-trip
// runs against the REAL pack in the browser smoke, which needs a live mixer).
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const env = new Function('THREE',
  extractFunction('_aeReduceQ', src) + '\n' + extractFunction('_aeReduceP', src)
  + '\nreturn { rq:_aeReduceQ, rp:_aeReduceP };')(THREE);

// ---- quaternion reduction: a clean 90° sweep about Y, oversampled at 20 keys ----
{
  const keys = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * (Math.PI / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    keys.push([i / 20, +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)]);
  }
  const out = env.rq(keys, 0.015);
  assert(out.length < keys.length, 'a smooth sweep sheds redundant keys (' + keys.length + ' -> ' + out.length + ')');
  assert(out.length >= 3, 'but keeps enough to describe the arc (' + out.length + ')');
  eq(out[0][0], 0, 'the first key is kept');
  eq(out[out.length - 1][0], 1, 'the last key is kept');
  // every original sample is still reproduced within eps by slerping the KEPT keys
  const qAt = (t) => {
    let i = 0; while (i < out.length - 1 && out[i + 1][0] < t) i++;
    const a = out[i], b = out[Math.min(i + 1, out.length - 1)];
    const u = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    return new THREE.Quaternion(a[1], a[2], a[3], a[4]).slerp(new THREE.Quaternion(b[1], b[2], b[3], b[4]), u);
  };
  let worst = 0;
  for (const k of keys) { const e = qAt(k[0]).angleTo(new THREE.Quaternion(k[1], k[2], k[3], k[4])); if (e > worst) worst = e; }
  assert(worst < 0.03, 'the reduced curve reproduces every original sample within ~2x the reduction eps (worst ' + worst.toFixed(4) + ' rad = ' + (worst*180/Math.PI).toFixed(2) + ' deg)');
}
// a hard corner is NOT smoothed away — the key at the direction change survives
{
  const keys = [
    [0, 0, 0, 0, 1],
    [0.5, 0, 0, 0, 1],                                  // held, then...
    [0.6, ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1).toArray()],  // sharp move
    [1.0, ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1).toArray()],
  ];
  const out = env.rq(keys, 0.015);
  assert(out.some(k => Math.abs(k[0] - 0.6) < 1e-6) || out.some(k => Math.abs(k[0] - 0.5) < 1e-6),
    'a corner key is preserved, not averaged through');
}
eq(env.rq([[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]], 0.015).length, 2, 'two keys pass through untouched');
eq(env.rq([[0, 0, 0, 0, 1]], 0.015).length, 1, 'a single key is safe');

// ---- position reduction: a straight ramp collapses to its endpoints ----
{
  const keys = [];
  for (let i = 0; i <= 10; i++) keys.push([i / 10, i / 10 * 2, 0, -i / 10, 0]);   // linear in x and z
  const out = env.rp(keys, 0.004);
  eq(out.length, 2, 'a straight-line move reduces to two keys');
}
{
  const keys = [[0, 0, 0, 0], [0.5, 0, 1, 0], [1, 0, 0, 0]];   // a peak — must keep the middle
  eq(env.rp(keys, 0.004).length, 3, 'a bend keeps its apex');
}

// ---- wiring pins ----
assert(/function _aeSampleClip\(srcClip\)\{/.test(src), 'the sampler exists');
assert(/b\.getWorldQuaternion\(_q\)\.multiply\(_ri\.copy\(rw\)\.invert\(\)\);/.test(src),
  'it reads the WORLD delta from rest — the exact inverse of _caBuildClip');
assert(/b\.getWorldPosition\(_p\)\.sub\(hipRestW\)\.divideScalar\(hipH\);/.test(src),
  'the hips get their height-normalized world offset (same convention as authored keys)');
assert(/if\(qStill && pStill\) delete data\.tracks\[slot\];/.test(src),
  'bones that never leave rest contribute no track (a clean, minimal clip)');
assert(/data\.name=\(srcClip\.name\|\|'Clip'\)\.replace\(\/ \\\(custom\\\)\$\/,''\)\.slice\(0,34\)\+' \(edit\)';/.test(src),
  'the copy is named "<clip> (edit)" so the original is never overwritten');
assert(/if\(\/t\.\?pose\|bind\.\?pose\/i\.test\(nm\) \|\| custom\.has\(nm\)\) continue;/.test(src),
  'the picker hides T-pose/bind refs and clips already in the custom library');
assert(/el\.querySelector\('#aeFromLib'\)\.onchange=\(e\)=>\{ const v=e\.target\.value; e\.target\.value=''; if\(v\) _aeImportFromLib\(v\); \};/.test(src),
  'the "Edit existing…" dropdown samples the chosen clip');
assert(/id="aeFromLib"/.test(src), 'the dropdown is in the toolbar');
assert(/_aeRenderClipSel\(\); _aeRenderFromLib\(\);/.test(src), 'it populates when the editor opens');

done('build 1061: any existing animation — pack clip or the model’s own — copies into an editable, keyframe-reduced custom clip');
