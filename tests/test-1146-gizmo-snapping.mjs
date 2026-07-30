// build 1146: the transform gizmo snaps.
//
// It moved, rotated and scaled in raw continuous mouse units. Nothing in the product could put two crates
// on one lattice, sit a wall flush against another, or turn a prop exactly 90 degrees — except the numeric
// fields, at five decimal places, one axis at a time. Every editor a creator arrives from (Unreal, Unity,
// Blender, Godot) snaps by default and holds a modifier to escape it.
//
// Build 929's `buildSnap` is a different feature and is untouched: it snaps the PLACEMENT of a new block
// against the face you aim at. This snaps the TRANSFORM of something already in the scene.
//
// Four decisions here, each of which could reasonably have gone the other way, so each is executed below:
//
//  * A SINGLE object snaps its resulting POSITION to the world lattice, so two crates placed in separate
//    drags land on the same grid and read as flush.
//  * A GROUP snaps the DISTANCE MOVED instead — snapping each member absolutely would pull a deliberate
//    arrangement apart the first time it was nudged (two crates 1.2 apart becoming 1.0 or 1.5 apart).
//  * SCALE snaps the resulting SIZE, not the factor: a box primitive's scale is its size in metres, so
//    what a creator wants is a wall exactly 3.0 wide. The factor is derived back out of the snapped size,
//    which keeps proportional scaling proportional while landing the dragged axis on a round number.
//  * ROTATE snaps the ANGLE TURNED, not the resulting orientation — decomposing an orientation back out of
//    a quaternion is ambiguous, and "a quarter turn from here" is what the handle is for.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// a minimal Vector3 with the three methods the snap helpers use
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new V3(this.x, this.y, this.z); }
  dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
}
const AX = { x: new V3(1, 0, 0), y: new V3(0, 1, 0), z: new V3(0, 0, 1) };

const snapApi = () => new Function('Math', 'isFinite', 'gizmoSnap',
  src.match(/const _snapTo = [^;]+;/)[0] + '\n'
  + extractFunction('_snapOn') + '\n' + extractFunction('_snapAlong') + '\n'
  + 'return { _snapTo, _snapOn, _snapAlong };');

// ---------------------------------------------------------------- the modifier INVERTS
{
  const on = snapApi()(Math, isFinite, true)._snapOn;
  const off = snapApi()(Math, isFinite, false)._snapOn;
  // with snapping on (the default) Ctrl is how you nudge into a gap...
  eq(on({}), true, 'snapping on, no modifier: snapped');
  eq(on({ ctrlKey: true }), false, 'snapping on, Ctrl held: free');
  eq(on({ metaKey: true }), false, '...and Cmd, for the mac');
  // ...and with it off, Ctrl is how you grab the lattice for one drag
  eq(off({}), false, 'snapping off, no modifier: free');
  eq(off({ ctrlKey: true }), true, 'snapping off, Ctrl held: snapped');
  eq(on(null), true, 'a missing event is treated as no modifier rather than throwing');
  eq(on(undefined), true, '...and undefined too');
  // Shift must NOT be the key: it is already multi-select in this editor
  eq(on({ shiftKey: true }), true, 'Shift does not affect snapping — it is the multi-select modifier here');
  assert(/gizmoSnap !== inv/.test(extractFunction('_snapOn')), 'the modifier is expressed as an inversion, not an enable');
}

// ---------------------------------------------------------------- _snapTo, executed
{
  const { _snapTo } = snapApi()(Math, isFinite, true);
  eq(_snapTo(1.2, 0.5), 1.0, 'rounds to the nearest step, not down');
  eq(_snapTo(1.3, 0.5), 1.5, '...in both directions');
  near(_snapTo(-1.2, 0.5), -1.0, 1e-9, 'negatives round the same way');
  eq(_snapTo(7, 1), 7, 'a value already on the lattice is unchanged');
  // step 0 means "off for this channel", which is what the tooltip promises
  eq(_snapTo(1.234, 0), 1.234, 'a zero step passes the value through — the field says 0 turns it off');
  eq(_snapTo(1.234, -1), 1.234, '...and so does a negative one');
  // and garbage must not become NaN in a transform
  assert(Number.isNaN(_snapTo(NaN, 0.5)), 'NaN passes through unrounded rather than becoming a rounded garbage value');
  eq(_snapTo(Infinity, 0.5), Infinity, 'a non-finite value is passed through rather than rounded to NaN');
}

