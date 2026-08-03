import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1323 — editor audit 4.10, the last one and the one it called the ceiling:
//
//   "No CSG / room / spline tools; a doorway is four boxes forever. Ten primitives, grid snap, the arena
//    generator. Mitigated but not solved. This is the honest ceiling on hand-built interiors and it is the
//    same ceiling the previous audit found."
//
// A doorway is STILL boxes. It is boxes the creator never places, never measures, and can move by typing a
// number — which is the part that was missing. CSG was the obvious reading and is the wrong tool for this
// engine: build 1148 turns a mesh into a per-column per-slot box grid that every consumer walks, so a
// boolean subtract buys one opaque mesh with MORE collider boxes, no editable parts, no instancing, and a
// doorway you cannot move without re-cutting it.
//
// `roomPieces` is PURE — spec in, box list out, no THREE and no DOM — which is what makes the sweep below
// possible at all. Live results (tools/probe/room-tool.mjs) are quoted where they are the evidence.

const rig = new Function(
  src.match(/const ROOM_MIN = [^\n]*\n/)[0] + src.match(/const ROOM_OPEN_MAX = [^\n]*\n/)[0] +
  src.match(/const ROOM_DOOR_W = [^\n]*\n/)[0] +
  src.match(/const ROOM_WALLS = [^\n]*\n/)[0] + src.match(/const ROOM_EPS = [^\n]*\n/)[0] +
  src.match(/const clampNum = [^\n]*\n/)[0] +
  extractFunction('roomSpec') + '\n' + extractFunction('_roomWallSpans') + '\n' + extractFunction('roomPieces') +
  '; return { roomPieces, roomSpec };')();
const { roomPieces, roomSpec } = rig;

const box = p => ({ x0:p.x-p.sx/2, x1:p.x+p.sx/2, y0:p.y, y1:p.y+p.sy, z0:p.z-p.sz/2, z1:p.z+p.sz/2, role:p.role });
const hits = (a,b,eps=1e-6) =>
  (Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0) > eps) &&
  (Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0) > eps) &&
  (Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0) > eps);

// ---------------------------------------------------------------- the sweep: 3600 configurations
{
  let n = 0, overlaps = 0, intrusions = 0, degenerate = 0;
  for (const w of [1, 2, 5, 8, 20, 60])
  for (const d of [1, 3, 6, 15, 40])
  for (const h of [1.6, 3, 5])
  for (const t of [0.05, 0.3, 1, 4])
  for (const ceiling of [false, true])
  for (const ops of [[], [{wall:'n',at:0,width:1.6,height:2.1}],
                     [{wall:'n',at:-2,width:1.2,height:2},{wall:'n',at:2,width:1.2,height:2}],
                     [{wall:'e',at:0,width:1.4,sill:1,height:1.2}],
                     [{wall:'n',at:0,width:1.6,height:2.1},{wall:'s',at:0,width:1.6,height:2.1},
                      {wall:'w',at:0,width:1.4,sill:1,height:1.2},{wall:'e',at:0,width:1.4,sill:1,height:1.2}]]) {
    const S = roomSpec({ w, d, h, t, ceiling, openings: ops });
    const ps = roomPieces({ w, d, h, t, ceiling, openings: ops }).map(box);
    n++;
    for (let i=0;i<ps.length;i++) for (let j=i+1;j<ps.length;j++) if (hits(ps[i], ps[j])) overlaps++;
    // the INTERIOR is exactly what was asked — nothing may intrude into it
    const IN = { x0:-S.w/2+1e-4, x1:S.w/2-1e-4, y0:1e-4, y1:S.h-1e-4, z0:-S.d/2+1e-4, z1:S.d/2-1e-4 };
    for (const p of ps) { if (hits(p, IN)) intrusions++;
      if (!(p.x1-p.x0 > 1e-9 && p.y1-p.y0 > 1e-9 && p.z1-p.z0 > 1e-9)) degenerate++; }
  }
  eq(n, 3600, 'swept 3600 room configurations');
  eq(overlaps, 0, 'no two pieces EVER overlap — corners meet, they do not double up');
  eq(intrusions, 0, 'and nothing intrudes into the interior: 8 x 6 really is 8 x 6 of floor');
  eq(degenerate, 0, 'no zero-size piece at any thickness');
}

