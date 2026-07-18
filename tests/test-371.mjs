import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 494: the third-person body only yaws, so the held gun stayed level and the tracer ran off at odd angles
// when looking up/down. Weapon aim adds the missing pitch: a spine/chest bone leans a clamped share (arms + gun
// follow) and the gun covers the remainder so the barrel hits the exact view pitch (collinear tracer). Pitch is
// now stored for remote players (it was sent but dropped) so their guns aim too. Falls back to gun-only if no spine.

// ---- wiring ----
assert(/function _findAimSpine\(root\)/.test(src), 'spine/chest finder exists');
assert(/function _applyAimToBone\(bone, rightX, rightZ, angle\)/.test(src), 'additive bone-aim exists');
assert(/function _aimAvatarGun\(group, yaw, pitch\)/.test(src), 'per-avatar aim routine exists');
assert(/const AIM_SPINE_FRAC=0\.6, AIM_SPINE_LIMIT=0\.6;/.test(src), 'spine share constants defined');
assert(/\{ const _as=_findAimSpine\(model\); if\(_as\) model\.userData\.aimSpine=_as; \}/.test(src), 'aim spine captured at model load');
assert(/gun\.userData\.gripQuat = gun\.quaternion\.clone\(\)/.test(src), 'grip base orientation stored for the aim reset');

const aag = extractFunction('_aimAvatarGun');
assert(/Math\.max\(-AIM_SPINE_LIMIT, Math\.min\(AIM_SPINE_LIMIT, pitch\*AIM_SPINE_FRAC\)\)/.test(aag), 'spine carries a clamped share of pitch');
assert(/const gunApplied = pitch - spineApplied;/.test(aag), 'gun covers the remainder so the barrel hits the exact pitch');
assert(/const base=gun\.userData\.gripQuat; if\(base\) gun\.quaternion\.copy\(base\)/.test(aag), 'gun resets to grip base each frame (no accumulation)');

// the aim pass runs for the own body and remote players, after the mixer/seat re-pin
assert(/if\(_ownAvatar && \(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\)\)\{ if\(typeof _applyJointFix==='function'\) _applyJointFix\(_ownAvatar, _myJointFix\(\)\); _aimAvatarGun\(_ownAvatar, player\.yaw, player\.pitch\); \}/.test(src), 'own third-person (or top/side-view) body aims to the live view pitch, joint tweaks riding under the aim (build 942)');
assert(/_aimAvatarGun\(rp\.mesh, rp\.yaw\|\|0, rp\.pitch\|\|0\)/.test(src), 'remote players aim to their synced pitch');

// ---- remote pitch sync (was sent but dropped) ----
assert(/rp\.yaw = msg\.y; rp\.pitch = msg\.pi\|\|0;/.test(src), 'host stores a client\u2019s pitch');
assert(/y:rp\.yaw, pi:rp\.pitch\|\|0, w:rp\.wep/.test(src), 'host relays pitch to other clients (was pi:0)');
assert(/rp\.yaw=pl\.y; rp\.pitch=pl\.pi\|\|0;/.test(src), 'client stores relayed pitch');

// ---- executable: _findAimSpine ----
const _findAimSpine = new Function('return (' + extractFunction('_findAimSpine') + ')')();
{
  const a=new THREE.Object3D(); const hips=new THREE.Bone(); hips.name='Hips';
  const sp=new THREE.Bone(); sp.name='Spine'; const chest=new THREE.Bone(); chest.name='Chest';
  hips.add(sp); sp.add(chest); a.add(hips);
  assert(_findAimSpine(a)===chest, 'chest preferred over spine');
}
{
  const a=new THREE.Object3D(); const hips=new THREE.Bone(); hips.name='mixamorig:Hips';
  const sp=new THREE.Bone(); sp.name='mixamorig:Spine'; hips.add(sp); a.add(hips);
  assert(_findAimSpine(a)===sp, 'falls to spine, never picks hips');
}
{
  const a=new THREE.Object3D(); const h=new THREE.Bone(); h.name='Hips'; a.add(h);
  assert(_findAimSpine(a)===null, 'no spine/chest -> null (gun-only fallback)');
}

// ---- executable: _applyAimToBone — rotation + drift-safety ----
const _applyAimToBone = new Function('THREE','_aimQ','_aimCur','_aimNew','_aimParent','_aimAxis',
  'return (' + extractFunction('_applyAimToBone') + ')')(THREE,
  new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Vector3());
const expect = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), a);
{
  const bone=new THREE.Bone();                       // identity start, no parent; yaw 0 -> right = (1,0,0)
  _applyAimToBone(bone, 1, 0, 0.3);
  assert(bone.quaternion.angleTo(expect(0.3)) < 1e-6, 'aim rotates the bone about world-right by the angle');
}
{
  const bone=new THREE.Bone();
  _applyAimToBone(bone, 1, 0, 0.3);
  _applyAimToBone(bone, 1, 0, 0.3);                  // pose unchanged between calls = mixer skipped (LOD)
  assert(bone.quaternion.angleTo(expect(0.3)) < 1e-6, 'no accumulation when the pose is unchanged (mixer skip)');
}
{
  const bone=new THREE.Bone();
  _applyAimToBone(bone, 1, 0, 0.2);
  bone.quaternion.set(0,0,0,1);                      // a fresh mixer pose arrives (identity)
  _applyAimToBone(bone, 1, 0, 0.2);
  assert(bone.quaternion.angleTo(expect(0.2)) < 1e-6, 'fresh mixer pose -> aim applied once on top, not doubled');
}

// ---- executable: pitch-share math (mirror of _aimAvatarGun) ----
const share = pitch => { const s=Math.max(-0.6, Math.min(0.6, pitch*0.6)); return { s, g: pitch - s }; };
{
  const r=share(0.5);
  assert(Math.abs(r.s-0.3)<1e-9 && Math.abs(r.g-0.2)<1e-9, 'moderate pitch -> spine 0.3 / gun 0.2');
  assert(Math.abs((r.s+r.g)-0.5)<1e-9, 'shares sum to the full view pitch (collinear barrel)');
}
{
  const r=share(1.4);
  assert(Math.abs(r.s-0.6)<1e-9 && Math.abs(r.g-0.8)<1e-9, 'steep pitch -> spine caps at 0.6, gun covers 0.8');
  assert(Math.abs((r.s+r.g)-1.4)<1e-9, 'capped spine + gun still sum to the full pitch');
}

done();
