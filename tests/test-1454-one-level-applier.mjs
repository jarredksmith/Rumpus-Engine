// build 1454 — A LEVEL'S SECTIONS ARE APPLIED IN ONE PLACE.
//
// An 18-line block was written out twice: once in `loadLevelFromNet` (the campaign / co-op load path)
// and once in `restoreLevel` (every editor load and every undo). It covered the extraction spot, audio
// zones, triggers, death zones, jump pads, ladders, fire/water/fx zones, waterfalls, the impact + death
// fx, the logic graph, persistence, model rigs, custom anims, HUD widgets, action binds, prefab defs,
// the tracer/decal/bolt configs, the HUD theme, the radial menu and the character roster.
//
// THE DUPLICATION HAD ALREADY DRIFTED, and that is what makes this a bug fix rather than tidying:
// the net copy ended with `refreshExtractMarker()` and the editor copy did not. So loading a level in
// the editor — or pressing Ctrl+Z — left the extraction marker sitting on the PREVIOUS level's spot,
// or lingering when the new level had none. It self-healed only if you happened to be on the extract
// tab, which re-renders the marker for its own reasons (renderEditorFields). What ships is the UNION,
// which is build 1401's rule for exactly this situation.
//
// TWENTY-FIVE HARNESSES ENFORCED THE DUPLICATION. Each asserted a COUNT OF 2 over the source to mean
// "restored on both load paths" — build 1280's own finding ("a test that counts copies of a thing is a
// test of the copying"), and worse: those pins made REMOVING the duplication fail the suite. They now
// go through `appliedOnceByBothLoaders`, which states the property they always meant and cannot be
// satisfied by a second copy appearing somewhere else.
//
// One of them was a FALSE POSITIVE of my own sweep and is recorded here because build 1400 warned about
// exactly it: test-1193 legitimately counts two `_fxSpeedFor` sites (bots and enemies), nothing to do
// with loaders. A blanket regex over the test tree rewrote it; the helper threw rather than passing,
// which is the only reason it was caught in one run.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const app = extractFunction('_applyLevelSections');

