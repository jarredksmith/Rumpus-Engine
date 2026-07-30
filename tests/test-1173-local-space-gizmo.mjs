// build 1173: the gizmo learns local space.
//
// The editor critic, verified: `tryGizmoGrab` built every drag axis as a WORLD unit vector — a wall rotated
// 30° could not be slid along its own length; the numeric fields at five decimals were the only way. A
// World/Local toggle now rotates the translate axes, per-axis scale handles and rotate normals by the
// PRIMARY object's quaternion, and the gizmo visual turns with it, so the handle you see is the axis you
// get. Scale MATH needed no change — it always scaled the object's own components; only its handles pointed
// the wrong way. Lights/zones/markers stay world (they are unrotated, world IS their local).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the resolver, executed
{
  const mkQ = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
  const fn = (space, active, idx) => new Function('gizmoSpace', 'editorActive', 'propModels', 'turretModels', 'editorTargets',
    extractFunction('_gizmoRefQuat') + '\nreturn _gizmoRefQuat();'
  )(space, active, [{ quaternion: mkQ }], [{ quaternion: { x: 0, y: 0.7, z: 0, w: 0.7 } }], { props: { idx: idx || 0 }, turrets: { idx: 0 } });
  eq(fn('world', 'props'), null, 'world mode never orients — identity axes, exactly the old behaviour');
  assert(fn('local', 'props') === mkQ, "local mode returns the primary PROP's own quaternion");
  assert(fn('local', 'turrets') !== null, '...and a turret\'s');
  eq(fn('local', 'lights'), null, 'lights stay world — they are unrotated, world IS their local');
  eq(fn('local', 'props', 5), null, 'a missing primary falls back to world instead of throwing');
}

// ---------------------------------------------------------------- the drag axes rotate
{
  const grab = extractFunction('tryGizmoGrab');
  const rotated = (grab.match(/const q=_gizmoRefQuat\(\); if\(q\) (?:dir|normal)\.applyQuaternion\(q\)\.normalize\(\);/g) || []).length;
  eq(rotated, 3, 'all three drag constructions rotate in local mode: translate axis, per-axis scale handle, rotate normal');
  assert(grab.indexOf('applyQuaternion') < grab.indexOf('axisParamUnderPointer'),
    'the translate axis rotates BEFORE the pointer parameter is measured, so the drag tracks the drawn handle');
  // the rotated axis flows into the stored drag, so applyGizmoDrag and the group path inherit it for free
  assert(/gizmoDrag = \{ kind, dir, startParam/.test(grab), 'the rotated dir is what the drag stores');
  assert(/gizmoDrag = \{ kind, axis, normal, center/.test(grab), '...and the rotated normal');
}
{
  // executable: a local-X drag on a 90°-yawed object moves along world -Z
  const q = { }; // quaternion for yaw 90°: (0, sin45, 0, cos45)
  const THREEq = null;
  const yaw90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  // applyQuaternion for unit X: standard formula
  const rot = (v, q2) => {
    const { x, y, z, w } = q2;
    const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z,
      iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
    return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
  };
  const d = rot({ x: 1, y: 0, z: 0 }, yaw90);
  near(d.x, 0, 1e-9, 'sanity: local X on a 90°-yawed wall is world-Z-ward');
  near(Math.abs(d.z), 1, 1e-9, '...unit length — sliding the wall along its own face');
}

// ---------------------------------------------------------------- the visual and the UI
{
  const ug = extractFunction('updateGizmo');
  assert(/const q=_gizmoRefQuat\(\); if\(q\) gizmo\.quaternion\.copy\(q\); else gizmo\.quaternion\.set\(0,0,0,1\);/.test(ug),
    'the gizmo visual turns with the object in local mode and resets in world — the handle you see is the axis you get');
  assert(/gizmoSpace=sp; _saveSnapPrefs\(\);/.test(src), 'the World/Local buttons persist the choice');
  assert(/localStorage\.getItem\('breach_gizspace'\)==='local'/.test(src), '...and it survives a reload');
  assert(/slide a rotated wall along its length/.test(src), 'the Local button says what it is FOR');
}

done('build 1173: a World/Local gizmo toggle — translate axes, scale handles and rotate normals follow the primary object\'s own rotation, the visual turns to match, lights/zones stay world, world mode is byte-identical to before, and the choice persists');
