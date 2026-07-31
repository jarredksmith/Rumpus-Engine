// build 1240: rename weapons — reported from play: "add a sword/handheld weapon (axe, staff)... we
// have melee, so maybe the answer is just the ability to rename." It is: every display site already
// reads WEAPONS[k].name live (HUD, wheel, kill feed, pickup labels, loadout picker, attachments), so
// an authored name renames the weapon everywhere. 1190's exact pattern: factory baseline at boot,
// only-changed serialized (nm), one sanitizer every loader routes through, blank restores factory.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the sanitizer, executed
const CORE = extractFunction('_wepApplyName');
const drive = (nm) => new Function(
  "const WEAPONS = { fists: { name: 'Fists' } }; const GUN_BASE_NAME = { fists: 'Fists' };\n" +
  CORE + "\n_wepApplyName('fists', arguments[0]);\nreturn WEAPONS.fists.name;")(nm);
{
  eq(drive('Sword'), 'Sword', 'a rename lands');
  eq(drive('  Longsword  '), 'Longsword', '...trimmed');
  eq(drive(''), 'Fists', 'blank restores the factory name');
  eq(drive(null), 'Fists', '...so does clearing');
  eq(drive('X'.repeat(80)), 'X'.repeat(24), 'a hostile name caps at 24 chars');
  const r = new Function(
    "const WEAPONS = { fists: { name: 'Fists' } }; const GUN_BASE_NAME = {};\n" +
    CORE + "\n_wepApplyName('fists', '');\nreturn WEAPONS.fists.name;")();
  eq(r, 'fists', 'no baseline recorded still yields the key, never undefined');
}

// ---------------------------------------------------------------- the wiring: baseline, both loaders, the diff
{
  assert(/const GUN_BASE_NAME = \{\}; for\(const _k in WEAPONS\) GUN_BASE_NAME\[_k\] = WEAPONS\[_k\]\.name;/.test(src),
    'the factory names are captured at boot, before anything can rewrite them');
  eq((src.match(/_wepApplyName\(k, wd\.nm\);/g) || []).length, 2,
    'BOTH loaders (boot restore + restoreLevel/net) apply the authored name');
  assert(/else \{ _wepApplyStats\(k, null\); _wepApplyName\(k, null\); \}/.test(src),
    'a weapon with no entry plays factory — name included (loading level B after renamed level A cannot leak the sword)');
  assert(/const nmChg = \(typeof GUN_BASE_NAME!=='undefined' && GUN_BASE_NAME\[k\] && w\.name!==GUN_BASE_NAME\[k\]\);/.test(src) &&
         /nm: nmChg \? w\.name : undefined/.test(src),
    'the serializer writes nm only when it differs from factory — untouched levels byte-identical');
  assert(/\|\| st \|\| nmChg\)/.test(src), '...and a rename ALONE is enough to earn the weapon an entry');
}
{ // the editor UI
  assert(/ninp\.maxLength=24/.test(src) && /ninp\.placeholder=GUN_BASE_NAME\[curWep\]\|\|curWep/.test(src),
    'the Name field caps at 24 and shows the factory name as its placeholder');
  assert(/_wepApplyName\(curWep, ninp\.value\);/.test(src) && /_wepApplyName\(curWep, null\);/.test(src),
    'typing renames, Default restores — both through the one sanitizer');
  assert(/if\(typeof updateHUD==='function'\) updateHUD\(\); renderEditorFields\(\);/.test(src),
    '...and the HUD + panel refresh so the new name shows immediately');
}

done('build 1240: weapon rename — the sanitizer executed (trim, 24-char cap, blank-restores-factory, key fallback with no baseline), the factory baseline captured at boot, both loaders apply nm with the no-entry branch restoring factory so names never leak across levels, the serializer diffs against factory so untouched levels are byte-identical, and the Kit panel Name field routes everything through the one function');