// ---------------------------------------------------------------- 1. there is exactly ONE applier
{
  eq((src.match(/function _applyLevelSections\(level\)\{/g) || []).length, 1, 'the applier is declared once');
  eq((src.match(/_applyLevelSections\(level\);/g) || []).length, 2, 'and called from exactly two places');
  for (const loader of ['loadLevelFromNet', 'restoreLevel'])
    assert(/_applyLevelSections\(level\);/.test(extractFunction(loader)), loader + ' reaches the applier');
}

// ---------------------------------------------------------------- 2. no section is applied twice
// This is the assertion the 25 moved pins collapse into. Each of these statements must exist exactly
// once in the whole engine, and that once must be inside the applier — so a future build that copies
// a line back into a loader fails HERE rather than shipping a level format that only half loads.
{
  const SECTIONS = [
    [/extractSpot = level\.extract \?/g,                 'the extraction spot'],
    [/audioZones = Array\.isArray\(level\.audioZones\)/g, 'audio zones'],
    [/triggerZones = Array\.isArray\(level\.triggers\)/g, 'trigger volumes'],
    [/deathZones = Array\.isArray\(level\.deathZones\)/g, 'death zones'],
    [/jumpPads = Array\.isArray\(level\.jumpPads\)/g,     'jump pads'],
    [/ladders = Array\.isArray\(level\.ladders\)/g,       'ladders'],
    [/fireZones = Array\.isArray\(level\.fireZones\)/g,   'fire zones'],
    [/waterZones = Array\.isArray\(level\.waterZones\)/g, 'water zones'],
    [/fxZones = Array\.isArray\(level\.fxZones\)/g,       'effect zones'],
    [/waterfalls = Array\.isArray\(level\.waterfalls\)/g, 'waterfalls'],
    [/fxCfg = _sanitizeFx\(level\.fx\)/g,                 'the impact fx'],
    [/deathFxCfg = _sanitizeDeathFx\(level\.deathFx\)/g,  'the death fx'],
    [/logicGraph = _sanitizeLogic\(level\.logic\)/g,      'the logic graph'],
    [/persistVars = _sanitizePersist\(level\.persistVars\)/g, 'persistence'],
    [/modelRigs = _sanitizeModelRigs\(level\.modelRigs\)/g,   'model rigs'],
    [/customAnims = _caSanitize\(level\.customAnims\)/g,      'custom anims'],
    [/hudWidgets = _sanitizeHudWidgets\(level\.hudWidgets\)/g, 'HUD widgets'],
    [/actionBinds = _sanitizeActions\(level\.actions\)/g,      'action binds'],
    [/tracerCfg = _sanitizeTracer\(level\.tracer\)/g,          'the tracer config'],
    [/decalCfg = _sanitizeDecal\(level\.decal\)/g,             'the decal config'],
    [/boltCfg = _sanitizeBolt\(level\.bolt\)/g,                'the bolt config'],
    [/hudCfg = _sanitizeHud\(level\.hud\)/g,                   'the HUD theme'],
    [/radialCfg = _sanitizeRadial\(level\.radial\)/g,          'the radial menu'],
    [/charRoster = Array\.isArray\(level\.roster\)/g,          'the character roster'],
  ];
  for (const [re, what] of SECTIONS) {
    eq((app.match(re) || []).length, 1, what + ' is applied inside the applier');
    eq((src.match(re) || []).length, 1, what + ' is applied NOWHERE ELSE — the duplication has not come back');
  }
  eq(SECTIONS.length, 24, 'all 24 sections accounted for');
}

// ---------------------------------------------------------------- 3. the drift this build closes
{
  assert(/refreshExtractMarker\(\)/.test(app),
    'the extraction marker is refreshed — the net copy did this and the editor copy did NOT, which is the bug');
  // and it is now unreachable-by-one-path only if somebody re-splits the function
  eq((src.match(/_applyLevelSections\(level\);/g) || []).length, 2,
    'so both the editor load/undo path and the co-op path get it');
}

// ---------------------------------------------------------------- 4. EXECUTED round trip
// Every pin above is text. This runs the real function against a level carrying every section at a
// non-default value, and reads the module state back out — because a field that happens to equal its
// default cannot tell a working applier from a missing one, and `deathZones` had ZERO assertions of
// any kind in the whole suite before this build.
function runApplier(level) {
  const calls = [];
  const mk = (n) => (...a) => { calls.push(n); return a[0]; };
  const rig = new Function(`
    const calls = [];
    const note = (n) => calls.push(n);
    let extractSpot=null, audioZones=[], triggerZones=[], selTrigger=99, deathZones=[], jumpPads=[],
        ladders=[], fireZones=[], waterZones=[], fxZones=[], selFxZone=99, waterfalls=[],
        fxCfg=null, deathFxCfg=null, logicGraph=null, persistVars=null, persistSave=false,
        persistInv=false, persistCp=false, modelRigs=null, customAnims=null, _caRev=0,
        hudWidgets=null, _hwRev=0, actionBinds=null, tracerCfg=null, decalCfg=null, boltCfg=null,
        hudCfg=null, radialCfg=null, charRoster=[], homepageCfg=null, lobbyBgUrl='',
        _persistCpVal=null, _persistInvVal=null;
    const _trigState = [1,2,3];
    const extractFxCfg = { color:'#000000', height:0, opacity:0, pillar:false };
    const tag = (t) => (z) => Object.assign({ _via:t }, z);
    const _migrateTrigger=tag('trigger'), _migrateDeathZone=tag('death'), _migrateJumpPad=tag('jump'),
          _migrateLadder=tag('ladder'), _migrateFireZone=tag('fire'), _migrateWaterZone=tag('water'),
          _migrateFxZone=tag('fx'), _migrateWaterfall=tag('fall'), _sanitizeCharCfg=tag('char');
    const box = (t) => (v) => ({ _via:t, got:v });
    const _sanitizeFx=box('fx'), _sanitizeDeathFx=box('deathfx'), _sanitizeLogic=box('logic'),
          _sanitizePersist=box('persist'), _sanitizeModelRigs=box('rigs'), _caSanitize=box('anims'),
          _sanitizeHudWidgets=box('widgets'), _sanitizeActions=box('actions'), _sanitizeTracer=box('tracer'),
          _sanitizeDecal=box('decal'), _sanitizeBolt=box('bolt'), _sanitizeHud=box('hud'),
          _sanitizeRadial=box('radial'), _sanitizeHomepage=box('home'), _sanitizeLobbyBg=box('lobbybg');
    const _persistNSFrom=(h)=>({ _via:'ns', from:h }), _persistLoad=(ns)=>{ note('persistLoad'); return ns; };
    const _pfMergeDefs=(d)=>note('pfMerge');
    const refreshExtractMarker=()=>note('refreshExtractMarker'), applyExtractFx=()=>note('applyExtractFx');
    const refreshTriggerMarkers=()=>note('trigMarkers'), renderTriggersPanel=()=>note('trigPanel');
    const refreshDeathZoneMarkers=()=>note('deathMarkers'), refreshJumpPadMarkers=()=>note('jumpMarkers');
    const refreshLadderMarkers=()=>note('ladderMarkers'), refreshFireZones=()=>note('fireZones');
    const refreshWaterZones=()=>note('waterZones'), refreshFxZoneMarkers=()=>note('fxMarkers');
    const renderFxZonesPanel=()=>note('fxPanel'), refreshWaterfalls=()=>note('waterfalls');
    const stopAudioZones=()=>note('stopAudio'), refreshAudioZoneMarkers=()=>note('audioMarkers');
    const renderAudioZonesPanel=()=>note('audioPanel'), renderImpactFxPanel=()=>note('impactPanel');
    const renderLogicPanel=()=>note('logicPanel'), updateHudWidgets=()=>note('updWidgets');
    const refreshActionTouchButtons=()=>note('actionBtns'), renderTracerFxPanel=()=>note('tracerPanel');
    const _decalTexReset=()=>note('decalReset'), renderDecalFxPanel=()=>note('decalPanel');
    const renderBoltFxPanel=()=>note('boltPanel'), applyHudCfg=()=>note('applyHud');
    const renderHudPanel=()=>note('hudPanel'), renderBuildMenuPanel=()=>note('radialPanel');
    const renderCharRosterPanel=()=>note('rosterPanel');
    ${app}
    return function(level){
      _applyLevelSections(level);
      return { extractSpot, extractFxCfg, audioZones, triggerZones, selTrigger, deathZones, jumpPads,
               ladders, fireZones, waterZones, fxZones, selFxZone, waterfalls, fxCfg, deathFxCfg,
               logicGraph, persistVars, persistSave, persistInv, persistCp, modelRigs, customAnims,
               _caRev, hudWidgets, _hwRev, actionBinds, tracerCfg, decalCfg, boltCfg, hudCfg,
               radialCfg, charRoster, trigStateLen:_trigState.length, calls };
    };`)();
  return rig(level);
}

{
  const level = {
    extract: { x: 12.5, z: -8.25 },
    audioZones: [{ x: 3, z: 4, r: 22, url: 'hum.mp3', vol: 0.4 }],
    triggers:   [{ x: 1, z: 2, r: 5 }],
    deathZones: [{ x: 9, z: 9, r: 3 }, { x: -4, z: 0, r: 6 }],
    jumpPads:   [{ x: 7, z: 7 }],
    ladders:    [{ x: 2, z: 2 }],
    fireZones:  [{ x: 5, z: 5 }],
    waterZones: [{ x: 6, z: 6 }],
    fxZones:    [{ x: 8, z: 8 }],
    waterfalls: [{ x: 0, z: 11 }],
    fx: 'FX', deathFx: 'DFX', logic: 'LOGIC', persistVars: ['score'],
    persistSave: true, persistInv: true, persistCp: true,
    modelRigs: 'RIGS', customAnims: 'ANIMS', hudWidgets: 'WIDGETS', actions: 'ACTIONS',
    tracer: 'TRACER', decal: 'DECAL', bolt: 'BOLT', hud: 'HUD', radial: 'RADIAL',
    roster: [{ name: 'Scout' }],
  };
  const r = runApplier(level);

  // the section this build's audit found had ZERO assertions anywhere in 1,190 harnesses
  eq(r.deathZones.length, 2, 'death zones: BOTH entries arrive');
  eq(r.deathZones[0]._via, 'death', '...through their own migrator');
  eq(r.deathZones[0].r, 3, '...carrying their authored radius');

  eq(r.extractSpot.x, 12.5, 'the extraction spot lands');
  eq(r.extractSpot.z, -8.25, '...on both axes');
  assert(r.calls.includes('refreshExtractMarker'), 'and its marker is refreshed — the drift this build closes');

  eq(r.audioZones.length, 1, 'audio zones arrive');
  eq(r.audioZones[0].r, 22, '...with the authored radius');
  eq(r.triggerZones[0]._via, 'trigger', 'triggers go through their migrator');
  eq(r.selTrigger, -1, '...and the selection is reset, not left pointing at the previous level');
  eq(r.trigStateLen, 0, '...with the per-trigger runtime state cleared');
  eq(r.jumpPads[0]._via, 'jump', 'jump pads migrate');
  eq(r.ladders[0]._via, 'ladder', 'ladders migrate');
  eq(r.fireZones[0]._via, 'fire', 'fire zones migrate');
  eq(r.waterZones[0]._via, 'water', 'water zones migrate');
  eq(r.fxZones[0]._via, 'fx', 'effect zones migrate');
  eq(r.selFxZone, -1, '...and their selection resets too');
  eq(r.waterfalls[0]._via, 'fall', 'waterfalls migrate');

  eq(r.fxCfg.got, 'FX', 'impact fx sanitized');
  eq(r.deathFxCfg.got, 'DFX', 'death fx sanitized');
  eq(r.logicGraph.got, 'LOGIC', 'the logic graph is sanitized');
  eq(r.persistVars.got[0], 'score', 'the persist list is sanitized');
  eq(r.persistSave, true, 'persistSave');
  eq(r.persistInv, true, 'persistInv');
  eq(r.persistCp, true, 'persistCp');
  eq(r.modelRigs.got, 'RIGS', 'model rigs');
  eq(r.customAnims.got, 'ANIMS', 'custom anims');
  eq(r._caRev, 1, '...and the clip cache is invalidated (build 1040)');
  eq(r.hudWidgets.got, 'WIDGETS', 'HUD widgets');
  eq(r._hwRev, 1, '...and their revision bumps (build 1058)');
  eq(r.actionBinds.got, 'ACTIONS', 'action binds');
  eq(r.tracerCfg.got, 'TRACER', 'tracer config');
  eq(r.decalCfg.got, 'DECAL', 'decal config');
  eq(r.boltCfg.got, 'BOLT', 'bolt config');
  eq(r.hudCfg.got, 'HUD', 'HUD theme');
  eq(r.radialCfg.got, 'RADIAL', 'radial menu');
  eq(r.charRoster[0]._via, 'char', 'the character roster is sanitized per entry');

  // the panels a creator is looking at have to follow the load, or the editor shows the old level
  for (const c of ['audioMarkers','audioPanel','deathMarkers','jumpMarkers','ladderMarkers',
                   'fireZones','waterZones','fxMarkers','fxPanel','waterfalls','impactPanel',
                   'logicPanel','tracerPanel','decalPanel','boltPanel','applyHud','hudPanel',
                   'radialPanel','rosterPanel','stopAudio'])
    assert(r.calls.includes(c), 'the load refreshes: ' + c);
}

// ---------------------------------------------------------------- 5. an EMPTY level degrades, never throws
// A level authored before a field existed simply has no key. Every list must come back empty rather
// than undefined, or the next consumer to iterate it takes the frame loop down.
{
  const r = runApplier({});
  eq(r.extractSpot, null, 'no extract spot: null, not undefined');
  for (const [k, v] of Object.entries({ audioZones: r.audioZones, triggerZones: r.triggerZones,
      deathZones: r.deathZones, jumpPads: r.jumpPads, ladders: r.ladders, fireZones: r.fireZones,
      waterZones: r.waterZones, fxZones: r.fxZones, waterfalls: r.waterfalls, charRoster: r.charRoster })) {
    assert(Array.isArray(v), k + ' is an array on an empty level');
    eq(v.length, 0, k + ' is EMPTY, not carried over from the previous level');
  }
  eq(r.persistSave, false, 'the persistence flags clear rather than sticking from the last level');
  eq(r.persistInv, false, '...inventory too');
  eq(r.persistCp, false, '...and the checkpoint');
  assert(r.calls.includes('refreshExtractMarker'), 'and the marker is STILL refreshed, which is how a stale one is cleared');
}

// ---------------------------------------------------------------- 6. a stale level cannot leak through
// The failure the duplication risked was a field landing on one path and not the other. Applying level
// B after level A must leave nothing of A behind for any list-shaped section.
{
  const A = { deathZones:[{x:1,z:1,r:1}], audioZones:[{x:1,z:1}], roster:[{name:'A'}], persistSave:true };
  const B = {};
  const rig = runApplier(A);
  eq(rig.deathZones.length, 1, 'level A applied');
  const after = runApplier(B);
  eq(after.deathZones.length, 0, 'level B leaves none of A behind');
  eq(after.charRoster.length, 0, '...including the roster');
  eq(after.persistSave, false, '...and the flags');
}

done('build 1454 (architecture audit CRITICAL 1): a level\'s eighteen non-prop sections were written out TWICE — loadLevelFromNet and restoreLevel — and the duplication had ALREADY DRIFTED: the net copy refreshed the extraction marker and the editor copy did not, so loading a level or pressing undo left the marker on the previous level\'s spot unless the creator happened to be sitting on the extract tab. One `_applyLevelSections(level)` now carries the union, which is build 1401\'s rule, and that closes the bug as a side effect. TWENTY-FIVE harnesses were enforcing the duplication with a count of 2 — build 1280\'s own finding that a test which counts copies of a thing is a test of the copying, in its worst form, where the pins made REMOVING the defect fail the suite; they assert the property now (the statement lives once, inside the applier, and both loaders reach it) via a shared `appliedOnceByBothLoaders` helper that cannot be satisfied by a second copy appearing elsewhere. All 24 sections are proven single-sited, and the applier is EXECUTED against a level carrying every one at a non-default value — including `deathZones`, which had zero assertions of any kind across 1,190 harnesses — plus an empty level (every list comes back empty rather than undefined, and the marker still refreshes, which is how a stale one clears) and an A-then-B load proving nothing of the first level survives the second');
