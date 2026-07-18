// (build 994) ENEMIES NEVER POP OUT OF EXISTENCE. With the level's Ragdoll toggle off (the
// default), killEnemy() did scene.remove() — instant disappearance. Now a zero-physics fallback
// plays: the body topples AWAY from the killing shot (smoothstep tip -> slam), lies ~2s, then
// sinks + fades on cloned materials. Ragdoll levels are unchanged.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- wiring: the no-ragdoll branch topples instead of removing ----
assert(/if\(!_rag\)\{ if\(en\.mesh\.userData\.mixer\)\{ const mi=mixers\.indexOf\(en\.mesh\.userData\.mixer\); if\(mi>=0\) mixers\.splice\(mi,1\); \} if\(typeof _poseDeath==='function'\) _poseDeath\(en\.mesh\); _fallbackDeath\(en\.mesh, _rdx, _rdz\); \}/.test(src),
  'no ragdoll -> mixer detaches, die-clip pose snaps, then the topple/fade fallback (no scene.remove)');
assert(/const _rag = \(gameCfg\.ragdoll && typeof spawnCorpse==='function'\) \? spawnCorpse\(/.test(src),
  'ragdoll levels still take the physics corpse path');
assert(/if\(!editorOpen && _fadeCorpses\.length\) updateFadeCorpses\(dt\);/.test(src), 'the fallback ticks beside the ragdoll corpses');
assert(/const FADE_CORPSE_MAX=24;/.test(src) && /if\(_fadeCorpses\.length>FADE_CORPSE_MAX\) _removeFadeCorpse\(_fadeCorpses\.shift\(\)\);/.test(src),
  'capped + recycled like the ragdoll pool');
assert(/const c=m\.clone\(\); c\.transparent=true; return c;/.test(src),
  'fade runs on cloned materials (shared model masters stay opaque)');

// ---- executable: the full topple -> hold -> sink -> fade lifecycle on a real THREE mesh ----
const scene = { removed: [], remove(m){ this.removed.push(m); } };
const mkFns = () => {
  const ctx = { THREE, scene, Math, _fadeCorpses: null };
  const code = 'let _fadeCorpses=[];\n'
    + 'const FADE_CORPSE_MAX=24;\n'
    + extractFunction('_removeFadeCorpse', src) + '\n'
    + extractFunction('_fallbackDeath', src) + '\n'
    + 'const _fcQ = new THREE.Quaternion();\n'
    + extractFunction('updateFadeCorpses', src) + '\n'
    + 'return { _fallbackDeath, updateFadeCorpses, corpses: ()=>_fadeCorpses };';
  return new Function('THREE', 'scene', code)(THREE, scene);
};
const { _fallbackDeath, updateFadeCorpses, corpses } = mkFns();

const mesh = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2.8, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
mesh.add(body); mesh.position.set(3, 1.4, -2);
const q0 = mesh.quaternion.clone();

_fallbackDeath(mesh, 1, 0);   // shot came from -x -> topples about the z-ish axis
eq(corpses().length, 1, 'the dead body registers as a fade corpse');
assert(body.material.transparent === true && body.material.color.getHex() === 0xff0000,
  'material cloned (transparent) with the original look preserved');

// topple phase: by the end the body has rotated ~86 deg and its centre dropped ~1.0
for(let t=0;t<0.45;t+=0.05) updateFadeCorpses(0.05);
assert(mesh.quaternion.angleTo(q0) > 1.3, 'the body has toppled (rotated ~1.5 rad from upright)');
near(mesh.position.y, 1.4 - 1.0, 0.15, 'the centre dropped as the body lay down');

// hold phase: nothing moves
const yHold = mesh.position.y;
for(let t=0;t<2.0;t+=0.1) updateFadeCorpses(0.1);
eq(mesh.position.y, yHold, 'the body lies still through the hold');
eq(scene.removed.length, 0, 'not removed during the hold');

// sink + fade phase, then removal
for(let t=0;t<1.2;t+=0.05) updateFadeCorpses(0.05);
eq(scene.removed.length, 1, 'after sinking, the body is removed from the scene');
eq(corpses().length, 0, 'the fade list is empty again');
assert(body.material.opacity < 0.3, 'the material faded out on the way down');

done('build 994: no-ragdoll deaths topple, lie, sink and fade — never a pop-out');
