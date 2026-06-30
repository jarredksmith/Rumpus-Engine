// (build 779) Tier-0 ragdoll: a dead enemy becomes a single tumbling physics capsule that carries the killing hit's
// force, with the frozen mesh rigidly attached. A per-level toggle; capped + faded out. Physics is browser-verified;
// this pins the wiring + the maths that don't need Rapier.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// config + persistence
assert(/ragdoll: !!\(savedLevel && savedLevel\.game && savedLevel\.game\.ragdoll\)/.test(src), 'gameCfg has a ragdoll flag (off by default)');
assert(/ragdoll: !!gameCfg\.ragdoll/.test(src), 'ragdoll serializes with the level');
assert(/gameCfg\.ragdoll = !!level\.game\.ragdoll;/.test(src), 'ragdoll restores from a loaded level');
assert(/fdToggle\('<b>Ragdoll on death<\/b>', \(\)=>gameCfg\.ragdoll, v=>gameCfg\.ragdoll=v\)/.test(src), 'the editor exposes a Ragdoll toggle');

// the kill path spawns a corpse with the hit direction (else removes the mesh as before)
assert(/if\(en\.hp<=0\)\{ killEnemy\(en, sx, sz\); return true; \}/.test(extractFunction('enemyHurt')), 'the killing hit threads its direction to killEnemy');
const ke = extractFunction('killEnemy');
assert(/if\(sx!=null\)\{ _rdx=en\.mesh\.position\.x-sx; _rdz=en\.mesh\.position\.z-sz;/.test(ke), 'the corpse is launched AWAY from the attacker');
assert(/const _rag = \(gameCfg\.ragdoll && typeof spawnCorpse==='function'\) \? spawnCorpse\(en\.mesh,/.test(ke) && /if\(!_rag\)\{ scene\.remove\(en\.mesh\);/.test(ke), 'ragdoll on -> spawn a corpse; else remove the mesh as before');

// spawnCorpse: freeze the pose, own the materials, build a dynamic capsule with the impulse
const sc = extractFunction('spawnCorpse');
assert(/if\(mesh\.userData\.mixer\)\{ const mi=mixers\.indexOf\(mesh\.userData\.mixer\); if\(mi>=0\) mixers\.splice\(mi,1\); \}/.test(sc), 'the animation mixer is stopped (frozen pose)');
assert(/o\.material = Array\.isArray\(o\.material\)\?o\.material\.map\(m=>m\.clone\(\)\):o\.material\.clone\(\);/.test(sc), 'the corpse clones its materials (fading it never touches live enemies)');
assert(/RAPIER\.ColliderDesc\.capsule\(hh, r\)/.test(sc) && /RAPIER\.RigidBodyDesc\.dynamic\(\)/.test(sc), 'a dynamic capsule body carries the corpse');
assert(/if\(_corpses\.length>RAGDOLL_MAX\)\{ _removeCorpse\(_corpses\.shift\(\)\); \}/.test(sc), 'concurrent corpses are capped (oldest recycled)');

// updateCorpses: mesh rigidly follows the body (feet offset), then fades + despawns
const uc = extractFunction('updateCorpses');
assert(/_corpV\.set\(0,-c\.hh,0\)\.applyQuaternion\(c\.mesh\.quaternion\);/.test(uc) && /c\.mesh\.position\.set\(t\.x\+_corpV\.x/.test(uc), 'the mesh hangs off the capsule by the half-height (so the feet line up)');
assert(/if\(k<=0\)\{ _removeCorpse\(c\); _corpses\.splice\(i,1\); continue; \}/.test(uc), 'the corpse fades then despawns');

// lifecycle: stepped each frame, and cleared when the world is torn down
assert(/if\(!editorOpen && _corpses\.length\) updateCorpses\(dt\);/.test(src), 'corpses advance each frame');
assert(/if\(typeof _clearCorpses==='function'\) _clearCorpses\(\);/.test(extractFunction('destroyPhysWorld')), 'corpses are cleared when the physics world is freed (editor / teardown)');
assert(/if\(!dynamicProps\.length && !fragments\.length && !_corpses\.length/.test(src), 'the physics step keeps running while corpses exist');

done('build 779: Tier-0 ragdoll (physics corpse) on enemy death');
