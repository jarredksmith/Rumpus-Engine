import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1322 — the three remaining editor-audit 4.11 bullets that are not architecture:
//
//   "Transform fields show 5 decimal places for a position in metres."
//   "The outliner renders one DOM row per object with no virtualisation, rebuilt on a 160 ms coalesce
//    during edits."
//   "libOpen does not ask before replacing unsaved work; it relies on 1254's one-deep rescue."
//
// Measured live (tools/probe/outliner-scale.mjs), real _outRefresh, 10 DOM nodes per row:
//     56 rows  2.88 ms    256 rows   8.72 ms
//    106 rows  3.82 ms    456 rows  19.64 ms     superlinear, 0.019 -> 0.042 ms/row
// After, at 456 rows:  unchanged 0.12 ms   a gizmo drag 0.16 ms   GENUINELY CHANGED 14.84 ms
// — so the WASTED rebuild is gone and the real one is not. Virtualisation is still absent, deliberately.

// ---------------------------------------------------------------- 1. precision is per channel
{
  assert(/const STEP_POS = 0\.01, STEP_ROT = 0\.1, STEP_SCALE = 0\.01;/.test(src),
    'the steps are a centimetre, a tenth of a degree and a centimetre of size…');
  assert(!/const STEP_POS = 0\.00001/.test(src), '…not the hundred-thousandths that made an arrow key nudge 0.01 mm');
  const dp = (new Function('return (' + (src.match(/const FIELD_DP = (\{[^}]*\});/) || [])[1] + ')'))();
  eq(dp.p, 3, 'position to the millimetre');
  eq(dp.r, 2, 'rotation to a hundredth of a degree');
  eq(dp.s, 3, 'scale to the millimetre');
  // executed: the formatter picks by channel and TRIMS, which is most of the readability win
  const f = new Function('FIELD_DP',
    src.match(/const _fieldDp = [^\n]*\n/)[0] + src.match(/const _fmtField = [^\n]*\n/)[0] +
    '; return { dp:_fieldDp, fmt:_fmtField };')(dp);
  eq(f.dp('px'), 3); eq(f.dp('rx'), 2); eq(f.dp('sy'), 3);
  eq(f.dp('s'), 3, 'the uniform-scale field is a scale too');
  eq(f.fmt(12, 'px'), '12', 'a wall at x=12 reads "12", not "12.00000"');
  eq(f.fmt(1.6, 'sy'), '1.6', 'and 1.6 reads "1.6", not "1.60000"');
  eq(f.fmt(0, 'py'), '0');
  eq(f.fmt(1.23456, 'px'), '1.235', 'a real position rounds to the millimetre');
  eq(f.fmt(-0.0004, 'px'), '0', 'and a sub-millimetre residue reads as zero rather than "-0.00040"');
  eq(f.fmt(45.678, 'ry'), '45.68', 'degrees to a hundredth');
  // every display site moved, or one field would still print five
  eq((src.match(/_fmtField\(/g) || []).length, 5, 'all five display sites use it');
  assert(!/\.toFixed\(5\)/.test(extractFunction('renderEditorFields')), 'and none of them is toFixed(5) any more');
  // ...but the code emitter keeps five, because that is a different job
  assert(/const fmt = n => \(\+n\)\.toFixed\(5\);/.test(src), 'the copy-paste code emitter still bakes five digits');
  assert(/where the extra digits are the whole point/.test(src), '...with the reason it is exempt');
}