// ---------------------------------------------------------------- translate: single, on the lattice
{
  const { _snapAlong } = snapApi()(Math, isFinite, true);
  // the whole point: the component along the DRAG axis lands on the grid
  const p = _snapAlong(new V3(1.2, 3.7, -0.4), AX.x, 0.5);
  eq(p.x, 1.0, 'the dragged axis snaps');
  // ...and the two axes the creator is NOT touching are left exactly alone. Snapping the whole vector
  // would drag an object deliberately placed off-lattice onto the grid the moment any axis was nudged.
  eq(p.y, 3.7, 'the perpendicular axes are untouched (y)');
  eq(p.z, -0.4, '...and z');
  {
    const q = _snapAlong(new V3(1.2, 3.7, -0.4), AX.y, 0.5);
    eq(q.y, 3.5, 'dragging y snaps y');
    eq(q.x, 1.2, '...and leaves x');
  }
  {
    const r = _snapAlong(new V3(0.1, 0, -1.26), AX.z, 0.5);
    near(r.z, -1.5, 1e-9, 'a negative z snaps to the nearer multiple');
  }
  eq(_snapAlong(new V3(1.234, 0, 0), AX.x, 0).x, 1.234, 'a zero grid is a no-op');
  assert(_snapAlong(null, AX.x, 0.5) === null, 'a missing position does not throw');
  // the source must snap the RESULT, not the delta, on this path
  const fn = extractFunction('gizmoDragMove');
  assert(/let p = d\.startPos\.clone\(\)\.addScaledVector\(d\.dir, s - d\.startParam\);/.test(fn), 'the drag computes the resulting position');
  assert(/if\(_snapOn\(e\)\) p = _snapAlong\(p, d\.dir, snapGrid\);/.test(fn), '...and snaps THAT to the lattice');
}

// ---------------------------------------------------------------- translate: group, rigid
{
  const fn = extractFunction('applyGroupDrag');
  assert(/let dist = s - d\.startParam;/.test(fn), 'a group computes the distance moved');
  assert(/if\(_snapOn\(e\)\) dist = _snapTo\(dist, snapGrid\);/.test(fn), '...and snaps the DISTANCE, not each member');
  assert(!/_snapAlong/.test(fn), 'a group never snaps a member absolutely — that is what would break the arrangement');
  assert(/would pull a deliberate arrangement apart/.test(src), 'and the reason the two paths differ is written down');
  // executable: a snapped delta preserves every relative offset, whatever the members started on
  const { _snapTo } = snapApi()(Math, isFinite, true);
  const members = [0, 1.2, 2.35, -0.7];
  const raw = 1.31, dist = _snapTo(raw, 0.5);
  eq(dist, 1.5, 'the delta snaps');
  const moved = members.map(m => m + dist);
  for (let i = 1; i < members.length; i++)
    near(moved[i] - moved[i - 1], members[i] - members[i - 1], 1e-12, 'every gap in the cluster is preserved exactly (' + i + ')');
}

// ---------------------------------------------------------------- scale: the SIZE snaps
{
  const fn = extractFunction('gizmoDragMove');
  assert(/const want = _snapTo\(d\.startScale\[ax\] \* f, snapScaleStep\);/.test(fn), 'the resulting SIZE is what snaps');
  assert(/if\(want >= snapScaleStep \* 0\.5\) f = want \/ d\.startScale\[ax\];/.test(fn),
    '...and the factor is derived back out of it, so proportional scaling stays proportional');
  assert(/d\.startScale\[ax\] > 1e-6/.test(fn), 'a zero-scale axis is not divided by');
  // executable: the derivation
  const step = 0.25;
  const derive = (start, f) => { const want = Math.round(start * f / step) * step;
    return (want >= step * 0.5) ? want / start : f; };
  near(1 * derive(1, 1.13), 1.25, 1e-9, 'a unit box dragged to 1.13 lands on 1.25');
  near(2 * derive(2, 1.6), 3.25, 1e-9, 'a 2-unit wall dragged to 3.2 lands on 3.25');
  // proportionality: the SAME factor applies to every axis, so a non-uniform start stays in proportion
  {
    const start = { x: 2, y: 0.5, z: 4 };
    const f = derive(start.x, 1.6);
    near(start.x * f, 3.25, 1e-9, 'the dragged axis lands on a round size');
    near((start.y * f) / (start.z * f), start.y / start.z, 1e-12, '...and the other two keep their ratio exactly');
  }
  // a drag that would snap the size to zero must not: that would delete the object visually
  {
    const f = derive(1, 0.05);   // 1 * 0.05 = 0.05, which rounds to 0
    near(f, 0.05, 1e-9, 'a size that would round to zero keeps the unsnapped factor instead');
  }
  // the centre handle has no axis, so the factor is what snaps there
  assert(/if\(_snapOn\(e\)\) f = Math\.max\(0\.02, _snapTo\(f, snapScaleStep\)\);/.test(fn),
    'the all-axes handle snaps the factor, since there is no single size to land');
  assert(/if\(_snapOn\(e\)\) f = Math\.max\(0\.02, _snapTo\(f, snapScaleStep\)\);/.test(extractFunction('applyGroupDrag')),
    '...and so does a group scale, which spreads a cluster rather than resizing one thing');
}

