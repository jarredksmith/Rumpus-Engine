// build 1237: decals ride the surface they hit — reported twice from play ("bullets hit an invisible
// wall and the decals just float") and PROBE-CONFIRMED headless before fixing: an instrumented build,
// driven under real Chromium, auto-fired at stock-level capsules and logged every world-decal
// recipient — the first was the stock level's own moving platform (userData._cgMobile). Decals were
// stamped in WORLD space, so a hole on an animated door/elevator/platform hung in mid-air the moment
// the surface moved on. Object3D.attach keeps world pose while reparenting: a decal on a mover now
// travels with it, a wall decal is byte-identical (static roots don't move), and a deleted prop takes
// its holes with it instead of leaving them floating.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const mkWorld = () => {
  const scene = new THREE.Scene();
  const env = {
    THREE, scene,
    decalCfg: { on: true, size: 1, life: 1 },
    decals: [], _decalPool: [],
    _decalGeo: new THREE.PlaneGeometry(1, 1),
    _decalN: new THREE.Vector3(), _decalZ: new THREE.Vector3(0, 0, 1),
    _getDecalTex: () => null,
    DECAL_MAX: 4, DECAL_LIFE: 10,
  };
  const code = extractFunction('spawnBulletDecal') + '\n' + extractFunction('updateDecals') +
    '\nreturn { spawnBulletDecal, updateDecals };';
  const fns = new Function(...Object.keys(env), code)(...Object.values(env));
  return { ...env, ...fns, scene };
};

// ---------------------------------------------------------------- the report, replayed on a real graph
{
  const w = mkWorld();
  // a "door": a prop root in the scene with a child mesh (multi-mesh props move as one object)
  const door = new THREE.Group(); const panel = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.1));
  door.add(panel); w.scene.add(door); door.position.set(5, 0, 0); door.updateMatrixWorld(true);
  w.spawnBulletDecal(new THREE.Vector3(5, 1.5, 0.05), new THREE.Vector3(0, 0, 1), panel);
  eq(w.decals.length, 1, 'the hole stamps');
  const m = w.decals[0].mesh;
  assert(m.parent === door, 'it is PARENTED to the hit object\'s top-level root — the door, not the scene');
  const p0 = m.getWorldPosition(new THREE.Vector3());
  near(p0.x, 5, 1e-6, '...at the exact world point it was stamped (attach keeps world pose)');
  door.position.x += 3; door.updateMatrixWorld(true);           // the door slides open
  const p1 = m.getWorldPosition(new THREE.Vector3());
  near(p1.x, 8, 1e-6, 'the door slides — THE HOLE RIDES IT (this exact motion used to leave it floating mid-doorway)');
}
{ // a static wall behaves byte-identically: its root never moves, so neither does the hole
  const w = mkWorld();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.5)); w.scene.add(wall); wall.updateMatrixWorld(true);
  w.spawnBulletDecal(new THREE.Vector3(1, 1, 0.25), new THREE.Vector3(0, 0, 1), wall);
  const m = w.decals[0].mesh;
  assert(m.parent === wall, 'a wall decal parents to the wall');
  near(m.getWorldPosition(new THREE.Vector3()).x, 1, 1e-6, '...standing exactly where it hit');
}
{ // a deleted prop takes its holes with it — better than floating over nothing
  const w = mkWorld();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); w.scene.add(crate); crate.updateMatrixWorld(true);
  w.spawnBulletDecal(new THREE.Vector3(0, 0.5, 0.5), new THREE.Vector3(0, 0, 1), crate);
  w.scene.remove(crate);
  assert(!w.decals[0].mesh.getWorldPosition(new THREE.Vector3()) || w.decals[0].mesh.parent === crate,
    'the hole left the scene WITH its crate');
}
{ // recycling detaches from WHATEVER parent the decal rides — the pool never leaks into a prop
  const w = mkWorld();
  const door = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.1)); w.scene.add(door); door.updateMatrixWorld(true);
  for(let i = 0; i < 5; i++) w.spawnBulletDecal(new THREE.Vector3(0, i * 0.2, 0.05), new THREE.Vector3(0, 0, 1), door);
  eq(w.decals.length, 4, 'the cap recycles the oldest');
  eq(w._decalPool.length >= 1 && w._decalPool[0].parent, null, '...and the recycled mesh is DETACHED from the door, not left glued inside it');
  // expiry detaches too
  w.decals.forEach(d => { d.life = 0.001; });
  w.updateDecals(1);
  eq(w.decals.length, 0, 'expiry clears');
  assert(w._decalPool.every(mm => !mm.parent), '...every pooled mesh parentless — no path leaves a hole riding a prop');
}
{ // no hit object (rare): plain scene stamp, exactly the old behavior
  const w = mkWorld();
  w.spawnBulletDecal(new THREE.Vector3(0, 0, 0), null, null);
  assert(w.decals[0].mesh.parent === w.scene, 'a decal with no object stays scene-anchored');
}

// ---------------------------------------------------------------- the wiring
{
  const fn = extractFunction('spawnBulletDecal');
  assert(/while\(r && r\.parent && r\.parent!==scene && guard\+\+<12\) r=r\.parent;/.test(fn),
    'the attach walks to the TOP-LEVEL root — a multi-mesh prop moves as one, and an InstancedMesh hit (1139: shared unit geometry) lands on the static batch root, still world-true');
  assert(/try\{ r\.attach\(m\); \}catch\(e\)\{\}/.test(fn), '...via attach, which keeps the world pose');
  eq((src.match(/if\(d\.mesh\.parent\) d\.mesh\.parent\.remove\(d\.mesh\);/g) || []).length >= 1 &&
     (src.match(/if\(old\.mesh\.parent\) old\.mesh\.parent\.remove\(old\.mesh\);/g) || []).length, 1,
    'every removal site (expiry, cap, scene wipe) detaches from whatever parent the decal rides');
}

done('build 1237: decals ride the surface they hit — replayed on a real THREE graph: a hole stamped on a sliding door travels with it (the exact motion that left holes floating mid-doorway), wall decals byte-identical, a deleted prop takes its holes along, every recycle path detaches cleanly so the pool never leaks into a prop, and objectless stamps keep the old scene anchor');