// ---------------------------------------------------------------- 2. the outliner stops rebuilding for nothing
{
  const sig = extractFunction('_outSignature');
  // it must cover everything a row can RENDER — a field that is displayed but not signed is a stale panel
  for (const bit of ['it.name', 'it.tag', 'it.folder', 'u.edHide', 'u.edLock', '_outIsSel(kind, it)'])
    assert(sig.indexOf(bit) > 0, 'the signature covers ' + bit);
  for (const bit of ['_outSearch', '_outTag', 'selProps.length', 'editorActive', 'selPickup'])
    assert(sig.indexOf(bit) > 0, '...and the panel-level state: ' + bit);
  assert(/for\(const k in _outFolds\) p\.push\(k, _outFolds\[k\] \? 1 : 0\);/.test(sig),
    '...and the fold state, which a click changes and nothing else would');
  assert(/p\.push\(kind, items\.length\)/.test(sig), '...and the COUNT, so an add or delete always repaints');
  // the skip itself
  const ref = extractFunction('_outRefresh');
  assert(/if\(sig === _outSig && b0 && b0\.children\.length\) return;/.test(ref), 'an unchanged signature skips the rebuild…');
  assert(/b0 && b0\.children\.length/.test(ref),
    '…but only once the body has actually been built, or an empty panel with a stale signature stays empty forever');
  assert(ref.indexOf('_outSig = sig;') > ref.indexOf('if(sig === _outSig'), 'and the new signature is stored after the test');
  // the measurement, and the honesty about what it does NOT fix
  assert(/456 rows  19\.64 ms/.test(src) || /456 rows 19\.64 ms/.test(src), 'the before measurement is recorded');
  assert(/a transform appears nowhere/.test(src),
    'with the reason the work was wasted: the outliner shows names, tags, folders, hide⁄lock and selection');
  assert(/a virtualised tree remains absent and is a separate build with its own measurement/.test(src),
    'and the claim is scoped — this is not virtualisation and does not pretend to be');
  // selection helper matches what _outRowEl actually paints, or the signature and the DOM disagree
  const isSel = extractFunction('_outIsSel'), row = extractFunction('_outRowEl');
  for (const k of ['selProps.indexOf(o)>=0', 'selLights.indexOf(o)>=0', 'selSpawns.indexOf(o)>=0'])
    assert(isSel.indexOf(k) > 0 && row.indexOf(k) > 0, 'signature and row agree on selection: ' + k);
  assert(/selPickup===it\.i/.test(isSel) && /selPickup===it\.i/.test(row), '...including pickups, which have no object');
}

// ---------------------------------------------------------------- 3. opening a library level asks first
{
  const open = extractFunction('libOpen');
  assert(/if\(typeof _levelDirty!=='undefined' && _levelDirty && typeof uiConfirm==='function'\)\{/.test(open),
    'it asks only when there is something to lose…');
  assert(/uiConfirm\('You have unsaved changes\./.test(open), '…naming what is at stake');
  assert(/'Discard and open'\)/.test(open), '...with a button that says what it does');
  assert(/return;\n  \}\n  _libOpenNow\(id, cb\);/.test(open), 'and a clean cancel — the level is untouched');
  // the work moved wholesale, so no caller has to know
  const now = extractFunction('_libOpenNow');
  assert(/restoreLevel\(lvl\)/.test(now) && /_libCurrent=id/.test(now), 'the actual open is intact, just moved');
  assert(!/restoreLevel/.test(open), 'libOpen itself no longer restores — it is the gate');
  assert(/every future entry point inherits it/.test(src), 'with the reason it is in libOpen and not the call site');
  assert(/a prompt on every open would be trained away in a week/.test(src),
    'and the reason it is conditional rather than unconditional');
  // 1254's rescue is a backstop, not the consent
  assert(/A rescue you have to know about is not consent/.test(src), 'the audit’s point is stated');
}

done('build 1322 (editor audit 4.11, the rest): transform fields showed FIVE decimal places for a position in metres — ten microns — with a matching step that made an arrow key nudge a prop by 0.01 mm, so the most-used panel in the editor was both unreadable and useless from the keyboard. Precision is per channel now (mm, hundredths of a degree, mm) with trailing zeros trimmed, so a wall at x=12 reads "12"; the copy-paste code emitter keeps its five digits because that is a different job. The outliner rebuilt every row on a 160 ms coalesce during edits — measured with the real function at 10 DOM nodes per row: 56 rows 2.88 ms rising SUPERLINEARLY to 456 rows 19.64 ms, ~123 ms/s of pure teardown while a gizmo drag keeps firing it, and every one of those rebuilds wasted because a transform is not something the outliner displays. A signature of exactly what the panel shows now gates the rebuild: at 456 rows an unchanged refresh went 19.64 -> 0.12 ms and a gizmo drag costs 0.16 ms, while a GENUINELY changed list still costs 14.84 ms — the waste is gone, the real work is not, and virtualisation is still absent and said to be. And libOpen now asks before discarding unsaved work instead of relying on a rescue the creator has to already know about');
