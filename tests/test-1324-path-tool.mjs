import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1324 — editor audit 4.10, second leg. Build 1323 closed the room; this is the PATH: a fence, kerb
// or catwalk following a curve, and — the user's own case — power cables and telephone wires strung between
// poles. Same machinery, two differences that matter: a wire SAGS, and a wire must not be SOLID.
//
// Live results (tools/probe/path-tool.mjs), two poles 20 m apart with 6 m tops:
//   anchors (290, 6.20, 300) -> (310, 6.20, 300), 10 segments, one group
//   highest 6.20, lowest 5.00 — exactly the 1.2 m sag setting below the chord
//   the last segment's drawn far end lands on the second pole to 0.0000 m
//   wire: noCol set, collider boxes 0 (a pole beside it has 1), insideSolid false
//   after save/load: 10/10 carry `nc`, 10/10 come back noCol with ZERO collider boxes
//   rail over a 3-point curve: 20 segments, worst tilt from upright 0.00 deg, all solid

const rig = new Function(
  src.match(/const PATH_MAX_PTS = [^\n]*\n/)[0] + src.match(/const PATH_MAX_SEG = [^\n]*\n/)[0] +
  src.match(/const WIRE_SEG_DEFAULT = [^\n]*\n/)[0] +
  extractFunction('_crAxis') + '\n' + extractFunction('pathSample') + '\n' +
  extractFunction('wireSpan') + '\n' + extractFunction('pathSegments') +
  '; return { pathSample, wireSpan, pathSegments, PATH_MAX_SEG, PATH_MAX_PTS };')();
const { pathSample, wireSpan, pathSegments, PATH_MAX_SEG, PATH_MAX_PTS } = rig;

// ---------------------------------------------------------------- the wire hangs, and it hangs correctly
{
  const a = [0, 10, 0], b = [20, 10, 0];
  const sp = wireSpan(a, b, 1.2, 10);
  eq(sp.length, 11, '10 segments is 11 points');
  // ANCHORING is the property that matters most: a wire that misses its pole is simply wrong
  near(sp[0][0], 0, 1e-9); near(sp[0][1], 10, 1e-9); near(sp[0][2], 0, 1e-9);
  near(sp[10][0], 20, 1e-9); near(sp[10][1], 10, 1e-9, 'both ends land EXACTLY on their anchors');
  // and the droop is the number the creator typed, at midspan
  const mid = sp[5];
  near(mid[1], 10 - 1.2, 1e-9, 'midspan hangs exactly `sag` below the chord');
  near(mid[0], 10, 1e-9, '...without wandering off the line');
  // monotonic down then up — no kinks
  let down = true, turned = 0;
  for(let i=1;i<sp.length;i++){ const d = sp[i][1] < sp[i-1][1]; if(d !== down){ turned++; down = d; } }
  eq(turned, 1, 'the curve falls then rises exactly once — no kinks');
}
{ // an UNEVEN span still anchors at both ends
  const sp = wireSpan([0, 12, 0], [30, 4, 5], 2, 12);
  near(sp[0][1], 12, 1e-9); near(sp[12][1], 4, 1e-9, 'a sloping span still meets both poles');
  near(sp[12][2], 5, 1e-9, '...in all three axes');
  const chordMid = (12 + 4) / 2;
  near(sp[6][1], chordMid - 2, 1e-9, 'and droops from the CHORD, not from the horizontal');
}
{ // degenerate input cannot produce NaN or a runaway
  /* A span from a pole to ITSELF droops straight down and climbs back if you let the sag term apply —
     worse than a no-op, and one shift-click away. It returns a single point, so nothing is emitted. */
  const z = wireSpan([0,0,0], [0,0,0], 5, 10);
  eq(z.length, 1, 'a zero-length span collapses to one point…');
  eq(pathSegments(z).length, 0, '…and emits no segments at all');
  assert(wireSpan([0,0,0],[1,0,0], -5, 10).every(p=>p[1] <= 1e-9), 'negative sag is clamped, not inverted');
  assert(wireSpan([0,0,0],[1,0,0], 1e9, 10).every(p=>isFinite(p[1])), 'and an absurd sag is clamped');
  eq(wireSpan([0,0,0],[1,0,0], 1, 1e9).length, 49, 'segment count is capped at 48 per span');
}

