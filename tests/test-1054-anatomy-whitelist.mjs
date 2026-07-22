// (build 1054) ALIGNMENT IS A LIMB WHITELIST — author, with a long-snouted cartoon character:
// the whole body folded forward under pack clips (fine in the anim editor, i.e. fine at rest —
// the 1051 diagnostic again: transforms, not weights). Root cause, measured against the REAL
// pack: the auto-rig draws its spine chain hips->chin, so a character whose chin sits far
// forward (snout, hunched posture) gets forward-leaning spine bones — and alignment "corrected"
// that ANATOMY onto the pack's vertical spine, wrenching the trunk 20-30° from rest under plain
// idle. The pack's own clavicle also points ~40° backward, so aligning shoulders onto it sucked
// chests in by ~60°. Only limb long bones (uparm/forearm — the original A-pose bug — and
// upleg/lowleg — bent-knee rests) encode POSE; they alone align. Everything else keeps pure
// delta retargeting: it deviates from ITS rest exactly as the pack deviates from its own.
// This test retargets the REAL shipped pack (anims/UAL1_Standard.glb) onto a Goofy-proportioned
// auto-rig skeleton and asserts exactly that invariant, bone for bone.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
  + extractFunction('_buildBoneMap', src) + '\n' + extractFunction('_retargetClip', src);
const env = new Function('THREE', glue + '\nreturn { map:_buildBoneMap, rt:_retargetClip };')(THREE);

// ---- load the shipped pack, materials stripped so it parses headless ----
const raw = readFileSync(new URL('../anims/UAL1_Standard.glb', import.meta.url));
const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
const jsonLen = dv.getUint32(12, true);
const json = JSON.parse(Buffer.from(raw.buffer, raw.byteOffset + 20, jsonLen).toString('utf8'));
delete json.images; delete json.textures; delete json.samplers;
if (json.materials) json.materials = json.materials.map(() => ({}));
const binOff = 20 + jsonLen, binLen = dv.getUint32(binOff, true);
const bin = raw.buffer.slice(raw.byteOffset + binOff + 8, raw.byteOffset + binOff + 8 + binLen);
const jstr = Buffer.from(JSON.stringify(json)); const jpad = (4 - (jstr.length % 4)) % 4;
const jchunk = Buffer.concat([jstr, Buffer.alloc(jpad, 0x20)]);
const binPad = (4 - (binLen % 4)) % 4;
const total = 12 + 8 + jchunk.length + 8 + binLen + binPad;
const glb = Buffer.alloc(total);
glb.writeUInt32LE(0x46546C67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(total, 8);
glb.writeUInt32LE(jchunk.length, 12); glb.writeUInt32LE(0x4E4F534A, 16); jchunk.copy(glb, 20);
const bo = 20 + jchunk.length;
glb.writeUInt32LE(binLen + binPad, bo); glb.writeUInt32LE(0x004E4942, bo + 4);
Buffer.from(bin).copy(glb, bo + 8);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '', res, rej));
const pack = gltf.scene; pack.updateWorldMatrix(true, true);
assert(gltf.animations.some(a => a.name === 'Idle_Loop'), 'the shipped pack parses and carries Idle_Loop');

