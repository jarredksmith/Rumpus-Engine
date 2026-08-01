import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1251: reported from play — the third-person flashlight lit the scene from BEHIND the player
// (the light is camera-parented, and a chase camera hangs metres back). updateFlashlight re-homes it
// per frame: camera + the 977 offsets in first person, player-chest + facing in third person.
// Executed here with stub graphs; the light-count rule is pinned (same light, only re-parented).

const fnSrc = extractFunction('updateFlashlight');

function rig(opts = {}) {
  const node = (name) => ({ name, children: [], parent: null,
    add(o){ if(o.parent) o.parent.children.splice(o.parent.children.indexOf(o), 1); o.parent = this; this.children.push(o); } });
  const camera = node('camera'), scene = node('scene');
  const vec = () => ({ x:0, y:0, z:0, set(x,y,z){ this.x=x; this.y=y; this.z=z; } });
  const light = { parent: null, position: vec(), target: { parent: null, position: vec() } };
  const mk = new Function('_flashlight', 'tpActive', 'activeViewMode', 'player', 'camera', 'scene',
    `${fnSrc}; return updateFlashlight;`);
  const player = opts.player === null ? undefined
    : { pos: { x: 10, y: 3.7, z: -6 }, yaw: opts.yaw ?? 0, pitch: opts.pitch ?? 0 };
  const fn = mk(opts.noLight ? null : light, () => !!opts.tp, () => (opts.mode || (opts.tp ? 'tp' : 'fps')), player, camera, scene);
  return { fn, light, camera, scene };
}

{ // first person: parented to the camera at exactly the 977 offsets
  const { fn, light, camera } = rig({ tp: false });
  fn();
  assert(light.parent === camera, 'FPS: the light rides the camera');
  assert(light.target.parent === camera, '...and so does its target');
  near(light.position.x, 0.18, 1e-9); near(light.position.y, -0.12, 1e-9); near(light.position.z, 0.1, 1e-9);
  near(light.target.position.z, -1, 1e-9, 'aims straight down the view');
}
{ // third person: the light moves to the PLAYER and aims along their facing — never the camera
  const { fn, light, scene, camera } = rig({ tp: true, yaw: 0, pitch: 0 });
  fn();
  assert(light.parent === scene, 'TP: the light lives in world space');
  // yaw 0 faces -Z (the engine convention): source just ahead of the chest, target 24m out
  near(light.position.x, 10, 1e-6);
  near(light.position.y, 3.7 - 0.35, 1e-6, 'chest height (pos.y is the eye)');
  near(light.position.z, -6 - 0.4, 1e-6, 'the beam starts IN FRONT of the player');
  near(light.target.position.z, -6 - 24, 1e-6, 'and throws forward, not back at the camera');
  assert(light.parent !== camera, 'the chase camera no longer owns the beam — the reported bug');
}
{ // facing follows yaw and pitch
  const { fn, light } = rig({ tp: true, yaw: Math.PI / 2, pitch: 0 });   // faces -X
  fn();
  near(light.position.x, 10 - 0.4, 1e-6, 'yaw rotates the beam origin');
  near(light.target.position.x, 10 - 24, 1e-6, 'and the throw');
  const { fn: f2, light: l2 } = rig({ tp: true, yaw: 0, pitch: 0.5 });
  f2();
  assert(l2.target.position.y > 3.35, 'looking up raises the beam');
}
{ // mode round-trip: TP then back to FPS restores the exact 977 attachment
  const opts = { tp: true }; const { fn, light, camera, scene } = rig(opts);
  fn(); assert(light.parent === scene, 'out to the world...');
  opts.tp = false; fn();
  assert(light.parent === camera, '...and home again');
  near(light.position.x, 0.18, 1e-9); near(light.target.position.z, -1, 1e-9);
}
{ // steady state is zero-work: staying in one mode never re-adds (no per-frame graph churn)
  const { fn, light, camera } = rig({ tp: false });
  fn(); const addsBefore = camera.children.length;
  fn(); fn(); fn();
  eq(camera.children.length, addsBefore, 'the parent check keeps repeat frames free');
}
{ // no light: a clean no-op (flashlight never created — the level does not enable it)
  const { fn } = rig({ noLight: true });
  fn();   // must not throw
}

// --- the light-count rule (977) --------------------------------------------------------------------
assert(!/new THREE\.\w*Light/.test(fnSrc), 'updateFlashlight never creates a light — only re-parents the one that exists');
assert(!/\.visible\s*=/.test(fnSrc), 'and never touches .visible (build 977: that changes the light count and recompiles every shader)');
assert(/if\(typeof updateFlashlight==='function'\) updateFlashlight\(\);/.test(src), 'ticked each frame beside the other world updates');
assert(/tgt\.position\.set\(0,0,-1\); camera\.add\(_flashlight\); camera\.add\(tgt\);/.test(src), 'ensureFlashlight itself is untouched');

done('build 1251: the third-person flashlight beams from the player — both modes executed, round-trip restore, zero steady-state churn, the 977 light-count rule intact');
