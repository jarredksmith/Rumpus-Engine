import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1088, user-reported twice over:
//   "it maxes at 60 now, and I need to go much higher"
//   "ERROR: Promise: Cannot access '_downOrigin' before initialization"
// The second one is the serious half — build 1087 could not boot a level that had enemy spawns saved.

// ---------------------------------------------------------------- 1. the boot crash
// Saved markers are rebuilt during module evaluation, at the point buildSpawnMarker is defined — thousands
// of lines ABOVE where the surface probe's scratch vectors are declared. Both terrainHeightAt and
// surfaceTopUnder are hoisted function DECLARATIONS, so `typeof x === 'function'` happily returns true and
// the call then throws a TDZ error on _downOrigin. That killed the whole boot.
const rsy = extractFunction('refreshSpawnMarkerY');
assert(/let terr=0; try\{ if\(typeof terrainHeightAt==='function'\) terr=terrainHeightAt\(gx,gz\); \}catch\(e\)\{\}/.test(rsy),
  'the terrain read is wrapped, and falls back to 0');
assert(/try\{ if\(typeof surfaceTopUnder==='function'\) surf=surfaceTopUnder\(gx, gz, gy\+0\.01, gy\+50\); \}catch\(e\)\{ surf=-Infinity; \}/.test(rsy),
  'the surface probe is wrapped, and falls back to "nothing found"');
// a typeof guard is NOT enough on its own here, and the comment has to say why so nobody "tidies" it away
assert(/hoisted function\s*\n?\s*\/\/ declarations/.test(rsy) || /hoisted function/.test(rsy),
  'and the reason is written down next to it');
