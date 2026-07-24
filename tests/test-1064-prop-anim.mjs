// (build 1064) THE ANIMATION EDITOR REACHES EVERY PROP — author: "extend the animation editor
// to all props? That would open up a world of possibilities to create cutscenes, npcs, etc."
// Three rig modes now share one editor and one clip library:
//   human — the existing canonical-slot pipeline (retargets onto any humanoid; NPC prop models);
//   bones — a NON-humanoid skeleton (dragon, windmill, crane): tracks keyed 'b:<boneName>';
//   root  — a model with no bones at all: one 'root' track rotates/moves the WHOLE model
//           (raw model units — doors, floating crates, drive-by cars: cutscene motion).
// Custom clips merge into every prop's action set (never auto-playing unless picked), so they
// fire through the normal triggers: Auto / E Activate / Signals / Logic "Do action → anim".
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the generic gather ----
{
  const env = new Function('THREE', extractFunction('_caGatherAnyBones', src) + '\nreturn _caGatherAnyBones;')(THREE);
  const root = new THREE.Group(); root.name = 'Rig';
  const a = new THREE.Bone(); a.name = 'Blade'; root.add(a);
  const b = new THREE.Bone(); b.name = 'Hub'; a.add(b);
  const m = env(root);
  eq(m.get('root'), root, "'root' always answers — the model itself");
  eq(m.get('b:Blade'), a, 'bones answer by their own names');
  eq(m.get('b:Hub'), b, '...all of them');
  eq(env(new THREE.Group()).size, 1, 'a boneless model still offers the root');
}

// ---- the sanitizer passes the new track kinds and rejects unsafe ones ----
{
  const san = new Function(
    "const CA_SLOTS=['hips','spine0'];\nfunction _caNewId(){ return 'ca_test'+Math.random().toString(36).slice(2,8); }\n"
    + extractFunction('_caSanitize', src) + '\nreturn _caSanitize;')();
  const d = san([{ name: 'Spin', dur: 2, tracks: {
    'b:Blade': { q: [[0, 0, 0, 0, 1], [1, 0, 0.7071, 0, 0.7071]] },
    root: { q: [[0, 0, 0, 0, 1]], p: [[0, 0, 0, 0], [2, 5, 0, -600]] },
    'b:bad.name': { q: [[0, 0, 0, 0, 1]] },              // '.' breaks PropertyBinding — rejected
    'b:with space': { q: [[0, 0, 0, 0, 1]] },            // whitespace — rejected
    hips: { q: [[0, 0, 0, 0, 1]], p: [[0, 0, 20, 0]] },  // canonical still works; hips p clamps ±10
  } }])[0];
  assert(d.tracks['b:Blade'], 'a named-bone track survives');
  assert(d.tracks.root && d.tracks.root.p, "the root track survives with its position keys");
  eq(d.tracks.root.p[1][3], -512, 'root p clamps at ±512 raw units');
  eq(d.tracks.hips.p[0][2], 10, 'hips p keeps its ±10 normalized clamp');
  assert(!d.tracks['b:bad.name'] && !d.tracks['b:with space'], 'binding-unsafe bone names are dropped');
}

