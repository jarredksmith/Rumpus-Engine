// (build 830) BANKED CURVES + BARRIER WALLS for the track builder.
//  - track_bank_l / track_bank_r: 90° curves with 15° camber. The cross-section ROLL eases in/out on a
//    smoothstep so a banked piece is FLUSH with flat neighbours at both sockets; dir signs it so the OUTSIDE
//    edge of the turn is raised. The exit socket is identical to the flat 90° curve (chains stay exact).
//  - trackApply(obj, {w:1}): barrier walls on any placed piece — concrete base (1.1 m) + clear catch-screen
//    (to 3 m: solid at car body height even for long vehicles, so _carWall reads it as a wall and deflects).
//    Serialized as trk:1 in propEntry and reapplied by ALL THREE loaders (boot / net / undo-restore).
//  - Editor: a Barrier-walls checkbox for the selected piece + a whole-track apply/remove button.
import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();

// --- the two banked pieces exist, registered as primitives ---
for(const k of ['track_bank_l','track_bank_r'])
  assert(new RegExp(k+":\\(\\)=>_buildTrackPiece\\('"+k+"'\\)").test(src), k+' is registered in PRIMITIVE_BUILDERS');
assert(/track_bank_l:\s*\{ label:'Bank L', arc:Math\.PI\/2, dir:1,\s*bank:0\.26,/.test(src), 'Bank L: 90° left with 15° camber');
assert(/track_bank_r:\s*\{ label:'Bank R', arc:Math\.PI\/2, dir:-1, bank:0\.26,/.test(src), 'Bank R: mirrored');

// --- run the real centreline + exit math ---
const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
const mod=new Function('"use strict";'+src.slice(defsStart, defsEnd)+'\n'+extractFunction('_trackExitPose')+'\nreturn { TRACK_PIECES, TRACK_R, _trackCL, _trackExitPose };')();
const { TRACK_PIECES, _trackCL, _trackExitPose }=mod;

// 1. bank envelope: flush at both sockets, full camber mid-arc, mirrored right
{
  const bl=TRACK_PIECES.track_bank_l;
  near(_trackCL(bl,0).roll, 0, 1e-9, 'banked entry is FLAT (flush with the previous piece)');
  near(_trackCL(bl,1).roll, 0, 1e-9, 'banked exit is FLAT (flush with the next piece)');
  near(_trackCL(bl,0.5).roll, 0.26, 1e-9, 'full 15° camber through the apex');
  near(_trackCL(TRACK_PIECES.track_bank_r,0.5).roll, -0.26, 1e-9, 'right bank mirrors (outside edge raised on the other side)');
}
// 2. roll raises the OUTSIDE of the turn: left turn (dir +1) -> +lat (right/outer) edge higher
{
  const c=_trackCL(TRACK_PIECES.track_bank_l, 0.5), lat=5;
  const yOuter=c.y + lat*Math.sin(c.roll), yInner=c.y - lat*Math.sin(c.roll);
  assert(yOuter > yInner, 'the outer edge of a left banked curve is the raised one');
}
// 3. the banked exit socket equals the flat 90° curve's socket — chains stay exact through banked sections
{
  const pose=(k)=>_trackExitPose({ position:{x:0,y:0,z:0}, rotation:{y:0}, scale:{x:1,y:1,z:1}, userData:{src:k} });
  const f=pose('track_curve_l'), b=pose('track_bank_l');
  near(b.x,f.x,1e-9,'banked exit x == flat curve exit x'); near(b.z,f.z,1e-9,'z matches'); near(b.yaw,f.yaw,1e-9,'yaw matches');
}

// --- barrier walls: trackApply builds/removes tagged wall meshes and refreshes the collider box ---
const ta = extractFunction('trackApply');
assert(/o\.userData\.trk = on \? \{ w:1 \} : null;/.test(ta), 'the walls flag lives on userData.trk');
assert(/if\(ch\.userData && ch\.userData\._trkWall\)\{ o\.remove\(ch\); if\(ch\.geometry\) ch\.geometry\.dispose\(\); \}/.test(ta), 'old wall meshes are removed + disposed on toggle');
assert(/TRACK_T, TRACK_T\+1\.1, segs, 0\), M\.barrier\)/.test(ta), 'concrete base wall to 1.1 m');
assert(/TRACK_T\+1\.1, TRACK_T\+3\.0, segs, 0\), M\.screen\)/.test(ta), 'clear catch-screen to 3 m (solid at car body height for long vehicles)');
assert(/refreshPropCollider\(o\);/.test(ta), 'the prop collider box is refreshed after toggling walls');

// --- persistence: serialized once, applied by all three loaders ---
assert(/if\(o\.userData\.trk && o\.userData\.trk\.w\) e\.trk=1;/.test(src), 'propEntry serializes the walls flag');
{
  const m=src.match(/if\(p\.trk\) trackApply\(obj, \{w:1\}\);/g);
  assert(m && m.length===3, 'all three loaders (boot / net / restore) reapply walls (found '+(m?m.length:0)+')');
}

// --- editor UI: per-piece checkbox + whole-track button ---
assert(/<b>Barrier walls<\/b> \(selected piece\)/.test(src), 'selected-piece walls checkbox');
assert(/anyOff\?'Walls: whole track':'Walls: remove all'/.test(src), 'one-click walls for the whole course');
assert(/for\(const p of _allTrk\) trackApply\(p, \{w:anyOff\}\);/.test(src), 'the whole-track button applies to every piece');

done('build 830: banked curves (15°, flush sockets, exact chains) + serialized barrier walls with editor toggles');
