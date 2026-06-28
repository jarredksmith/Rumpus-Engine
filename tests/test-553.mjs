import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 713: moving a DYNAMIC (physics) prop in the editor used to revert on save/play. Cause: the serializer saved
// physHome (the transform captured when the prop was first made dynamic) and the gizmo/fields never updated it. Fix:
// (a) only fall back to physHome while the prop is actually simulating (has a live body); in the editor use o.position,
// and (b) keep physHome in step with every editor move so re-opening the editor doesn't snap it back.

// --- executable: _authoredHome picks the right source ---
const ah = new Function(extractFunction('_authoredHome') + '\nreturn _authoredHome;')();
{ const ed = { position:{x:5,y:0,z:5}, userData:{ phys:{ body:null }, physHome:{x:1,y:0,z:1} } };
  assert(ah(ed) === ed.position, 'editor (no live body): use o.position, so a gizmo move actually saves'); }
{ const play = { position:{x:9,y:2,z:9}, userData:{ phys:{ body:{} }, physHome:{x:1,y:0,z:1} } };
  assert(ah(play) === play.userData.physHome, 'while simulating (live body): use physHome, not the physics-displaced spot'); }
{ const stat = { position:{x:3,y:0,z:3}, userData:{} };
  assert(ah(stat) === stat.position, 'a non-dynamic prop always serializes o.position'); }

// --- executable: _homeSync copies the live transform into the authored home (for dynamic props only) ---
const hs = new Function(extractFunction('_homeSync') + '\nreturn _homeSync;')();
{ let cp=null, cq=null;
  const o = { position:{x:7,y:8,z:9}, quaternion:{x:0,y:0,z:0,w:1}, userData:{ phys:{}, physHome:{ copy(v){ cp=v; } }, physHomeQ:{ copy(v){ cq=v; } } } };
  hs(o);
  assert(cp === o.position && cq === o.quaternion, 'syncs physHome + physHomeQ to the current transform'); }
{ const o2 = { position:{}, quaternion:{}, userData:{} }; hs(o2); assert(true, 'no-op (no throw) for a non-dynamic prop'); }

// --- the serializer + code export use _authoredHome ---
assert(/const h = _authoredHome\(o\);\s*\n\s*const e=\{ src:o\.userData\.src\|\|PROP_MODEL_URL, t:\[ h\.x, h\.y, h\.z,/.test(src), 'propEntry serializes the authored home');
assert(/const _h = _authoredHome\(o\);[\s\S]*?const hx = _h\.x, hy = _h\.y, hz = _h\.z;/.test(src), 'code export uses the authored home too');

// --- every editor move chokepoint keeps the home in sync ---
assert(/o\.position\.copy\(v\); refreshPropCollider\(o\); _homeSync\(o\);/.test(src), 'gizmo translate syncs the home');
assert(/o\.rotation\.copy\(euler\); refreshPropCollider\(o\); _homeSync\(o\);/.test(src), 'gizmo rotate syncs the home');
assert(/const touch = \(o\)=>\{ if\(!isL\)\{ refreshPropCollider\(o\); _homeSync\(o\); \} \};/.test(src), 'group drag syncs the home');
assert(/refreshPropCollider\(o\); _homeSync\(o\);   \/\/ keep the solid hitbox/.test(src), 'numeric-field apply syncs the home');

done('build 713: editor moves to dynamic props now save (no revert to the original spot)');