// ---- build + play: a boneless "crate" follows a root clip; a named bone follows its track ----
{
  const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
    + extractFunction('_caGatherBones', src) + '\n' + extractFunction('_caEnsureRootName', src) + '\n'
    + extractFunction('_caEvalQ', src) + '\n' + extractFunction('_caEvalP', src) + '\n'
    + extractFunction('_caBuildClip', src);
  const env = new Function('THREE', glue + '\nreturn _caBuildClip;')(THREE);
  // a static crate — no bones, unnamed root (the binding-name guarantee must kick in)
  const crate = new THREE.Group();
  crate.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  const data = { name: 'Lift', dur: 1, fps: 30, interp: 'linear', tracks: {
    root: { q: [[0, 0, 0, 0, 1], [1, 0, 0.7071, 0, 0.7071]], p: [[0, 0, 0, 0], [1, 0, 2, 0]] },
  } };
  const clip = env(crate, data);
  assert(clip, 'a boneless model builds a clip from its root track');
  eq(crate.name, 'caRootNode', 'the unnamed root received the deterministic bindable name');
  const mixer = new THREE.AnimationMixer(crate);
  mixer.clipAction(clip).play(); mixer.setTime(0.999); crate.updateWorldMatrix(true, true);
  near(crate.position.y, 2, 0.05, 'the crate LIFTS: root position keys drive the whole model');
  const yaw = 2 * Math.atan2(crate.quaternion.y, crate.quaternion.w);
  near(Math.abs(yaw), Math.PI / 2, 0.06, '...and rotates 90° from its root rotation keys');
  mixer.stopAllAction();
}
{
  const glue = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n'
    + extractFunction('_caGatherBones', src) + '\n' + extractFunction('_caEnsureRootName', src) + '\n'
    + extractFunction('_caEvalQ', src) + '\n' + extractFunction('_caEvalP', src) + '\n'
    + extractFunction('_caBuildClip', src);
  const env = new Function('THREE', glue + '\nreturn _caBuildClip;')(THREE);
  // a windmill: one named bone, no humanoid anything
  const mill = new THREE.Group(); mill.name = 'Mill';
  const blade = new THREE.Bone(); blade.name = 'Blades'; blade.position.set(0, 2, 0); mill.add(blade);
  mill.updateWorldMatrix(true, true);
  const data = { name: 'Spin', dur: 1, fps: 30, interp: 'linear', tracks: {
    'b:Blades': { q: [[0, 0, 0, 0, 1], [1, 0, 0, 0.7071, 0.7071]] },
  } };
  const clip = env(mill, data);
  assert(clip, 'a named-bone clip builds on a non-humanoid rig');
  const mixer = new THREE.AnimationMixer(mill);
  mixer.clipAction(clip).play(); mixer.setTime(0.999); mill.updateWorldMatrix(true, true);
  const roll = 2 * Math.atan2(blade.quaternion.z, blade.quaternion.w);
  near(Math.abs(roll), Math.PI / 2, 0.06, 'the blades roll 90° — generic bones animate by name');
  mixer.stopAllAction();
}

// ---- wiring pins ----
assert(/if\(slot==='root'\) return 'Whole model';/.test(src), "'root' reads as Whole model in the UI");
assert(/if\(!base\.length && !allowCustomOnly\) return null;/.test(src),
  'only props opt into custom-clip-only rigs — guns/coins/previews keep their old contract');
assert(/const usethis = chosen \? \(clip\.name === chosen\) : !caSet\.has\(clip\);/.test(src),
  'a custom clip NEVER auto-plays unless the author picked it by name (existing scenes untouched)');
assert(/playModelAnimations\(obj, gltf, obj\.userData\.animMode, true\)/.test(src), 'props pass the opt-in');
assert(/function _caRefreshPropAnims\(\)\{/.test(src) && /playModelAnimations\(o, g, o\.userData\.animMode, true\)/.test(src),
  'saving a clip re-arms live props without a respawn');
assert(/_aeRigMode=\(_aeBones\.size>1\)\?'bones':'root';/.test(src),
  'the editor falls back: model bones if any, else whole-model mode');
assert(/if\(e\.shiftKey && \(slot==='hips'\|\|slot==='root'\)\)/.test(src), 'Shift-drag moves the whole model in prop mode');
assert(/aeB\.onclick=\(\)=>\{ if\(typeof _aeOpen==='function'\) _aeOpen\(\{ url:\(sel\.userData\.src\|\|''\)\.trim\(\), propMode:true \}/.test(src),
  'every selected model prop offers the Animation editor');
assert(/if\(_aeClip && _aeCfg && _aeCfg\.propMode\)\{/.test(src),
  'prop mode swaps the character Assign panel for prop guidance (triggers/signals/logic)');

done('build 1064: one animation editor for everything — humanoids, any skeleton, or the whole model; cutscenes and ambient NPCs are prop clips now');
