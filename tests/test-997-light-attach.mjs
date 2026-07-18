// (build 997) LIGHTS ATTACH TO PROPS — true scene-graph parenting: a lamp glued to a knockable
// lightpole rides the pole through physics (dynamic props write their body transform every frame;
// a CHILD light follows for free). Attachment survives serialize/share via the prop's nid; props
// load async, so a per-frame reconciler does the parenting when the prop arrives, and releases the
// light back to the scene (at its last WORLD transform) if the pole is deleted.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the reconciler + attach/detach on a real THREE graph ----
function mkWorld(){
  const scene = new THREE.Scene();
  const propModels = [], lightModels = [];
  const env = { THREE, scene, propModels, lightModels, genNid: (() => { let n = 0; return () => 'T-' + (++n); })() };
  const code = 'const _lgP=new THREE.Vector3(), _lgQ=new THREE.Quaternion();\n'
    + extractFunction('_syncAttachedLights', src) + '\n'
    + extractFunction('attachLightToProp', src) + '\n'
    + extractFunction('detachLight', src) + '\n'
    + 'return { _syncAttachedLights, attachLightToProp, detachLight };';
  const fns = new Function(...Object.keys(env), code)(...Object.values(env));
  return { ...env, ...fns };
}

{ // attach keeps the world transform, then the light RIDES the prop (the lightpole scenario)
  const w = mkWorld();
  const pole = new THREE.Group(); pole.position.set(10, 0, 0); w.scene.add(pole); w.propModels.push(pole);
  const light = new THREE.Group(); light.position.set(10, 6, 0); w.scene.add(light); w.lightModels.push(light);
  assert(w.attachLightToProp(light, pole), 'attach succeeds');
  assert(pole.userData.nid, 'the prop got a nid to anchor the attachment');
  const wp = new THREE.Vector3(); light.getWorldPosition(wp);
  near(wp.y, 6, 1e-6, 'no jump on attach (world transform preserved)');
  // knock the pole over: physics writes its quaternion/position
  pole.rotation.z = -Math.PI / 2; pole.updateMatrixWorld(true);
  light.getWorldPosition(wp);
  near(wp.x, 16, 1e-6, 'the lamp head swung with the falling pole (x = 10 + 6)');
  near(wp.y, 0, 1e-6, '...down to ground height — the light STAYED ON THE POLE');
}
{ // serialized attachments re-parent when the prop arrives late (async loads / MP)
  const w = mkWorld();
  const light = new THREE.Group(); light.position.set(3, 5, 0);
  light.userData.att = { nid: 'P-9', p: [0, 5, 0], q: [0, 0, 0, 1] };
  w.scene.add(light); w.lightModels.push(light);
  w._syncAttachedLights();
  eq(light.parent, w.scene, 'no prop yet -> the light waits in the scene');
  const pole = new THREE.Group(); pole.position.set(3, 0, 0); pole.userData.nid = 'P-9';
  w.scene.add(pole); w.propModels.push(pole);
  w._syncAttachedLights();
  eq(light.parent, pole, 'the reconciler parents the light when its prop appears');
  const wp = new THREE.Vector3(); light.getWorldPosition(wp);
  near(wp.y, 5, 1e-6, 'restored at the authored local offset');
}
{ // deleting the pole releases the light at its last WORLD transform (never vanishes)
  const w = mkWorld();
  const pole = new THREE.Group(); pole.position.set(0, 0, 8); w.scene.add(pole); w.propModels.push(pole);
  const light = new THREE.Group(); light.position.set(0, 4, 8); w.scene.add(light); w.lightModels.push(light);
  w.attachLightToProp(light, pole);
  w.propModels.length = 0;               // prop deleted (removeProp splices it out)
  w._syncAttachedLights();
  eq(light.parent, w.scene, 'orphaned light returns to the scene');
  eq(light.userData.att, undefined, 'the dead attachment is cleared');
  near(light.position.z, 8, 1e-6, '...at its last world position');
}
{ // detach is explicit and world-preserving too
  const w = mkWorld();
  const pole = new THREE.Group(); w.scene.add(pole); w.propModels.push(pole);
  const light = new THREE.Group(); light.position.set(0, 7, 0); w.scene.add(light); w.lightModels.push(light);
  w.attachLightToProp(light, pole);
  w.detachLight(light);
  eq(light.parent, w.scene, 'detached back to the scene');
  near(light.position.y, 7, 1e-6, 'no jump on detach');
}

// ---- wiring pins ----
assert(/const _wp=new THREE\.Vector3\(\); g\.getWorldPosition\(_wp\);/.test(src) && /t:\[_wp\.x,_wp\.y,_wp\.z\]/.test(src),
  '_lightOpts serializes WORLD position (an attached light’s g.position is prop-local)');
assert(/if\(g\.userData\.att && g\.parent && g\.parent!==scene\) o\.att=\{ nid:g\.userData\.att\.nid,/.test(src),
  '...and ships the attachment (nid + local transform) only while genuinely parented');
assert(/if\(opts\.att && opts\.att\.nid\) g\.userData\.att=\{ nid:String\(opts\.att\.nid\),/.test(src),
  'buildLight restores the attachment intent for the reconciler');
assert(/\(g\.parent\|\|scene\)\.remove\(g\);/.test(src), 'removeLight releases from whatever parent it has');
assert(/if\(typeof _syncAttachedLights==='function'\) _syncAttachedLights\(\);[^\n]*\n\s*updateLightBudget\(\);/.test(src),
  'the reconciler ticks every frame beside the light budget');
assert(/host\.attach\(g\);/.test(src), 'attach uses THREE’s world-preserving reparent');
assert(/Attach to selected prop/.test(src) && /Detach from prop/.test(src), 'Attach/Detach buttons in the Lights panel');
assert(/Pick a prop on the Build tab first to enable Attach\./.test(src), 'the panel explains the two-selection flow');

done('build 997: lights attach to props — the lamp stays on the falling lightpole');