// ---------------------------------------------------------------- rotate: the ANGLE snaps
{
  for (const f of ['gizmoDragMove', 'applyGroupDrag']) {
    const fn = extractFunction(f);
    assert(/ang = _snapTo\(ang, snapAngleDeg \* Math\.PI \/ 180\)/.test(fn), f + ' snaps the angle turned');
    assert(/snapAngleDeg > 0/.test(fn), '...and a zero step turns it off (' + f + ')');
    assert(fn.indexOf('_snapTo(ang') < fn.indexOf('setFromAxisAngle'), 'the snap happens BEFORE the quaternion is built (' + f + ')');
  }
  // the default step has to divide the angles a creator actually wants
  const deg = +src.match(/let snapAngleDeg = ([\d.]+);/)[1];
  for (const target of [90, 180, 270, 360, 45]) eq(target % deg, 0, deg + ' degrees divides ' + target + ' exactly');
}

// ---------------------------------------------------------------- the defaults and the preference
{
  const grid = +src.match(/let snapGrid = ([\d.]+);/)[1];
  const scl = +src.match(/let snapScaleStep = ([\d.]+);/)[1];
  assert(/let gizmoSnap = true;/.test(src), 'snapping is ON by default — an editor whose handles cannot align two objects is not one');
  assert(grid > 0 && grid <= 1, 'the grid is a fraction of a metre (' + grid + '), fine enough to place cover and coarse enough to align it');
  assert(scl > 0 && scl <= 0.5, 'the scale step is fine-grained (' + scl + ')');
  // persisted, and re-read defensively: a corrupt or absent value must not produce NaN in a transform
  assert(/localStorage\.setItem\('breach_gizsnap'/.test(src), 'the toggle persists');
  for (const k of ['breach_gizsnap_g', 'breach_gizsnap_a', 'breach_gizsnap_s'])
    assert(new RegExp("localStorage\\.setItem\\('" + k + "'").test(src), 'the ' + k + ' step persists');
  assert(/if\(isFinite\(g\) && g>=0\) snapGrid=g;/.test(src), 'a stored grid is validated before use');
  assert(/if\(isFinite\(a\) && a>=0\) snapAngleDeg=a;/.test(src), '...and the angle');
  assert(/if\(isFinite\(c\) && c>=0\) snapScaleStep=c;/.test(src), '...and the scale step');
  assert(/catch\(e\)\{\}/.test(src.slice(src.indexOf("localStorage.getItem('breach_gizsnap')"), src.indexOf('function _saveSnapPrefs'))),
    'and a storage-less browser boots with the defaults rather than throwing');
}

// ---------------------------------------------------------------- authorable, and it says what it does
{
  assert(/span\.innerHTML='Snap to grid <b>\(hold Ctrl to invert\)<\/b>';/.test(src),
    'the checkbox states the modifier, because an invisible inverting modifier is a trap');
  assert(/cb\.onchange=\(\)=>\{ gizmoSnap=cb\.checked; _saveSnapPrefs\(\); renderEditorFields\(\); \};/.test(src),
    'toggling it persists and re-renders (the step row dims when off)');
  assert(/steps\.appendChild\(mk\('grid'/.test(src) && /mk\('angle\\u00b0'/.test(src) && /mk\('scale'/.test(src),
    'all three steps are editable');
  assert(/inp\.title='0 turns snapping off for this channel only';/.test(src), '...and 0 is documented as per-channel off');
  assert(/display:flex;flex-wrap:wrap/.test(src),
    'the row wraps: three labelled numbers do not fit the 342px inspector, and the third was clipped in the capture');
  assert(/inp\.onchange=\(\)=>\{ const v=parseFloat\(inp\.value\); if\(isFinite\(v\) && v>=0\)\{ set\(v\); _saveSnapPrefs\(\); \} inp\.value=String\(get\(\)\); \}/.test(src),
    'a junk entry is rejected and the field snaps back to the live value rather than silently keeping it');
}
{
  // build 929's placement snap is a separate feature and must not have been folded into this
  assert(/if\(buildSnap\)\{/.test(src), 'block-placement snapping still exists');
  assert(/ONE GLOBAL WORLD LATTICE \(cell = the ghost's own size\)/.test(src), '...with its own lattice, unchanged');
}

done('build 1146: the gizmo snaps — position to the lattice, a group by its delta, size to round numbers, rotation to 15 degrees, and Ctrl inverts');
