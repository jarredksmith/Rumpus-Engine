import * as THREE from 'three';
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 392: the held third-person gun now follows the character's HAND BONE when one exists (so it tracks
// idle/walk/run/aim/reload automatically), falling back to the fixed body grip otherwise. Also: switching to
// a weapon with no model borrows any set model instead of vanishing, and a body rebuild re-attaches the gun.

// --- hand-bone matching ---
const _findHandBone = new Function('return ' + extractFunction('_findHandBone'))();
const mk=(name)=>{ const b=new THREE.Bone(); b.name=name; return b; };
function rig(names){ const root=new THREE.Object3D(); names.forEach(n=>root.add(mk(n))); return root; }
assert(_findHandBone(rig(['mixamorigRightHand','mixamorigLeftHand'])).name==='mixamorigRightHand', 'prefers the right hand (Mixamo)');
assert(_findHandBone(rig(['Hand_L','Hand_R'])).name==='Hand_R', 'matches Blender-style Hand_R');
assert(_findHandBone(rig(['hand.r','hand.l'])).name==='hand.r', 'matches dotted hand.r');
assert(_findHandBone(rig(['wrist_R','spine'])).name==='wrist_R', 'falls back to a wrist when no hand');
assert(_findHandBone(rig(['Hand_L'])).name==='Hand_L', 'last resort: a left hand beats nothing');
assert(_findHandBone(rig(['spine','pelvis','head']))===null, 'no hand/wrist -> null (use the fixed grip)');
assert(_findHandBone(new THREE.Object3D())===null, 'no bones at all -> null');

// --- attach logic prefers the hand, else the group ---
const aag = extractFunction('attachAvatarGun');
assert(/const hand = _findHandBone\(g\.userData\.visual\);/.test(aag), 'looks for a hand bone in the body model');
assert(/if\(hand\)\{ hand\.add\(gun\); g\.userData\.gunBone=hand; _applyGunGripToHand\(gun, hand, weaponKey, g\.userData\.gripOverride\); \}/.test(aag), 'parents the gun to the hand bone when found (with grip override)');
assert(/else \{ g\.add\(gun\); g\.userData\.gunBone=null; _applyGunGrip\(gun, weaponKey, g\.userData\.gripOverride\); \}/.test(aag), 'falls back to the fixed body grip when no bone (with override)');

// --- hand grip counters the bone world-scale so the gun keeps its size ---
const gth = extractFunction('_applyGunGripToHand');
assert(/bone\.matrixWorld\.decompose\(/.test(gth) && /if\(avg>1e-4\) s\/=avg;/.test(gth), 'undoes the bone world scale so the gun is not distorted');

// --- no-model weapon borrows a set model instead of empty hands ---
// build 1266: the borrow-another-weapon's-model fallback is GONE — it left the hand empty whenever NO
// weapon had a custom model (i.e. the entire stock loadout) and put a rifle in a punching character's hand
// once any weapon had one. The intent it served — a weapon with no model still shows a gun rather than
// vanishing — is now served by wepModelUrl falling back to the engine's own gun, the same as first person.
assert(/let url = _wepShowsFists\(weaponKey\) \? '' : \(wepModelUrl\(weaponKey\) \|\| ''\);/.test(aag),
  'a weapon with no model of its own still shows a gun (fixes the disappearing-on-switch)');
assert(/function wepModelUrl\(key\)\{ const w=WEAPONS\[key\]; return \(w && w\.model\) \? w\.model : gunModelUrl; \}/.test(src),
  '...because that resolver falls back to the engine gun rather than to another weapon');

// --- body rebuild drops the gun ref so it re-attaches to the new skeleton ---
const bav = extractFunction('buildAvatarVisual');
assert(/g\.userData\.gun=null; g\.userData\.gunBone=null; g\.userData\.gunKey=null;/.test(bav), 'rebuilding the body releases the gun so it re-attaches to the new bones');
done();
