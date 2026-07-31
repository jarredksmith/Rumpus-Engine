// build 1194: incremental Rapier statics — the late-GLB full-world rebuild is gone.
//
// A GLB finishing its load after deploy used to trigger buildPhysWorld(): destroy the WHOLE world and
// rebuild the terrain trimesh, every static trimesh (the documented multi-second stall), every dynamic
// body, every joint and the character controller — once per load burst, for the crime of one new static
// prop. Statics are now STAMPED with their body (_physStatic / the existing _kbody), addStaticColliderFor
// is idempotent, and the debounced late-load tick adds only the missing statics into the LIVE world.
// The stamp also fixes a real bug: hideprop (1170) removed a static prop's collider from the query list
// but left its Rapier body — an invisible physics wall dynamic props bounced off.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- idempotence + stamps, executed
{
  const mkWorld = () => { const w = { bodies: 0, colliders: 0, removed: 0,
    createRigidBody() { this.bodies++; return { rb: this.bodies }; },
    createCollider() { this.colliders++; }, removeRigidBody() { this.removed++; } };
    return w; };
  const RAP = { RigidBodyDesc: { fixed: () => ({ setTranslation() { return this; }, setRotation() { return this; } }),
    kinematicPositionBased: () => ({ setTranslation() { return this; }, setRotation() { return this; } }) },
    ColliderDesc: { cuboid: () => ({ setFriction() { return this; }, setRestitution() { return this; } }) } };
  const mk = (world) => new Function('physWorld', 'RAPIER', 'isShapePrimitive', 'propShapeInfo', 'colliderDescFor', 'trimeshDescFor', '_psize', '_pcenter', 'THREE', '_ensureHeadlights',
    extractFunction('addStaticColliderFor') + '\nreturn addStaticColliderFor;'
  )(world, RAP, (s) => s === 'box',
    () => ({ off: { x: 0, y: 0, z: 0 } }),
    () => ({ setTranslation() { return this; }, setFriction() { return this; }, setRestitution() { return this; } }),
    () => ({ setFriction() { return this; }, setRestitution() { return this; } }),
    { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }, {}, () => {});
  const prim = () => ({ userData: { src: 'box' }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, position: { x: 0, y: 0, z: 0 }, updateMatrixWorld() {} });
  { const w = mkWorld(); const add = mk(w); const o = prim();
    add(o);
    eq(w.bodies, 1, 'a primitive gets its fixed body');
    assert(o.userData._physStatic, '...and is STAMPED with it');
    add(o); add(o);
    eq(w.bodies, 1, 're-adding a stamped collider creates NOTHING — the idempotence the incremental path rides on'); }
  { const w = mkWorld(); const add = mk(w); const o = prim();
    const trimesh = () => ({ setFriction() { return this; }, setRestitution() { return this; } });
    o.userData.src = 'https://x/building.glb';
    const add2 = new Function('physWorld', 'RAPIER', 'isShapePrimitive', 'propShapeInfo', 'colliderDescFor', 'trimeshDescFor', '_psize', '_pcenter', 'THREE', '_ensureHeadlights',
      extractFunction('addStaticColliderFor') + '\nreturn addStaticColliderFor;'
    )(w, RAP, () => false, () => ({ off: { x: 0, y: 0, z: 0 } }), () => ({}), trimesh, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }, {}, () => {});
    add2(o);
    eq(w.bodies, 1, 'a model gets its trimesh body');
    assert(o.userData._physStatic, '...stamped too — the branch that used to return without recording anything'); }
}

// ---------------------------------------------------------------- the wiring
{
  assert(/if\(o\.userData && \(o\.userData\._physStatic \|\| o\.userData\._kbody\)\) return;/.test(src),
    'addStaticColliderFor is idempotent on the stamps');
  eq((src.match(/o\.userData\._physStatic = rb;/g) || []).length, 3,
    'all three static branches stamp (primitive, trimesh, box fallback); the kinematic branches keep their _kbody stamp');
  assert(/if\(o\.userData\._physStatic\) o\.userData\._physStatic = null;/.test(src),
    'destroyPhysWorld clears the stamps — the bodies died with the world, and a stale stamp would make the next build skip real work');
  const tick = src.match(/build 1194: INCREMENTAL[\s\S]{0,1200}?\}catch\(e\)\{\}/)[0];
  assert(/let _needFull=false;\n      for\(const o of dynamicProps\)\{ if\(o && o\.userData && o\.userData\.phys && !o\.userData\.phys\.body\)\{ _needFull=true; break; \} \}/.test(tick),
    'a dynamic prop missing its body still forces the full rebuild — its joints may reference other bodies');
  assert(/else \{ for\(const c of colliders\) addStaticColliderFor\(c\); \}/.test(tick),
    '...otherwise the tick walks the collider list and the stamps make it add ONLY what is missing');
  assert(/if\(u\._physStatic && typeof physWorld!=='undefined' && physWorld\)\{ try\{ physWorld\.removeRigidBody\(u\._physStatic\); \}catch\(e\)\{\} u\._physStatic=null; \}/.test(src),
    'hideprop removes the static BODY too — it used to leave an invisible physics wall (a real 1170-era bug the stamp exposed)');
  assert(/if\(typeof addStaticColliderFor==='function' && typeof physWorld!=='undefined' && physWorld && !u\.phys\) try\{ addStaticColliderFor\(o\); \}catch\(e\)\{\}/.test(src),
    '...and showprop restores it through the same (idempotent) door');
  assert(/for\(const c of colliders\) addStaticColliderFor\(c\);   \/\/ walls \+ all static props/.test(src),
    'buildPhysWorld itself is untouched — deploy still builds everything, through the now-idempotent adder');
}

done('build 1194: incremental Rapier statics — bodies stamped on their objects, addStaticColliderFor idempotent (executed: triple-add creates one body), the late-GLB tick adds only missing statics into the live world with a dynamics-missing full-rebuild fallback, and hide/show prop verbs finally remove/restore the physics body instead of leaving an invisible wall');
