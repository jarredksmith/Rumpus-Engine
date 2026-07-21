// (build 942) JOINT TWEAKS — per-character bone rotation offsets, settable in the editor, for rigs
// that import with odd rest poses (bent wrists, A-pose arms, twisted forearms). The retargeter
// re-bases every clip on the model's rest pose, so a weird rest pose rides into EVERY animation —
// this is the in-app fix: offsets in degrees per canonical bone, applied every frame ON TOP of the
// animation and BEFORE the weapon-hold IK (which then builds on the corrected pose), LOD-safe via
// the base/applied pattern, WYSIWYG in the Player-tab preview, and saved with the character (level,
// roster, MP character broadcast).
// Verified live on the UAL rig: L-forearm +60° X moved the wrist 0.4 world units, the applied offset
// measured exactly 60.0° and was still 60.0° two seconds later (no accumulation), clearing the tweak
// returned the bone to the mixer, and the editor preview showed the identical delta.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the sanitizer — run it
const sj = extractFunction('_sanitizeJointFix', src);
const run = new Function(sj + "\nreturn _sanitizeJointFix;")();
const out = run({ 'L:forearm':[400,-999,'30'], junk:'x', empty:[0,0,0] });
assert(out['L:forearm'][0]===180 && out['L:forearm'][1]===-180 && out['L:forearm'][2]===30, 'angles clamp to ±180 and coerce');
assert(!out.junk && !out.empty, 'non-arrays and all-zero entries are dropped');

// the application: local additive rotation, LOD-safe, canonical bone lookup cached
const ap = extractFunction('_applyJointFix', src);
assert(/if\(ud\._jfApplied && ud\._jfBase && b\.quaternion\.equals\(ud\._jfApplied\)\) b\.quaternion\.copy\(ud\._jfBase\);/.test(ap),
  'undoes last frame first when the mixer skipped the bone — offsets never accumulate');
assert(/b\.quaternion\.multiply\(_jfQ\.setFromEuler\(_jfE\)\)/.test(ap), 'local-space additive rotation (degrees -> radians)');
assert(/vis\.userData\._jfBones=\{\}/.test(ap) && /_canonBoneKey/.test(ap), 'bones resolved once via the canonical keys and cached');

// ordering: applied before the aim/IK on every avatar, and in the preview
assert(/_applyJointFix\(_ownAvatar, _myJointFix\(\)\); _aimAvatarGun\(_ownAvatar, player\.yaw, player\.pitch\);/.test(src),
  'own third-person body: tweaks ride under the aim + hold IK');
assert(/_applyJointFix\(rp\.mesh\); _aimAvatarGun\(rp\.mesh, rp\.yaw\|\|0, rp\.pitch\|\|0\);/.test(src),
  'remote players get their broadcast tweaks');
assert(/_applyJointFix\(previewAvatar, _myJointFix\(\)\);   \/\/ build 942/.test(src), 'the Player-tab preview is WYSIWYG');

// persistence tour (the same 8 stops as animLib/ikHold)
assert(/jointFix:_sanitizeJointFix\(c\.jointFix\), autoRig:_sanitizeAutoRig\(c\.autoRig\), clips:/.test(extractFunction('_sanitizeCharCfg', src)), 'sanitized (build 1025: + auto-rig markers)');
assert(/jointFix:Object\.assign\(\{\}, c\.jointFix\|\|\{\}\), clips:/.test(extractFunction('myCharCfg', src)), 'in the play/MP cfg');
assert(/jointFix:_sanitizeJointFix\(playerModelCfg\.jointFix\),/.test(src), 'serialized with the level');
assert(/playerModelCfg\.jointFix=_sanitizeJointFix\(pl\.jointFix\);/.test(src), 'restored on load');

// the editor UI exists
assert(/Joint tweaks \\u2014 fix odd rigs/.test(src) && /JF_LABELS/.test(src), 'Player tab has the Joint tweaks panel');

done('build 942: joint tweaks — fix odd rigs in-app, per bone, per character, live in the preview');
