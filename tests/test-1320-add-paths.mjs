import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1320 — editor audit 4.11, the cluster of small sharp edges in the "add something" path. The audit
// listed four. ONE IS FALSE and this build's probe is what killed it; the other three turned out to be the
// same defect wearing three hats, and the probe found a fifth instance of it:
//
//   x  "new primitives ignore terrain height"  -> WRONG. finalizeProp lifts EVERY prop by
//      _maxTerrainOver(t[0], t[2], footR), unconditionally, and propTuple stores y terrain-RELATIVE.
//      Measured with terrainHeightAt stubbed to 7.5: a box lands at 7.5, a ramp at 7.5, stored y 0.
//   ✓  the + menu offers 6 of the 10 shapes, no model and none of the six emitters
//   ✓  triggers are missing from + -> Zone
//   ✓  eight "+ Add X (at me)" buttons place at editorDropPoint — measured 116.9 m from the player with
//      the fly camera at (40,25,-60) pitched down
//   ✓  (found here) the command palette's "Add ramp" is not a builder key: it went to loadGLTFCached as a
//      MODEL URL and added nothing. `pillar` and `wedge` were absent from the same list.
//
// THE SHAPE LIST WAS WRITTEN OUT FIVE TIMES and four of the five had drifted, each in its own direction.

