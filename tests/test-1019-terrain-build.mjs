// (build 1019) BUILD MODE ON HILLY TERRAIN — the author's field diagnosis, confirmed and fixed.
// Two stacked bugs, invisible on flat levels (terrain height 0 everywhere — why the harness
// never reproduced it):
//  1) the ground mesh is NOT in `colliders`, so the build-ghost aim ray sailed through the
//     landscape and fell back to a FIXED 6m column — floating over valleys, buried behind
//     crests. The ray is now marched against the heightfield (0.35m steps to 18m) and the
//     NEARER of collider-hit vs terrain-hit wins; lattice snapping re-samples the ground at
//     the snapped cell.
//  2) finalizeProp treats t[1] as TERRAIN-RELATIVE (build 893) and re-adds the ground height —
//     deployProp passed the ghost's ABSOLUTE y, so terrain applied twice: floating on peaks,
//     buried in valleys. Aimed placements now pin the prop to the ghost's exact world y after
//     the lift. (Verified E2E in the browser: prop y == ghost y == ground, up- and downhill.)
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const bt = extractFunction('_buildModeTick', src);

// ---- the heightfield march ----
assert(/if\(typeof terrainHeightAt==='function' && _bmDir\.y<0\.35\)\{/.test(bt), 'marches only when the aim can reach ground (not the sky)');
assert(/const step=0\.35, RANGE=18;/.test(bt) && /if\(y<=terrainHeightAt\(x,z\)\)\{ terra=\{ x, z, dist:pt \}; break; \}/.test(bt),
  'steps the aim ray until it crosses under the heightfield');
assert(/if\(hits\.length && \(!terra \|\| hits\[0\]\.distance <= terra\.dist\)\)\{/.test(bt),
  'the NEARER surface wins — a wall in front of the hill still takes the hit');
assert(/const ty=terrainHeightAt\(px,pz\);   \/\/ re-sample at the SNAPPED cell/.test(bt),
  'lattice snap re-samples the ground at the snapped cell (the pre-snap height was the wrong column)');
assert(/g\.position\.set\(px, ty - b\.foot \+ 0\.001, pz\); placed=true;/.test(bt),
  'the ghost’s BOTTOM sits on the aimed ground');
// the old 6m fallback survives for sky-aims
assert(/const d=6; let px=_bmPos\.x\+_bmDir\.x\*d/.test(bt), 'the fixed-distance fallback remains for aims that hit nothing');

// ---- executable: the march finds the crossing on a slope ----
const marchSrc = bt.match(/let terra=null;[\s\S]*?\n  \}\n  let placed=false;/)[0];
const march = new Function('terrainHeightAt', '_bmPos', '_bmDir',
  marchSrc.replace(/\n  \}\n  let placed=false;$/, '\n  }\nreturn terra;'));
const slope = (x, z) => x * 0.15;                       // rises east
{
  const t = march(slope, { x:0, y:1.7, z:0 }, { x:-1, y:-0.35, z:0 });   // aim WEST, downhill
  assert(t, 'downhill aim lands on the terrain');
  const groundY = slope(t.x, t.z), rayY = 1.7 + (-0.35) * t.dist;
  assert(rayY <= groundY + 0.01 && rayY >= groundY - 0.6, 'the crossing is at the surface (within one step of exact)');
}
{
  const t = march(slope, { x:0, y:1.7, z:0 }, { x:1, y:-0.05, z:0 });   // aim EAST into the rising hill
  assert(t && t.x > 0 && t.x < 12, 'an uphill aim stops at the hill face instead of tunnelling through');
}
eq(march(slope, { x:0, y:1.7, z:0 }, { x:0, y:0.6, z:0.8 }), null, 'aiming at the sky never fabricates ground');

// ---- the double-lift fix ----
const dp = extractFunction('deployProp', src);
assert(/if\(at\)\{ obj\.position\.y = at\.y; if\(typeof refreshPropCollider==='function'\) refreshPropCollider\(obj\); \}/.test(dp),
  'aimed placements pin the prop to the ghost’s ABSOLUTE y after finalizeProp’s terrain-relative lift (no double-apply)');
assert(/const py = at \? at\.y : 1\.1;/.test(dp),
  'quick-deploy y stays terrain-RELATIVE (finalizeProp re-adds the ground) — no double-lift there either');
assert(/obj\.position\.y = t\[1\] \+ _maxTerrainOver\(t\[0\], t\[2\], obj\.userData\.footR\);/.test(src),
  'the build-893 terrain-relative convention itself is untouched (level loads still depend on it)');

done('build 1019: build mode works on hilly terrain — heightfield-marched ghost, absolute-y placement');
