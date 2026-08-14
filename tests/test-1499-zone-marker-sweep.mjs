// build 1499: authoring zone markers leave the frame when play begins.
//
// Reported from play: "The editor visual for event triggers, and a few others show their outlines/radius
// markers in the game if you click 'p' to play directly from the editor or select 'play campaign'."
// Measured (tools/probe/marker-leak.mjs on 1498): the P key leaked ALL SIX pure-editor zone marker types
// (toggleEditor's close branch hid no zones at all), and Play campaign leaked TRIGGERS (they were in no
// hide list anywhere). Three hand-kept hide lists, each incomplete differently — build 1280's defect
// shape. The fix is ONE sweep derived from build 1326's ZONE_EDIT table, so the ninth zone type cannot
// be missed, with firezones/waterzones skipped because their markers() are the PLAY visuals.
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- extract the table + the sweep ----
const tStart = src.indexOf('const ZONE_EDIT = {');
assert(tStart > 0, 'ZONE_EDIT found');
const sEnd = src.indexOf('function _edZoneMarkersVisible(v){', tStart);
assert(sEnd > tStart, 'the sweep is declared right after the table it derives from');
const fEnd = src.indexOf('\n}', sEnd);
const rigSrc = src.slice(tStart, fEnd + 2);
assert(/const ZONE_PLAY_VISUALS = \['firezones','waterzones'\];/.test(rigSrc),
  'exactly two keys are exempt, named once');

// ------------------------------------------------------- execute the REAL sweep over the table ----
const mk = (n) => Array.from({ length: n }, () => ({ visible: true }));
const stubs = {
  triggerMarkers: mk(2), audioZoneMarkers: mk(1), deathZoneMarkers: mk(1), jumpPadMarkers: mk(1),
  ladderMarkers: mk(1), fireZoneFx: mk(1), waterZoneFx: mk(1), fxZoneFx: mk(2),
};
stubs.triggerMarkers.push(null);                       // a hole (build 1167's class) must not throw
stubs.fireZoneFx[0].visible = 'PLAY';                  // sentinel: the sweep must never write these
stubs.waterZoneFx[0].visible = 'PLAY';
const names = Object.keys(stubs);
const rig = new Function(...names,
  rigSrc + '\nreturn { ZONE_EDIT, ZONE_PLAY_VISUALS, sweep:_edZoneMarkersVisible };');
const R = rig(...names.map(n => stubs[n]));

// hide: every authoring cue goes dark, the play visuals are untouched
R.sweep(false);
for(const n of ['triggerMarkers','audioZoneMarkers','deathZoneMarkers','jumpPadMarkers','ladderMarkers','fxZoneFx'])
  for(const g of stubs[n]) if(g) eq(g.visible, false, n + ' hidden by the sweep');
eq(stubs.fireZoneFx[0].visible, 'PLAY', 'fire zone flames NEVER touched — hiding them would delete the effect in play');
eq(stubs.waterZoneFx[0].visible, 'PLAY', 'water surface never touched either');

// show: symmetric, so reopening the editor restores them (build 1293 means no panel render would)
R.sweep(true);
for(const n of ['triggerMarkers','fxZoneFx']) for(const g of stubs[n]) if(g) eq(g.visible, true, n + ' back');
eq(stubs.fireZoneFx[0].visible, 'PLAY', 'and the show direction skips the play visuals too');

// ------------------------------------------------------------- the derivation, not a hand list ----
{
  const fn = rigSrc.slice(rigSrc.indexOf('function _edZoneMarkersVisible'));
  assert(/for\(const k in ZONE_EDIT\)/.test(fn),
    'the sweep ITERATES the table — a ninth zone type is covered the day its row lands');
  for(const k of R.ZONE_PLAY_VISUALS)
    assert(k in R.ZONE_EDIT, 'exempt key `' + k + '` is a real ZONE_EDIT key, so a rename fails loudly');
  eq(Object.keys(R.ZONE_EDIT).length - R.ZONE_PLAY_VISUALS.length, 6,
    'six zone types are swept today (all eight minus the two play-visual rows)');
  // and the exemption is real: those two rows resolve to the very arrays the sentinels live in
  assert(R.ZONE_EDIT.firezones.markers() === stubs.fireZoneFx &&
         R.ZONE_EDIT.waterzones.markers() === stubs.waterZoneFx,
    'firezones/waterzones markers() ARE the play-visual lists — which is exactly why they are exempt');
}

// ------------------------------------------------------------------------- the three doors ----
{
  // toggleEditor: open shows (before the close branch), close hides — the P-key path
  const te = src.indexOf('function toggleEditor');
  const show = src.indexOf('_edZoneMarkersVisible(true)', te);
  const hide = src.indexOf('_edZoneMarkersVisible(false)', te);
  assert(te > 0 && show > te && hide > show,
    'toggleEditor shows on open and hides on close, in that source order');
  // the close branch also drops the spawn-region marker, which was in startGame/endGame but not here
  const closeSlice = src.slice(hide, hide + 400);
  assert(/setSpawnRegionMarkerVisible\(false\)/.test(closeSlice),
    'the P-key path hides the spawn-region marker too');

  // the four hand-kept chains (startGame x2, endGame x2) are the SWEEP now
  eq((src.match(/_edZoneMarkersVisible\(false\)/g) || []).length, 5,
    'five hide calls: toggleEditor close + the four replaced chains (startGame x2, endGame x2)');
  eq((src.match(/_edZoneMarkersVisible\(true\)/g) || []).length, 1,
    'one show call: toggleEditor open');
  eq((src.match(/setAudioZoneMarkersVisible\(false\)/g) || []).length, 0,
    'no hand-kept per-type hide call survives — the sweep is the only road');
  // the setters themselves stay (one-liners; a future panel may call them) — asserted so their
  // disappearance is a decision, not an accident
  assert(/function setAudioZoneMarkersVisible\(v\)/.test(src) && /function setLadderMarkersVisible\(v\)/.test(src),
    'the per-type setters still exist as functions');
}

done('build 1499: one table-derived sweep hides every authoring zone marker on every path into play — ' +
  'triggers included, flames and water exempt');