// ---------------------------------------------------------------- a doorway's clear gap is the authored size
{
  for (const [w,d,t,ow,oh] of [[8,6,0.3,2.0,2.1],[8,6,0.3,0.9,2.0],[12,10,1.0,3.0,2.4],[4,4,0.05,1.2,1.9]]) {
    const ps = roomPieces({ w, d, h:3, t, openings:[{wall:'n',at:0,width:ow,height:oh}] }).map(box);
    const z0 = -(d/2+t), z1 = -d/2;
    const solid = (x,y) => ps.some(p => p.x0 < x-1e-9 && p.x1 > x+1e-9 && p.y0 < y && p.y1 > y &&
                                        p.z0 < z1-1e-9 && p.z1 > z0+1e-9);
    let clear = 0; const STEP = 0.001;
    for (let x = -w/2-t; x <= w/2+t; x += STEP) if (!solid(x, Math.min(0.5, oh/2))) clear += STEP;
    assert(Math.abs(clear - ow) < 0.005, `a ${ow} m door is ${ow} m clear (measured ${clear.toFixed(3)}, t=${t})`);
    let head = 0;
    for (let y = 0.01; y < 3; y += STEP) if (solid(0, y)) { head = y; break; }
    assert(Math.abs(head - oh) < 0.005, `and ${oh} m to the head (measured ${head.toFixed(3)})`);
  }
}

// ---------------------------------------------------------------- the walls tile: no holes outside openings
{
  const w=8,d=6,h=3,t=0.3, ops=[{wall:'n',at:-2,width:1.2,height:2},{wall:'n',at:1.5,width:1.6,sill:0.9,height:1.2}];
  const ps = roomPieces({w,d,h,t,openings:ops}).map(box).filter(p=>p.role==='walln');
  const run = w+2*t;
  let holes = 0, open = 0;
  for (let x=-run/2+0.005; x<run/2; x+=0.01) for (let y=0.005; y<h; y+=0.01) {
    const isOpen = ops.some(o => Math.abs(x-o.at) < o.width/2 && y > (o.sill||0) && y < (o.sill||0)+o.height);
    if (isOpen) open++;
    else if (!ps.some(p => p.x0<x && p.x1>x && p.y0<y && p.y1>y)) holes++;
  }
  eq(holes, 0, 'a wall with a door AND a window has no holes outside them');
  assert(open > 0, '...and the openings really are open');
}

// ---------------------------------------------------------------- a window has a sill and a header
{
  const ps = roomPieces({ w:8, d:6, h:3, t:0.3, openings:[{wall:'n',at:0,width:1.4,sill:1,height:1.2}] }).map(box);
  const at = (y) => ps.some(p => p.x0 < -1e-9 && p.x1 > 1e-9 && p.y0 <= y && p.y1 >= y && p.z1 <= -3+1e-9);
  assert(at(0.5), 'window: solid below the sill');
  assert(!at(1.6), 'window: clear through it');
  assert(at(2.6), 'window: solid above the head — a door is a window with no sill, one code path');
}

// ---------------------------------------------------------------- hostile input cannot break the shell
{
  assert(roomPieces({w:-5,d:NaN,h:'x',t:99}).length > 0, 'garbage in still yields a room');
  assert(roomSpec({w:2,d:2,t:99}).t <= 1, 'thickness is capped against the ROOM — a 1 m room cannot have 4 m walls');
  eq(roomSpec({ openings:new Array(50).fill({wall:'n',at:0,width:1}) }).openings.length, 12, 'openings capped at 12');
  const s4 = roomSpec({ w:8, d:6, t:0.3, openings:[{wall:'n',at:999,width:1.6}] });
  assert(Math.abs(s4.openings[0].at) <= (8+0.6)/2 - 0.8 + 1e-9, 'an opening cannot hang off the end of its wall');
  const ps = roomPieces({w:8,d:6,h:3,t:0.3,openings:[{wall:'n',at:0,width:2},{wall:'n',at:0.5,width:2}]});
  assert(ps.every(p=>p.sx>0 && p.sy>0 && p.sz>0), 'two OVERLAPPING openings drop the second rather than emitting a negative-length solid');
  assert(/Two overlapping doorways are\n     an authoring mistake/.test(src), '...with the reason stated');
}

// ---------------------------------------------------------------- a measured default, not a chosen one
{
  assert(/const ROOM_DOOR_W = 2\.0, ROOM_WIN_W = 1\.6, ROOM_TIGHT_W = 1\.8;/.test(src), 'the door width is named');
  assert(/MEASURED, not chosen/.test(src) && /a 1\.6 m doorway is EXACTLY their\n   diameter/.test(src),
    'and derived from the PLAYER: radius 0.8, so 1.6 is zero clearance and the probe could not walk through it');
  assert(/author to the COLLIDER, not to the eye/.test(src), 'the build-1113 lesson, applied here');
  const S = roomSpec({});
  eq(S.w, 8); eq(S.d, 6); eq(S.h, 3); eq(S.t, 0.3);
  assert(S.floor === true, 'floor on by default');
  assert(S.ceiling === false, 'ceiling OFF by default — you have to be able to see into it from above');
  eq(roomPieces({}).length, 5, 'a plain room is floor + 4 walls = 5 props');
  eq(roomPieces({ openings:[{wall:'n',at:0,width:2,height:2.1}] }).length, 7,
    'and one doorway splits its wall into two jambs and a header = 7');
}

