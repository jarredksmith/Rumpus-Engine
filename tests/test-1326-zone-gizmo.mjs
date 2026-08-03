import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1326 — reported from play:
//   "For the player start, allow the gizmo y handle to move it for height placement."
//   "Make sure all placed zones are clickable and have gizmo handles to drag their x, y, z location."
//
// Verified, and it was THREE gaps between three hand-maintained lists:
//   - the CLICK resolver knew death zones, jump pads, fire zones, ladders, audio zones. Triggers, water
//     zones and effect zones could not be selected by clicking them at all.
//   - the DRAG write-back had six of the eight and wrote only .x and .z; water and effect zones had no
//     branch, so their handle moved nothing.
//   - every zone type discarded the drag's Y, though each has a `y` its marker already draws.
//   - pstart discarded Y too, under a comment reading "player start lives on the floor" — while the panel
//     beside it has had a Height slider for that exact field the whole time.
//
// Measured live (tools/probe/zone-gizmo.mjs), driving the real applyGizmoDrag and the real click resolver:
//   pstart      drag to (4, 6.5, -3) -> y 6.5 and the marker follows; -50 clamps to 0; on terrain 10 a
//               drag to 13 stores 3 — height ABOVE ground, build 1087's rule for enemy spawns
//   all EIGHT   placed, click resolves from a CHILD mesh to the right type, drag writes 7 / 5 / -9

