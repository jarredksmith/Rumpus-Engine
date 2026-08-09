// build 1464 — every zone can be clicked.
//
// Reported from play: "Not all zones can be clicked on in the editor to get control with their gizmos.
// Water, waterfalls, death zones, etc you can't click — you have to open the World tab and scroll all the
// way to the bottom and then click on the zone's Select button. It's very inconvenient."
//
// Build 1326 made ZONE_EDIT the one place a zone type declares itself and routed the RESOLVER through it —
// the half that decides what a clicked object BELONGS to. The click path's raycast TARGET LIST, the half
// that decides what can be HIT AT ALL, stayed hand-written with three of the eight types in it. So the
// resolver's branches for the other five were dead code.
//
// That is build 1158's pattern (a fix complete for the half it was tested against) and build 1277's (a
// test that pins the two ends of a wire proves nothing about the wire) — and 1326's own test asserted the
// resolver handles every type while never asking whether a ray could reach one.

import { gameSource, extractConst, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// the rows are arrow-function tables, so the KEYS are read off the text rather than evaluated
const ZE_SRC = extractConst('ZONE_EDIT', src);
const TYPES = [...ZE_SRC.matchAll(/^\s{2}(\w+):\s*\{/gm)].map(m => m[1]);

// ---------------------------------------------------------------- 1. the target list is DERIVED
{
  /* `const targets = [];` is not unique in this file, so the slice is anchored on the pick path's own
     drag guard — the first-match trap this file records (builds 1320, 1392). Both ends are asserted. */
  const A = src.indexOf("if(editorDragMoved){ editorDragMoved = false; return; }   // that was a drag");
  const B = src.indexOf("  const hits = raycaster.intersectObjects(targets, true);", A);
  assert(A > 0, 'the pick path was found');
  assert(B > A && (B - A) < 4000, '...and its target-list block ends where the raycast begins');
  const pick = src.slice(A, B);

  assert(/for\(const type in ZONE_EDIT\)\s*\{\s*\n\s*for\(const m of \(ZONE_EDIT\[type\]\.markers\(\) \|\| \[\]\)\)\{ if\(m && m\.visible\) targets\.push\(m\); \}/.test(pick),
    'THE FIX: every zone type is pushed from the SAME table the resolver reads');

  // the three that used to be hand-written must no longer be, or a marker is pushed twice
  for(const arr of ['deathZoneMarkers', 'ladderMarkers', 'audioZoneMarkers'])
    assert(!new RegExp('for\\(const m of ' + arr + '\\)').test(pick),
      arr + ' is no longer listed by hand — it arrives through ZONE_EDIT, and listing it twice would push the marker twice');

  // ...and nothing else regressed out of the list
  for(const needle of ['propModels', 'lightModels', 'spawnMarkers', 'pickupMarkers', 'lootMarkers',
                       'turretModels', 'playerSpawnMarker', 'extractZone', 'station'])
    assert(new RegExp(needle).test(pick), 'still clickable: ' + needle);
}

// ---------------------------------------------------------------- 2. executed: the list covers all eight
// A source pin says the loop is written. This runs it, with a marker array per type, and counts.
{
  const run = new Function('MARKERS', `
    const ZONE_EDIT = {};
    for(const t in MARKERS) ZONE_EDIT[t] = { markers: () => MARKERS[t] };
    const targets = [];
    for(const type in ZONE_EDIT){
      for(const m of (ZONE_EDIT[type].markers() || [])){ if(m && m.visible) targets.push(m); }
    }
    return targets.map(m => m.tag);`);

  const M = {};
  for(const t of TYPES) M[t] = [{ tag: t + '0', visible: true }, { tag: t + '1', visible: true }];
  const got = run(M);
  eq(got.length, TYPES.length * 2, 'every marker of every type reaches the raycast list');
  for(const t of TYPES) assert(got.includes(t + '0'), 'a ' + t + ' marker is clickable');

  // the invariants the old hand-written lines carried, kept
  eq(run({ a: [{ tag:'x', visible:false }] }).length, 0, 'a hidden marker is NOT clickable');
  eq(run({ a: [null, { tag:'y', visible:true }] }).length, 1, 'a null hole is survived');
  eq(run({ a: null }).length, 0, 'a type with no marker array is survived');
}

// ---------------------------------------------------------------- 3. the resolver still names all eight
// The two halves have to agree, and they are 9,000 lines apart — that gap is exactly how this broke.
{
  const hit = new Function('MARKERS', 'ROOT', `
    const ZONE_EDIT = {};
    for(const t in MARKERS) ZONE_EDIT[t] = { markers: () => MARKERS[t] };
    ${extractFunction('_zoneHitAt', src)}
    return _zoneHitAt(ROOT);`);

  for(const t of TYPES){
    const group = { parent: null };
    const M = {}; for(const t2 of TYPES) M[t2] = (t2 === t) ? [{}, group] : [{}];
    const leaf = { parent: { parent: group } };   // a marker is a GROUP of rings; the ray hits a child
    const r = hit(M, leaf);
    assert(r && r.type === t && r.i === 1,
      'the resolver walks up from a child mesh and names ' + t + ' at the right index');
  }
  eq(hit({ a: [{}] }, { parent: null }), null, 'an object belonging to no zone resolves to nothing');
}

// ---------------------------------------------------------------- 4. the effect zone had a HOLE
// Measured: an fx zone could be clicked only ON ITS OUTLINE. The ring is an annulus and the wall is an
// OPEN cylinder, so a ray through the middle — which is where a creator clicks — passed straight through.
{
  const f = extractFunction('refreshFxZoneMarkers', src);
  assert(/new THREE\.CircleGeometry\(/.test(f), 'the marker has a filled centre now');
  assert(/disc\.rotation\.x=-Math\.PI\/2/.test(f), '...lying flat, like the ring above it');
  assert(!/disc[^\n]*visible\s*:\s*false/.test(f),
    '...and it is NOT invisible: it is the pick surface, and three skips an invisible object in a raycast');
  assert(/CylinderGeometry\(z\.r, z\.r, z\.h, 36, 1, true\)/.test(f),
    'the open-sided wall is unchanged — the disc is added, nothing is replaced');
  const op = f.match(/CircleGeometry[\s\S]{0,220}?opacity:sel\?([\d.]+):([\d.]+)/);
  assert(op && +op[1] <= 0.2 && +op[2] <= 0.1,
    '...and it is faint, so a zone still reads as a zone rather than a slab');
}

// ---------------------------------------------------------------- 5. ZONE_EDIT is still the one table
{
  const zt = extractConst('ZONE_TYPES', src);
  for(const t of TYPES) assert(zt.includes("'" + t + "'"), t + ' is a real zone type');
  const ze = ZE_SRC;
  for(const t of (zt.match(/'([a-z]+)'/g) || []).map(x => x.slice(1, -1)))
    assert(new RegExp('\\b' + t + ':').test(ze),
      'every ZONE_TYPES entry has a ZONE_EDIT row — build 1326\'s property, which is what makes the derived list complete: ' + t);
  eq(TYPES.length, 8, 'all eight zone types');
}

done('build 1464 (reported from play): every zone can be clicked. "Not all zones can be clicked on in the editor to get control with their gizmos — you have to open the World tab and scroll all the way to the bottom and click the zone\'s Select button." Build 1326 made ZONE_EDIT the one place a zone type declares itself and routed the RESOLVER through it — the half that decides what a clicked object BELONGS to — and left the raycast TARGET LIST, the half that decides what can be HIT AT ALL, hand-written with three of the eight types in it. So the resolver\'s branches for the other five were dead code, and 1326\'s own test asserted the resolver handles every type while never asking whether a ray could reach one: build 1158\'s pattern and build 1277\'s, together. Measured before the fix, driving the REAL click handler from a posed editor camera: triggers, jump pads, fire zones, water zones and effect zones each had a visible marker with real meshes and a resolver that named it correctly, and 0/1 were in the raycast list; after, 8/8 select dead-centre with a prop as the control. The list is now derived from the same table, so a ninth zone type is clickable the day it is added. And the effect zone had a HOLE — its ring is an annulus and its wall an open cylinder, so it could be clicked only on its outline while every other type has something in the middle; it gets a faint filled disc, which is both the pick surface and the reason it now reads as an area rather than a hoop');
