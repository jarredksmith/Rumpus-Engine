// (build 828) RACE TRACK BUILDER — snap-together track pieces (straight/short, 45°/90° curves L+R, ramps, start
// line) laid out from the editor's Build tab. Architecture: each piece is a normal PROP whose src key lives in
// PRIMITIVE_BUILDERS, so save/load/undo/share-links/multiplayer and the gizmo all work with zero new plumbing —
// and because the keys are NOT in SHAPE_PRIMS, addStaticColliderFor builds a TRIMESH of the real triangles
// (curve arcs + ramp slopes are true physics geometry). addTrackPiece snaps each new piece onto the exit socket
// of the selected track piece (or the last one placed) and auto-selects it so clicks keep chaining.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// --- registration: real primitives, but NOT shape-primitives (=> trimesh colliders) ---
for(const k of ['track_start','track_straight','track_short','track_curve45_l','track_curve45_r','track_curve_l','track_curve_r','track_ramp_up','track_ramp_dn'])
  assert(new RegExp(k+":\\(\\)=>_buildTrackPiece\\('"+k+"'\\)").test(src), k+' is registered in PRIMITIVE_BUILDERS');
assert(/const SHAPE_PRIMS = \{ box:1, sphere:1, cylinder:1, cone:1 \};/.test(src), 'track pieces are NOT shape-prims — they take the trimesh collider path');

// --- extract the piece table + exit math and RUN it ---
const defsStart = src.indexOf('const TRACK_W = 12');
const defsEnd = src.indexOf('function _trackCL');
assert(defsStart > 0 && defsEnd > defsStart, 'track constants + piece table found');
const ep = extractFunction('_trackExitPose');
const mod = new Function('"use strict";' + src.slice(defsStart, defsEnd) + '\n' + ep + '\nreturn { TRACK_PIECES, TRACK_R, TRACK_W, _trackExitPose };')();
const { TRACK_PIECES, TRACK_R, _trackExitPose } = mod;

// chain composer: place piece 1 at the origin facing -Z, then snap each next piece to the previous exit
const chain=(keys, scale)=>{ scale=scale||{x:1,y:1,z:1};
  let pose={x:0,y:0,z:0,yaw:0};
  for(const k of keys){
    const o={ position:{x:pose.x,y:pose.y,z:pose.z}, rotation:{y:pose.yaw}, scale, userData:{src:k} };
    pose=_trackExitPose(o);
  }
  return pose;
};

// 1. a straight advances 24 m along -Z, heading unchanged
{ const p=chain(['track_straight']); near(p.x,0,1e-9,'straight: no lateral drift'); near(p.z,-24,1e-9,'straight: 24 m along -Z'); near(p.yaw,0,1e-9,'straight: heading unchanged'); }

// 2. four 90° lefts close a perfect circle — the snap math is exact, not drifting
{ const p=chain(['track_curve_l','track_curve_l','track_curve_l','track_curve_l']);
  near(p.x,0,1e-9,'4x90L returns to the start x'); near(p.z,0,1e-9,'4x90L returns to the start z'); near(p.yaw,Math.PI*2,1e-9,'4x90L = one full turn'); }

// 3. a classic oval closes: straight, two lefts, straight, two lefts
{ const p=chain(['track_straight','track_curve_l','track_curve_l','track_straight','track_curve_l','track_curve_l']);
  near(p.x,0,1e-9,'oval closes in x'); near(p.z,0,1e-9,'oval closes in z'); }

// 4. two 45° lefts equal one 90° left (piece granularity composes)
{ const a=chain(['track_curve45_l','track_curve45_l']), b=chain(['track_curve_l']);
  near(a.x,b.x,1e-9,'2x45L == 90L (x)'); near(a.z,b.z,1e-9,'2x45L == 90L (z)'); near(a.yaw,b.yaw,1e-9,'2x45L == 90L (yaw)'); }

// 5. right curves mirror left ones
{ const l=chain(['track_curve_l']), r=chain(['track_curve_r']);
  near(l.x,-TRACK_R,1e-9,'90L swings left'); near(r.x,TRACK_R,1e-9,'90R swings right'); near(r.yaw,-l.yaw,1e-9,'mirrored yaw'); }

// 6. ramps move the chain vertically — and up+down cancels back to ground level
{ const up=chain(['track_ramp_up']); near(up.y,6,1e-9,'ramp up exits 6 m higher');
  const flat=chain(['track_ramp_up','track_straight','track_ramp_dn']); near(flat.y,0,1e-9,'up + straight + down lands back at ground'); }

// 7. scale is honored: a stretched chain keeps snapping (double-length straight, double-height ramp)
{ const p=chain(['track_straight'],{x:2,y:2,z:2}); near(p.z,-48,1e-9,'scaled straight advances scale.z * 24');
  const u=chain(['track_ramp_up'],{x:2,y:2,z:2}); near(u.y,12,1e-9,'scaled ramp rises scale.y * 6'); }

// --- placement: snap to the SELECTED track piece, else the last placed; inherit anchor scale; auto-select ---
const at = extractFunction('addTrackPiece');
assert(/if\(selO && selO\.userData && TRACK_PIECES\[selO\.userData\.src\]\) anchor=selO;/.test(at), 'the selected track piece anchors the snap (branch from anywhere)');
assert(/for\(let i=propModels\.length-1;i>=0;i--\)\{ const p=propModels\[i\]; if\(p && p\.userData && TRACK_PIECES\[p\.userData\.src\]\)\{ anchor=p; break; \} \}/.test(at), 'falls back to the last track piece placed');
assert(/sx=anchor\.scale\.x; sy=anchor\.scale\.y; sz=anchor\.scale\.z;/.test(at), 'the new piece inherits the anchor scale (stretched chains keep chaining)');
assert(/editorActive='props'; editorTargets\.props\.idx=propModels\.indexOf\(obj\); selProps=\[obj\];/.test(at), 'the new piece is auto-selected so the chain continues');
assert(/pushUndoSnapshot\(\);/.test(at), 'placing a piece is undoable');

// --- geometry: ramps rise on a smoothstep (level at both ends — no lip), curves sweep TRACK_R arcs ---
const cl = extractFunction('_trackCL');
assert(/def\.rise\*\(3\*t\*t - 2\*t\*t\*t\)/.test(cl), 'ramp centreline is a smoothstep (level entry + crest)');
assert(/x:-def\.dir\*R\*\(1-Math\.cos\(a\)\), z:-R\*Math\.sin\(a\)/.test(cl), 'curve centreline is a true circular arc');

// --- UI: the Track builder palette renders in the Build tab's shape host ---
assert(/<b>Track builder<\/b>/.test(src), 'the Track builder block exists');
assert(/b\.onclick=\(\)=>\{ addTrackPiece\(tk\); \};/.test(src), 'palette buttons place snapped pieces');

done('build 828: race track builder — snap-chained pieces (exact closed loops), trimesh colliders, editor palette');