// ---------------------------------------------------------------- one table, and it IS the picker's list
{
  const t = src.match(/const ZONE_EDIT = \{[\s\S]*?\n\};/);
  assert(!!t, 'ZONE_EDIT exists');
  const types = [...t[0].matchAll(/\n  ([a-z]+):\s*\{/g)].map(m => m[1]);
  eq(types.length, 8, 'all eight placeable volumes');
  const zt = (new Function('return (' + (src.match(/const ZONE_TYPES = (\[[\s\S]*?\]);/) || [])[1] + ')'))();
  eq(types.slice().sort().join(','), zt.map(z => z[0]).sort().join(','),
    'and it is exactly the picker’s own list — the fourth copy of "the zone types" is not created here');
  for (const k of types) assert(new RegExp('\\n  ' + k + ':\\s*\\{ list:\\(\\)=>').test(t[0]), k + ' has a list…');
  for (const k of ['markers:()=>', 'refresh:()=>', 'panel:()=>', 'sel:()=>', 'pick:(i)=>'])
    assert((t[0].match(new RegExp(k.replace(/[()=>]/g, c => '\\' + c), 'g')) || []).length === 8, 'every entry carries ' + k);
  // string-keyed dispatch would reintroduce exactly what build 1271 removed
  assert(/build 1271 removed eval and new Function/.test(src),
    'the refresh/panel hooks are direct function references, not names looked up at runtime');
  assert(!/\(0,eval\)/.test(src), 'and no eval survived the drafting');
}

// ---------------------------------------------------------------- clicking: resolved by walking up
{
  const hit = extractFunction('_zoneHitAt');
  assert(/for\(let g=root; g; g=g\.parent\)/.test(hit),
    'it walks UP the parents — a marker is a group of rings and dots, and the raycast hits one of those');
  assert(/for\(const type in ZONE_EDIT\)/.test(hit), '...across every type in the table');
  const pick = src.slice(src.indexOf('const zh=_zoneHitAt(root)'), src.indexOf('const zh=_zoneHitAt(root)') + 160);
  assert(/picked=zh\.type; ZONE_EDIT\[zh\.type\]\.pick\(zh\.i\); break;/.test(pick),
    'and the picker sets both the active target and that type’s own selection index');
  // the five hand-written lookups it replaced are gone
  for (const dead of ['const dzi = deathZoneMarkers.indexOf(root)', 'const jpi = jumpPadMarkers.indexOf(root)',
                      'const ldi = ladderMarkers.indexOf(root)', 'const azi = audioZoneMarkers.indexOf(root)',
                      'const fzi=fireZoneFx.indexOf(g)'])
    assert(src.indexOf(dead) < 0, 'the hand-written lookup is gone: ' + dead.slice(0, 34));
  assert(/A placed thing you cannot click is a placed thing you cannot edit/.test(src), 'with the reason recorded');
}

// ---------------------------------------------------------------- dragging: x, y AND z
{
  const mv = extractFunction('_zoneMove');
  assert(/z\.x = \+v\.x\.toFixed\(2\); z\.z = \+v\.z\.toFixed\(2\);/.test(mv), 'x and z as before…');
  assert(/z\.y = \+Math\.max\(0, v\.y - terr\)\.toFixed\(2\);/.test(mv), '…and Y, clamped at the ground');
  assert(/const terr = \(typeof terrainHeightAt==='function'\) \? terrainHeightAt\(z\.x, z\.z\) : 0;/.test(mv),
    'stored terrain-relative, which is how the marker already DRAWS it (baseY on a group at the terrain)');
  assert(/_zoneRepaint\(type\)/.test(mv), 'and the marker and its panel are repainted');
  // the six duplicated branches are one
  assert(/\} else if\(ZONE_EDIT\[editorActive\]\)\{/.test(src), 'the drag has ONE zone branch…');
  assert(!/const z=deathZones\[selDeathZone\]; if\(!z\) return; z\.x=/.test(src), '…and the copies are gone');
  // the honest note about the semantics this does NOT resolve
  assert(/gameplay containment tests \(`inBand`\) compare `\+z\.y` against an ABSOLUTE feet height/.test(src),
    'with the marker/gameplay disagreement stated rather than silently picked');
  assert(/On flat ground\n\/\/ those agree exactly, which is why nothing has ever reported it/.test(src),
    '...including why it has never been noticed');
}

// ---------------------------------------------------------------- the player start
{
  const g = src.slice(src.indexOf("} else if(editorActive==='pstart'){"), src.indexOf("} else if(editorActive==='extract'){"));
  assert(/playerSpawn\.y=\+Math\.max\(0, v\.y-_pterr\)\.toFixed\(2\);/.test(g), 'the Y of the drag is kept…');
  assert(/const _pterr=\(typeof terrainHeightAt==='function'\)\?terrainHeightAt\(v\.x,v\.z\):0;/.test(g),
    '…relative to the terrain, so it rides terrain edits instead of being stranded');
  assert(!/refreshPlayerSpawnMarker\(\);   \/\/ player start lives on the floor/.test(src),
    'and the code comment that justified dropping it is gone (the new note quotes it, which is the point)');
  assert(/Build 1087 had already solved the identical problem for ENEMY spawn markers/.test(src),
    'with the precedent named — the same fix, six hundred builds later');
  // the panel must stop telling people it is X/Z only
  assert(!/\(drag the gizmo for X\/Z\)/.test(src), 'the position readout no longer says X/Z only…');
  eq((src.match(/\(drag the gizmo, all three axes\)/g) || []).length, 2, '…in both places it is written');
  assert(/including the <b>green Y handle<\/b> to lift it onto a platform or a second story/.test(src),
    'and the hint says what the handle is for');
  // the field it writes has always existed
  assert(/y:   \(savedLevel && savedLevel\.pstart && savedLevel\.pstart\.y  !=null\)/.test(src),
    'pstart.y is not new — the drag simply never wrote it');
}

done('build 1326 (reported from play): the player start\'s gizmo Y handle now places height, and every placed zone is clickable and draggable in all three axes. Three gaps had grown between three hand-maintained lists: the click resolver knew five of the eight zone types, so triggers, water zones and effect zones could not be selected by clicking them at all; the drag write-back knew six and wrote only .x and .z, so water and effect zone handles moved nothing; and every zone discarded the drag\'s Y although each has a `y` its marker already draws. The player start did the same under a comment reading "player start lives on the floor", while the panel beside it has had a Height slider for that field the whole time — and build 1087 had already solved exactly this for enemy spawn markers by storing the height relative to the terrain. ZONE_EDIT is one table read by both the picker and the drag, asserted here to be identical to the picker\'s own ZONE_TYPES so the ninth zone type cannot reach two lists out of three. Measured live driving the real applyGizmoDrag and the real click resolver: pstart dragged to y 6.5 keeps it and the marker follows, -50 clamps to 0, and on terrain 10 a drag to 13 stores 3; all eight zone types place, resolve a click from a CHILD mesh to the right type, and take a drag to 7 / 5 / -9');