// the marker is built before the probe exists, so the aids must be re-derived when they first become visible
assert(/function setSpawnMarkersVisible\(v\)\{ for\(const g of spawnMarkers\)\{ g\.visible = v; if\(v\) refreshSpawnMarkerY\(g\);/.test(src),
  'showing the markers re-runs the height + aids, which boot could not compute');
// run it in the exact broken condition: both helpers throw
{
  const g = { position: { x: 0, y: -1, z: 0 }, userData: { mark: { y: 12 },
    dropLine: { visible: true, scale: { set(){} }, position: { y: 0 } },
    shadow: { visible: true, position: { y: 0 } } } };
  const fn = new Function('terrainHeightAt','surfaceTopUnder','refreshRouteViz',
    `${rsy}\nreturn refreshSpawnMarkerY;`)(
      () => { throw new ReferenceError("Cannot access '_downOrigin' before initialization"); },
      () => { throw new ReferenceError("Cannot access '_downOrigin' before initialization"); },
      () => {});
  fn(g);   // must not throw — this is the reported crash
  eq(g.position.y, 12, 'with both probes throwing, the marker still lands at its authored height');
  // the aids fall back to the same assumed ground (0) the position itself used, so they stay self-consistent
  // rather than being skipped. It is invisible either way: markers are hidden at boot, and
  // setSpawnMarkersVisible() recomputes everything the moment they are shown.
  eq(g.userData.shadow.position.y, -12 + 0.04, '...and the aids fall back to the same assumed ground the position did');
}
{ // and once the probes work, the aids come back
  const g = { position: { x: 0, y: -1, z: 0 }, userData: { mark: { y: 16 },
    dropLine: { visible: false, scale: { set(){} }, position: { y: 0 } },
    shadow: { visible: false, position: { y: 0 } } } };
  const fn = new Function('terrainHeightAt','surfaceTopUnder','refreshRouteViz',
    `${rsy}\nreturn refreshSpawnMarkerY;`)(() => 0, () => 12, () => {});
  fn(g);
  eq(g.position.y, 16, 'a working probe places the marker the same way');
  eq(g.userData.dropLine.visible, true, '...and draws the aids');
  eq(g.userData.shadow.position.y, -4 + 0.04, '...measuring the 4 units down to the roof');
}

// ---------------------------------------------------------------- 2. the ceiling
assert(/const SPAWN_MAX_Y = 1000;/.test(src), 'the height ceiling is 1000 (was 60)');
assert(/const SPAWN_SLIDER_Y = 120;/.test(src), '...with a separate, shorter DRAG range');
// the clamp is the only real limit, because the field renderer lets typed numbers exceed the slider
assert(/tgt\.state\[fld\.k\] = v;\s*\/\/ typed numbers can exceed slider min\/max/.test(src),
  'sanity: the number box is deliberately unclamped by the renderer, so SPAWN_MAX_Y is what actually binds');
{
  const clamp = (v) => Math.max(0, Math.min(1000, +v || 0));
  eq(clamp(240), 240, 'a 240-high spawn is kept');
  eq(clamp(999), 999, '...and a 999');
  eq(clamp(5000), 1000, 'a silly value clamps to the new ceiling, not the old 60');
  eq(clamp(-3), 0, 'and below ground still clamps to 0');
}
// every place that clamps must use the constant, or one of them silently keeps the old limit
eq((src.match(/Math\.min\(SPAWN_MAX_Y,/g) || []).length, 3,
  'all three clamps (build, gizmo drag, inspector apply) share the one constant');

// ---------------------------------------------------------------- 3. the probe reaches up there
// Raising the ceiling alone would have been a lie: the probe ray starts at y=300, so a marker at 600 could
// never find the roof under it and the height would silently stop snapping to anything.
const stu = extractFunction('surfaceTopUnder');
assert(/function surfaceTopUnder\(x, z, ceilY, fromY\)/.test(stu), 'the probe takes an optional start height');
assert(/const _from = \(fromY!=null && fromY>300\) \? fromY : 300;/.test(stu),
  '...defaulting to the original 300, so every existing caller is unchanged');
assert(/_downRay\.far = Math\.max\(600, _from\*2\)/.test(stu),
  '...and the ray is lengthened with it, or starting higher would just miss the ground instead');
{
  // run it against a world with a roof at 500: from the old 300 start the ray begins BELOW the roof and
  // cannot see it; given a start above it, it does.
  const mk = (fromDefault) => {
    let seen = null;
    const fn = new Function('_downOrigin','_downRay','_downDir','_surfCull','dynamicProps','heldProp',
      `${stu}\nreturn surfaceTopUnder;`)(
        { set(x, y, z) { seen = { x, y, z }; } },
        { set(){}, far: 0, intersectObjects(){ return (seen.y >= 500) ? [{ point: { y: 500 } }] : []; } },
        {}, () => [], [], null);
    return fn;
  };
  eq(mk()(0, 0, 1000), -Infinity, 'a roof at 500 is invisible to the default probe, which starts at 300');
  eq(mk()(0, 0, 1000, 600), 500, '...and visible once the probe starts at 600');
  eq(mk()(0, 0, 400, 600), -Infinity, '...while the ceiling still excludes it when asked to');
}
// the far distance has to cover the whole drop, or a high start would sail past the ground
{
  const far = (from) => Math.max(600, (from > 300 ? from : 300) * 2);
  assert(far(950) >= 950, 'from 950 up, the ray is long enough to reach the ground (' + far(950) + ')');
  assert(far(1000) >= 1000, '...and from the very top of the range (' + far(1000) + ')');
  eq(far(10), 600, 'and a low start keeps the original 600');
}
assert(/surfaceTopUnder\(x, z, wantY \+ 1\.2, wantY \+ 50\)/.test(extractFunction('_spawnFloorNear')),
  'the spawn lookup starts its probe 50 above the authored height');
assert(/surfaceTopUnder\(gx, gz, gy\+0\.01, gy\+50\)/.test(rsy), '...and so does the drop line');
// the drop line also got more correct: it asks for the highest surface AT OR BELOW the marker rather than
// taking the highest overall and discarding it, which used to fall all the way back to terrain whenever
// anything taller stood in the same column.
assert(!/surfaceTopAt\(gx,gz\)/.test(rsy), 'the drop line no longer takes the highest surface and then rejects it');
{
  const g = { position: { x: 0, y: -1, z: 0 }, userData: { mark: { y: 16 },
    dropLine: { visible: false, scale: { set(){} }, position: { y: 0 } },
    shadow: { visible: false, position: { y: 0 } } } };
  // a 40-high tower stands in the same column as a 12-high roof; the marker sits at 16
  const fn = new Function('terrainHeightAt','surfaceTopUnder','refreshRouteViz',
    `${rsy}\nreturn refreshSpawnMarkerY;`)(() => 0, (x, z, ceil) => (ceil > 12 ? 12 : -Infinity), () => {});
  fn(g);
  eq(g.userData.shadow.position.y, -4 + 0.04,
    'with a taller tower alongside, the aids still measure to the 12-high roof it will land on, not to the ground');
}

// ---------------------------------------------------------------- 4. the slider still drags
const tgt = src.match(/spawns: \{[\s\S]*?code\(\)\{ return '\/\/ ===== Enemy spawns/);
assert(/max:SPAWN_SLIDER_Y/.test(tgt[0]), 'the Height track is the short range by default');
assert(/const hf=this\.fields\.find\(f=>f\.k==='py'\);\s*\n\s*if\(hf\) hf\.max=Math\.max\(SPAWN_SLIDER_Y, Math\.ceil\(this\.state\.py\*1\.25\)\);/.test(tgt[0]),
  '...but grows to fit a taller value on sync');
{
  const grow = (py) => Math.max(120, Math.ceil(py * 1.25));
  eq(grow(0), 120, 'a ground-level spawn gets the normal 0-120 track');
  eq(grow(90), 120, '...and so does anything inside it');
  eq(grow(400), 500, 'a 400-high spawn grows the track past itself');
  eq(grow(1000), 1250, '...and the very top of the range still has headroom to drag into');
  assert(grow(400) > 400, 'crucially the track always exceeds the value — otherwise nudging the slider would snap it down');
}

done('build 1088: spawn heights reach 1000, the surface probe reaches with them, and saved spawns boot again');