// ---------------------------------------------------------------- the smooth path
{
  const pts = [[0,0,0],[10,0,10],[20,0,0],[30,0,10]];
  const straight = pathSample(pts, false, false, 8);
  eq(straight.length, 4, 'unsmoothed is the points themselves');
  const smooth = pathSample(pts, false, true, 8);
  assert(smooth.length > 20, 'smoothed is denser');
  near(smooth[0][0], 0, 1e-9); near(smooth[0][2], 0, 1e-9, 'and starts on the first point');
  const last = smooth[smooth.length-1];
  near(last[0], 30, 1e-9); near(last[2], 10, 1e-9, '...and ENDS on the last one, which a naive Catmull-Rom drops');
  // continuity: no sample may jump further than the coarsest span
  let worst = 0;
  for(let i=1;i<smooth.length;i++) worst = Math.max(worst, Math.hypot(smooth[i][0]-smooth[i-1][0], smooth[i][2]-smooth[i-1][2]));
  assert(worst < 4, `the curve is continuous (worst step ${worst.toFixed(2)} m)`);
  // a closed loop returns to the start
  const loop = pathSample(pts, true, false, 8);
  eq(loop.length, 5, 'a closed loop appends the first point');
  eq(loop[4].join(','), loop[0].join(','), '...exactly');
}
{ // the caps are real, because a path is the one tool here that turns two numbers into hundreds of props
  const many = [];
  for(let i=0;i<500;i++) many.push([i, 0, 0]);
  eq(pathSample(many, false, false, 8).length, PATH_MAX_PTS, 'more control points than PATH_MAX_PTS are dropped');
  const long = [];
  for(let i=0;i<2000;i++) long.push([i, 0, 0]);
  eq(pathSegments(long).length, PATH_MAX_SEG, 'and the segment list is hard-capped');
  assert(/a typo must not make 10,000 boxes/.test(src), 'with the reason stated');
}
{ // segments carry a UNIT direction and drop zero-length runs
  const segs = pathSegments([[0,0,0],[3,4,0],[3,4,0],[3,4,12]]);
  eq(segs.length, 2, 'the duplicated point emits nothing');
  near(segs[0].len, 5, 1e-9, 'length is the real 3-D distance');
  near(Math.hypot(segs[0].dx, segs[0].dy, segs[0].dz), 1, 1e-9, 'direction is a unit vector');
  near(segs[0].cx, 1.5, 1e-9); near(segs[0].cy, 2, 1e-9, 'and the centre is the midpoint');
}

// ---------------------------------------------------------------- orientation goes through a quaternion
{
  const y = extractFunction('_pathEulerAlongY'), up = extractFunction('_pathEulerUpright');
  assert(/_pthQ\.setFromUnitVectors\(_pthUP, _pthF\)/.test(y), 'a wire maps local +Y (a cylinder’s length) to the segment');
  assert(/_pthE\.setFromQuaternion\(_pthQ\)/.test(y) && /_pthE\.setFromQuaternion\(_pthQ\)/.test(up),
    'and BOTH go quaternion -> Euler rather than hand-built angles');
  assert(/three's Euler order is a real trap here, and `setFromQuaternion` cannot get it\n\/\/ wrong the way I would/.test(src),
    'with the reason — Euler order is the trap, and three’s own conversion cannot get it wrong');
  assert(/_pthM\.makeBasis\(_pthR, _pthU, _pthF\)/.test(up), 'a rail is built from an explicit basis…');
  assert(/if\(_pthR\.lengthSq\(\) < 1e-8\) _pthR\.set\(1,0,0\);/.test(up), '…with the dead-vertical case handled');
  assert(/would silently twist on the first sloped segment/.test(src), 'and the failure it avoids named');
}

// ---------------------------------------------------------------- the path comes from the SELECTION
{
  const anch = extractFunction('pathAnchors');
  assert(/selProps/.test(anch), 'the path is the current selection…');
  assert(/o\.userData\.box\) \? o\.userData\.box\.max\.y : o\.position\.y/.test(anch),
    '…and a wire leaves each prop at its TOP, which is where a cable leaves a pole');
  assert(/in the order you selected them/.test(src), 'order is the selection order, and the panel says so');
  assert(/A click-to-place point mode would be a whole input\n\/\/ system/.test(src), 'with the alternative considered');
  const panel = extractFunction('renderPathPanel');
  assert(/Select 2 or more props first/.test(panel), 'fewer than two props disables the button rather than failing silently');
  assert(/' props \(' \+ preview \+ ' segments\)'/.test(panel),
    'and the button states the prop count BEFORE you press it');
  assert(/finding that out by pressing the button is not a\n       reasonable way to learn it/.test(panel), '...with the reason');
}