// ---- a Goofy-proportioned auto-rig: chin far forward (leaning spine), hanging arms, big feet ----
const mkB = (n, p, x, y, z) => { const b = new THREE.Bone(); b.name = 'mixamorig' + n; b.position.set(x, y, z); if (p) p.add(b); return b; };
function goofy() {
  const root = new THREE.Group();
  const W = { Hips: [0, 0.62, 0.02], Spine: [0, 0.84, 0.12], Spine1: [0, 1.02, 0.19], Spine2: [0, 1.20, 0.27],
    Neck: [0, 1.28, 0.34], Head: [0, 1.38, 0.34], HeadTop_End: [0, 1.60, 0.34] };
  const mk = (n, p) => { const b = new THREE.Bone(); b.name = 'mixamorig' + n; const w = W[n], pw = p ? W[p.name.slice(9)] : [0, 0, 0];
    b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]); if (p) p.add(b); return b; };
  const hips = mk('Hips'); root.add(hips);
  const sp = mk('Spine', hips), sp1 = mk('Spine1', sp), sp2 = mk('Spine2', sp1);
  const nk = mk('Neck', sp2), hd = mk('Head', nk); mk('HeadTop_End', hd);
  const L2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (const S of ['Left', 'Right']) {
    const g = S === 'Left' ? 1 : -1;
    const chest = [0, 1.20, 0.27], e = [g * 0.24, 0.72, 0.10], w = [g * 0.26, 0.42, 0.14];   // arms HANG
    const shW = L2(chest, e, 0.18), uaW = L2(chest, e, 0.45);
    const sh = mkB(S + 'Shoulder', sp2, shW[0] - chest[0], shW[1] - chest[1], shW[2] - chest[2]);
    const ua = mkB(S + 'Arm', sh, uaW[0] - shW[0], uaW[1] - shW[1], uaW[2] - shW[2]);
    const fa = mkB(S + 'ForeArm', ua, e[0] - uaW[0], e[1] - uaW[1], e[2] - uaW[2]);
    mkB(S + 'Hand', fa, w[0] - e[0], w[1] - e[1], w[2] - e[2]);
    const ul = mkB(S + 'UpLeg', hips, g * 0.1, -0.03, -0.02);
    const ll = mkB(S + 'Leg', ul, 0, -0.30, 0);
    const ft = mkB(S + 'Foot', ll, 0, -0.26, -0.01);
    mkB(S + 'ToeBase', ft, 0, -0.02, 0.22);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const dst = goofy();
const map = env.map(dst, pack);
assert(map && map.pairs.length >= 20, 'the auto-rig maps onto the pack (' + (map ? map.pairs.length : 0) + ' pairs)');
const clip = gltf.animations.find(a => a.name === 'Idle_Loop');
const rc = env.rt(dst, pack, clip, map);

// pose the retargeted rig at a mid-idle frame
const mixD = new THREE.AnimationMixer(dst); mixD.clipAction(rc).play(); mixD.setTime(0.5); dst.updateWorldMatrix(true, true);
// snapshot the pack's REST world quats (stopAllAction restores the pre-animation state), then pose it
const mixS = new THREE.AnimationMixer(pack); mixS.clipAction(clip).play(); mixS.setTime(0.5);
mixS.stopAllAction(); pack.updateWorldMatrix(true, true);
const packRest = new Map();
const PACKN = { hips: 'pelvis', spine: 'spine_01', spine2: 'spine_03', neck: 'neck_01', head: 'Head',
  shoulder: 'clavicle_l', uparm: 'upperarm_l', forearm: 'lowerarm_l', thigh: 'thigh_l', calf: 'calf_l', foot: 'foot_l' };
for (const k in PACKN) packRest.set(k, pack.getObjectByName(PACKN[k]).getWorldQuaternion(new THREE.Quaternion()));
mixS.clipAction(clip).play(); mixS.setTime(0.5); pack.updateWorldMatrix(true, true);
const packDev = (k) => { const q = pack.getObjectByName(PACKN[k]).getWorldQuaternion(new THREE.Quaternion());
  const rel = packRest.get(k).clone().invert().multiply(q); return 2 * Math.acos(Math.min(1, Math.abs(rel.w))) * 180 / Math.PI; };
const dstDev = (n) => { const q = dst.getObjectByName('mixamorig' + n).getWorldQuaternion(new THREE.Quaternion());
  return 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI; };   // identity rest -> world IS the deviation

// THE INVARIANT: anatomy bones deviate from THEIR rest exactly as the pack deviates from its
for (const [n, k] of [['Hips', 'hips'], ['Spine', 'spine'], ['Spine2', 'spine2'], ['Neck', 'neck'],
  ['Head', 'head'], ['LeftShoulder', 'shoulder'], ['LeftFoot', 'foot']]) {
  const d = dstDev(n), s = packDev(k);
  assert(Math.abs(d - s) < 6,
    n + ' moves exactly as much as the pack’s ' + PACKN[k] + ' (anatomy untouched): ' + d.toFixed(1) + '° vs ' + s.toFixed(1) + '°' +
    ' — alignment used to add ~' + (n === 'LeftShoulder' ? 36 : 10) + '° of damage here');
}
// ...while the hanging ARMS still land on the pack's world directions (pose alignment alive)
const dirOf = (root, a, b) => root.getObjectByName(b).getWorldPosition(new THREE.Vector3())
  .sub(root.getObjectByName(a).getWorldPosition(new THREE.Vector3())).normalize();
{
  const dArm = dirOf(dst, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
  const sArm = dirOf(pack, 'upperarm_l', 'lowerarm_l');
  assert(dArm.dot(sArm) > 0.995, 'the hanging left arm tracks the pack’s arm direction in world: dot=' + dArm.dot(sArm).toFixed(4));
  const dLeg = dirOf(dst, 'mixamorigLeftUpLeg', 'mixamorigLeftLeg');
  const sLeg = dirOf(pack, 'thigh_l', 'calf_l');
  assert(dLeg.dot(sLeg) > 0.995, 'the thigh tracks too: dot=' + dLeg.dot(sLeg).toFixed(4));
}
mixD.stopAllAction(); mixD.uncacheRoot(dst); mixS.stopAllAction(); mixS.uncacheRoot(pack);

// the scope is pinned
assert(/if\(\/\^\[LR\]:\(\?:uparm\|forearm\|upleg\|lowleg\)\$\/\.test\(p\.key\|\|''\)\)\{/.test(src),
  'alignment is a whitelist of limb long bones — everything else is anatomy and keeps pure deltas');

done('build 1054: the trunk moves only as the animation moves it — proven against the real shipped pack');