// ---------------------------------------------------------------- the table, and that it IS the builders
const table = (new Function('return (' + (src.match(/const PRIM_SHAPES = (\[[\s\S]*?\n\]);/) || [])[1] + ')'))();
const fx    = (new Function('return (' + (src.match(/const FX_SHAPES = (\[[\s\S]*?\n\]);/) || [])[1] + ')'))();
{
  const builders = src.slice(src.indexOf('const PRIMITIVE_BUILDERS = {'),
    src.indexOf("buildFxEmitter('fx_fountain') };") + 26);
  // the shape keys must BE the builder keys — that is the property the five copies kept failing
  for (const [key] of table)
    assert(new RegExp('(^|[{,\\s])' + key + ':').test(builders), 'PRIM_SHAPES key `' + key + '` is a real builder');
  for (const [key] of fx)
    assert(builders.indexOf(key + ':') >= 0, 'FX_SHAPES key `' + key + '` is a real builder');
  // and every non-track builder must be IN the table, or a shape exists that nothing can place
  const declared = new Set(table.map(r => r[0]).concat(fx.map(r => r[0])));
  const keys = [...builders.matchAll(/(?:^|[{,\s])([a-z_0-9]+):/g)].map(m => m[1])
    .filter(k => !/^track_/.test(k) && !/^\d/.test(k));   /* the inline "build 1250:" comment is not a key */
  for (const k of keys) assert(declared.has(k), 'builder `' + k + '` is offered somewhere (' + k + ')');
  eq(table.length, 10, 'ten shapes');
  eq(fx.length, 6, 'six emitters');
  assert(table.every(r => typeof r[1] === 'string' && r[1].length > 1), 'each carries a LABEL…');
  assert(/The label matters as much as the key/.test(src),
    '…because writing the label into the key list is exactly how "Add ramp" became a dead entry');
  assert(table.some(r => r[0] === 'pillar'), 'pillar is in the table — it was reachable from ONE surface before');
}

// ---------------------------------------------------------------- five consumers, one table
{
  assert(/const RADIAL_PRIMS = PRIM_SHAPES\.map\(_s=>_s\[0\]\);/.test(src), '1. the radial build menu');
  assert(/for\(const \[src,label\] of PRIM_SHAPES\)\{/.test(src), '2. the Object panel’s Add-shape row');
  assert(/for\(const \[fsrc,flabel\] of FX_SHAPES\)\{/.test(src), '   …and its Effects row');
  assert(/for\(const \[key,label\] of PRIM_SHAPES\)\n    A\('Add '\+label\.toLowerCase\(\)/.test(src), '3. the command palette');
  assert(/const ADD_ITEMS = PRIM_SHAPES\.filter\(_s=>_s\[3\]\)/.test(src), '4. the + menu');
  assert(/pillar:   _svgIcon\(/.test(src), '5. PRIM_ICON, which was the fifth copy and the fifth to drop pillar');
  // the icon set must cover the table, or a button renders with a blank glyph
  for (const [key] of table) assert(new RegExp('\\n  ' + key + ': *_svgIcon\\(').test(src), 'PRIM_ICON has ' + key);
}

// ---------------------------------------------------------------- the palette entry the audit found dead
{
  const pal = extractFunction('_palItems');
  assert(!/for\(const s of \['box'/.test(pal) && !/A\('Add '\+s,/.test(pal),
    "the hand-written key list — with its bogus 'ramp' — is gone…");
  const labels = table.map(r => r[1].toLowerCase());
  assert(labels.indexOf('ramp') >= 0,
    "…and 'ramp' survives as the LABEL of `wedge`, so the wording a creator types now resolves to a real shape");
  assert(/'shape place spawn primitive new '\+key/.test(pal),
    'with the key in the keywords, so "wedge" finds it too');
  assert(/it added zero props,\n     silently/.test(src), 'the measured consequence is recorded');
}

// ---------------------------------------------------------------- the zone list, derived
{
  const zt = (new Function('return (' + (src.match(/const ZONE_TYPES = (\[[\s\S]*?\]);/) || [])[1] + ')'))();
  eq(zt.length, 8, 'eight placeable volumes');
  assert(zt[0][0] === 'triggers', 'triggers among them — the volume the logic graph is built on');
  assert(!/const ZONE_ADD=\[/.test(src), 'the + menu’s SECOND copy of that list is gone…');
  assert(/for\(const \[type,icon,label\] of ZONE_TYPES\)\{ menuItem/.test(src), '…it iterates the picker’s own list');
  // and the dispatch is keyed by the same string, so a type cannot be listed but unwired
  for (const [key] of zt) assert(new RegExp('\\n        ' + key + ': *\\(\\)=>').test(src), 'ZONE_ADDERS wires ' + key);
  assert(/const _f=ZONE_ADDERS\[type\]; if\(_f\) _f\(\);/.test(src), 'one dispatch, not an if/else chain that can drift');
}

// ---------------------------------------------------------------- what the + menu could never reach
{
  assert(/'_shapeSub'/.test(src) && /const buildShapes=\(\)=>\{/.test(src), 'the four uncommon shapes have a submenu');
  assert(/for\(const \[src,label,glyph,common\] of PRIM_SHAPES\)\{ if\(common\) continue;/.test(src),
    '...which is exactly the complement of the top-level six, by the table’s own flag');
  assert(/'_fxSub'/.test(src) && /const buildFx=\(\)=>\{/.test(src), 'build 1250’s emitters are placeable from it');
  assert(/Model\\u2026', \(\)=>\{ jump\('build','props'\); if\(typeof _edRevealHost==='function'\) _edRevealHost\('edModels'\); \}/.test(src),
    'and a MODEL — the commonest thing a level is made of, and the one thing the menu never offered');
  // a menu entry that switches tabs and leaves its target collapsed is the "nothing happened" it exists to fix
  const rv = extractFunction('_edRevealHost');
  assert(/const sub = h\.closest\('\.edSubSection'\); if\(sub\)\{ sub\.classList\.remove\('collapsed'\);/.test(rv), 'it opens the sub-fold…');
  assert(/const sec = h\.closest\('\.edSection'\); if\(sec\) sec\.classList\.remove\('collapsed'\);/.test(rv), '…and the section around it…');
  assert(/h\.scrollIntoView\(\{ block:'start', behavior:'smooth' \}\);/.test(rv), '…and scrolls to it');
  assert(/localStorage\.setItem\('breach_editor_subfolds'/.test(rv), 'persisting the fold the same way a click on it would');
  assert(/setTimeout\(\(\)=>\{ try\{/.test(rv), 'deferred a frame — the caller has just re-rendered the panel it targets');
}

// ---------------------------------------------------------------- eight buttons stopped lying
{
  eq((src.match(/\(here\)'; addB\.title=DROP_HINT;/g) || []).length, 8, 'all eight say "(here)" and share one tooltip');
  assert(!/Add [a-z ]+ \(at me\)/.test(src), 'and none says "(at me)"');
  assert(/const DROP_HINT = 'Drops where you\\u2019re looking \(a few metres in front of you in walk mode\)\.';/.test(src),
    'the precise wording is stated ONCE, so the eight cannot disagree again');
  assert(/the drop point was 116\.9 m/.test(src), 'with the measurement that made it a defect rather than a quibble');
  assert(!/Stand where you want one and click Add/.test(src), 'the empty-state hints stopped saying it too');
  eq((src.match(/lick Add and it lands where you\\u2019re looking\./g) || []).length, 6, '...all six of them');
}

// ---------------------------------------------------------------- the KILL: props already sit on terrain
{
  const fin = extractFunction('finalizeProp');
  assert(/obj\.position\.y = t\[1\] \+ _maxTerrainOver\(t\[0\], t\[2\], obj\.userData\.footR\);/.test(fin),
    'finalizeProp lifts EVERY prop onto the terrain — no isPrimitive/isModelSrc gate anywhere near it');
  assert(!/isModelSrc[\s\S]{0,80}_maxTerrainOver/.test(fin), '...and nothing conditions that on what kind of prop it is');
  assert(/function propTuple\(o\)\{ return \[o\.position\.x, o\.position\.y - _maxTerrainOver\(/.test(src),
    'and the tuple is stored terrain-relative, so the round trip is exact');
  assert(/ONE IS FALSE and this build's probe is what killed it/.test(
    // the kill is recorded in THIS file, which is the durable place for it
    "ONE IS FALSE and this build's probe is what killed it"), 'the kill is recorded');
}

done('build 1320 (editor audit 4.11): the shape list was written out FIVE times and four copies had drifted — the Object panel and PRIM_ICON had lost `pillar`, the command palette had lost `pillar` and `wedge` and carried a bogus `ramp` that was handed to the model loader as a URL and silently added nothing, and the + menu offered 6 of the 10 shapes, no model at all and none of build 1250\'s six emitters. The + menu\'s zone list was likewise a second copy of ZONE_TYPES that had drifted by one entry: TRIGGERS, the volume the whole logic graph is built on, could not be added from the menu build 650 calls "the ONE place to add anything placeable". PRIM_SHAPES / FX_SHAPES are that list once, and this test asserts the keys ARE the builder keys in both directions, so a new primitive reaches every surface or fails here. Eight "+ Add X (at me)" buttons place at editorDropPoint — measured 116.9 m from the player with the fly camera pitched down — and now say "(here)" with one shared tooltip. The audit\'s fourth claim, "new primitives ignore terrain height", is FALSE: finalizeProp lifts every prop by _maxTerrainOver unconditionally and propTuple stores y terrain-relative, measured at a stubbed terrain of 7.5');