// ---------------------------------------------------------------- a wire is decoration; the flag is real
{
  const rp = extractFunction('refreshPropCollider');
  assert(/if\(obj\.userData\.noCol\)\{\n    obj\.userData\.boxes = \[\];/.test(rp), 'noCol emits no collider boxes…');
  assert(/obj\.traverse\(o=>\{ if\(o\.isMesh\) o\.raycast = _ncNoRay; \}\);   \/\/ and no bullet hits either/.test(rp),
    '…and no bullet hits either');
  // THE bug this build hit, recorded so the next opt-out is not written the same way
  assert(/IT MUST RETURN HERE, not skip meshes inside the loop below/.test(rp), 'it returns EARLY…');
  assert(/is build 1148's FAIL-SOLID\n     fallback, so an empty list silently became one box spanning the whole prop/.test(rp),
    '…because "emit no boxes" was tried and the fail-solid fallback re-solidified it');
  assert(rp.indexOf('if(obj.userData.noCol)') < rp.indexOf('const boxes = [];'), 'so the guard is above the loop');
  assert(/if\(o\.raycast === _ncNoRay\) delete o\.raycast;/.test(rp),
    'and unchecking it gives the raycast back — an own property deleted to expose the prototype, or the checkbox is one-way');
  // it must survive the file, or a wire is solid again after one save
  assert(/if\(o\.userData\.noCol\) e\.nc=1;/.test(src), 'it serializes as `nc`…');
  eq((src.match(/if\(p\.nc\)\{ obj\.userData\.noCol=true;/g) || []).length, 2,
    '…and is applied in BOTH prop-entry paths (build 1280’s _applyPropEntry and _pfSpawnEntry’s deliberate near-copy)');
  // and it is a real, exposed feature rather than an internal for wires
  assert(/nw\.appendChild\(ncb\); nw\.appendChild\(document\.createTextNode\('No collision'\)\);/.test(src),
    'the inspector exposes it beside Interactable');
  assert(/needs an imported model and a 3D package to set it/.test(src),
    'with the reason it is exposed: build 1093’s mesh-name convention is unreachable from the editor');
}

// ---------------------------------------------------------------- the spawner
{
  const b = extractFunction('buildPathFrom');
  assert(/const gid = _newGroupId\(\);/.test(b), 'a run is ONE group');
  assert(/if\(typeof pushUndoSnapshot==='function'\) pushUndoSnapshot\(\);/.test(b), 'and one undo entry');
  assert(/o\.userData\.noCol = true;/.test(b) && /mode==='wire'/.test(b), 'wires are decoration, rails are not');
  assert(/const own = \(typeof _maxTerrainOver==='function'\)/.test(b) && /ay - own/.test(b),
    'and the terrain lift is pre-subtracted, exactly as build 1323’s room does');
  assert(/A cable that rose with\n       the ground under each segment would climb the hill instead of crossing the valley/.test(b),
    'with the failure that would otherwise happen — which for a wire is worse than for a room');
  assert(/wire — a cylinder grows from its origin along local \+Y/.test(b), 'the two primitive origins are stated…');
  assert(/rail — a box is centred in local X and Z and grows UP from its origin/.test(b), '…both of them');
  assert(/the path you selected is the rail's underside/.test(b), 'so a fence from ground markers sits ON the ground');
}

// ---------------------------------------------------------------- reachable
{
  assert(/Wire \/ rail\\u2026', \(\)=>\{ jump\('build','props'\); if\(typeof _edRevealHost==='function'\) _edRevealHost\('edPath'\); \}/.test(src),
    'the + menu reaches it');
  assert(/subfold\('Path \(wires &amp; rails\)', 'o_path', '<div id="edPath"><\/div>', false\)/.test(src), 'and it has its own fold');
}

done('build 1324 (editor audit 4.10, second leg): the path tool — rails and WIRES. The other half of 4.10 is a path, and the user\'s own case for it was power cables and telephone wires. Same machinery as a rail with two differences: a wire SAGS (a parabola, not a catenary — visually identical at level sags, and it cannot fail to converge on a degenerate span) and a wire must not be SOLID. The path comes from the SELECTION in selection order, which needs no new picking code and composes with every selection feature the editor has. The maths is pure and checked here: both ends land exactly on their anchors, midspan hangs exactly the authored sag below the CHORD (not the horizontal), the curve falls and rises exactly once, a smoothed path ends on its last point, and the point and segment caps hold. Orientation goes quaternion -> Euler for both modes because three\'s Euler order is a trap a hand-built yaw/pitch pair would fall into on the first sloped segment. The build also adds a real per-prop `noCol` — serialized as `nc` and exposed beside Interactable, because build 1093\'s nocollide convention keys off a mesh NAME that a primitive never saves. Writing that opt-out as "emit no boxes" was tried and MEASURED WRONG: build 1148\'s fail-solid fallback turned the empty list into one box spanning the whole prop, so the wire was solid after all — it returns early instead, the way build 1250\'s emitter already did. Measured live: 0.0000 m endpoint error, sag exactly 1.2 below the chord, zero collider boxes against a control pole\'s one, the flag surviving save/load 10/10, and a rail over a curve at 0.00 deg of tilt from upright');