// ---------------------------------------------------------------- it is ordinary props, on one pad
{
  const b = extractFunction('buildRoomAt');
  assert(/const gid = _newGroupId\(\);/.test(b) && /o\.userData\.groupId = gid;/.test(b),
    'the room is ONE group, so it moves, duplicates and deletes as one thing');
  assert(/spawnProp\('box',/.test(b), '...built from the same primitive a creator would place by hand');
  assert(/if\(typeof pushUndoSnapshot==='function'\) pushUndoSnapshot\(\);/.test(b), 'one undo entry for the whole room');
  assert(/selProps = made\.slice\(\)/.test(b), 'and it is selected on arrival, so the gizmo is already on it');
  // the terrain fix, which the probe found and is the only non-obvious thing in here
  assert(/const roomLift = \(typeof _maxTerrainOver==='function'\) \? _maxTerrainOver\(cx, cz, 0\.5\*Math\.hypot\(S\.w\+2\*S\.t, S\.d\+2\*S\.t\)\) : 0;/.test(b),
    'ONE lift for the whole room…');
  assert(/pc\.y \+ roomLift - own/.test(b), '…and each piece pre-subtracts the lift finalizeProp will add it');
  assert(/measured 1\.245 m of SHEAR/.test(src), 'with the measurement that made it necessary');
  assert(/It round-trips exactly:/.test(src), 'and the reason it survives a save/load rather than re-shearing');
}

// ---------------------------------------------------------------- reachable, and honest about it
{
  assert(/Room\\u2026',  \(\)=>\{ jump\('build','props'\); if\(typeof _edRevealHost==='function'\) _edRevealHost\('edRoom'\); \}/.test(src),
    'the + menu reaches it (build 1320’s one place to add anything placeable)');
  assert(/subfold\('Room', 'o_room', '<div id="edRoom"><\/div>', false\)/.test(src),
    'and it has its own fold, closed by default — it is a tool, not a property of the selection');
  const panel = extractFunction('renderRoomPanel');
  assert(/The size you type is the <b>inside<\/b>/.test(panel), 'the panel says the size is the INTERIOR, which is the whole promise');
  assert(/a door is a window with no sill/.test(panel), '...and that the two openings are one concept');
  assert(/go\.title=DROP_HINT;/.test(panel), 'it places at the drop point and says so with build 1322’s shared tooltip');
  assert(/Build room \(' \+ count \+ ' props\)/.test(panel), 'the button says how many props it is about to make');
  assert(/o\.width < ROOM_TIGHT_W/.test(panel) && /they will catch on the jambs/.test(panel),
    'and a door too narrow for the player warns WHERE THE NUMBER IS, which is the one mistake this panel can make that looks fine');
  assert(/onchange=/.test(panel) && !/\.oninput\s*=/.test(panel),
    'every field is onchange — renderEditorFields tears the panel down on every edit (4.11’s remaining bullet)');
}

done('build 1323 (editor audit 4.10): the room tool. "A doorway is four boxes forever" was the audit\'s stated ceiling on hand-built interiors, and CSG is the wrong tool for this engine — build 1148 makes a mesh into a per-part collider box list, so a boolean buys one opaque mesh with MORE boxes, no editable parts, no instancing and a doorway that cannot be moved without re-cutting. A doorway is still boxes; it is boxes nobody places or measures. roomPieces is a PURE function (spec in, boxes out) so the geometry is swept exhaustively here: 3600 configurations with ZERO overlaps, zero interior intrusions and zero degenerate pieces, every door\'s clear gap equal to the authored width and head height to within a millimetre, and a wall carrying both a door and a window tiling itself with no holes. Two things came out of the live probe rather than the maths: a room dropped on a 15% grade sheared by 1.245 m because finalizeProp lifts every prop independently, so the whole shell now takes ONE lift and lands flat on a pad (and it round-trips, because the stored y IS the number passed in); and the default 1.6 m door is EXACTLY the player\'s 1.6 m diameter — a body of that radius could not be swept through it — so doors default to 2.0 m and anything under 1.8 warns in the panel');
