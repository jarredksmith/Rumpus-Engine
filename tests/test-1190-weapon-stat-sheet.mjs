// build 1190: the full weapon stat sheet is authorable per level.
//
// The feature critic: "every level plays the same seven guns". Damage has been per-level since 623;
// fire rate, magazine, start/max ammo, spread, reload and pellets were engine constants. They now follow
// damage's exact pattern — a factory baseline captured at boot (GUN_BASE), only CHANGED values serialized
// (an `st` object per weapon), every loader resetting to base when a level carries nothing, and ONE
// clamped apply helper so a hostile level file cannot set a 0ms fire rate or 10,000 pellets through any
// loader. Also fixed on the way: startGame's hardcoded ammo reset covered four of seven guns — the pistol
// and launcher carried spent ammo across runs since build 976.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the apply helper, executed
const LIM = { fireRate: [30, 5000], magSize: [0, 999], reserve0: [0, 9999], reserveMax: [0, 9999], spread: [0, 0.5], reloadMs: [0, 10000], pellets: [1, 24] };
const mk = () => {
  const WEAPONS = { rifle: { fireRate: 95, magSize: 30, reserve0: 90, reserveMax: 270, spread: 0.0, reloadMs: 1100, pellets: 1 } };
  const GUN_BASE = { rifle: { ...WEAPONS.rifle } };
  const apply = new Function('WEAPONS', 'GUN_BASE', 'GUN_STAT_KEYS', 'GUN_STAT_LIM',
    extractFunction('_wepApplyStats') + '\nreturn _wepApplyStats;'
  )(WEAPONS, GUN_BASE, Object.keys(LIM), LIM);
  return { WEAPONS, apply };
};
{
  const t = mk();
  t.apply('rifle', { fireRate: 60, magSize: 45 });
  eq(t.WEAPONS.rifle.fireRate, 60, 'an authored stat lands');
  eq(t.WEAPONS.rifle.magSize, 45, '...each independently');
  eq(t.WEAPONS.rifle.reloadMs, 1100, '...and unauthored stats stay at factory');
  t.apply('rifle', null);
  eq(t.WEAPONS.rifle.fireRate, 95, 'a level with no sheet resets EVERYTHING to factory — tuning never leaks between levels');
}
{
  const t = mk();
  t.apply('rifle', { fireRate: 0, pellets: 5000, spread: -3, reloadMs: 'garbage' });
  eq(t.WEAPONS.rifle.fireRate, 30, 'a 0ms fire rate clamps to the floor (a hostile file cannot make a hitscan beam)');
  eq(t.WEAPONS.rifle.pellets, 24, '5,000 pellets clamps to 24 (one trigger pull is not a frame-killer)');
  eq(t.WEAPONS.rifle.spread, 0, 'negative spread clamps to 0');
  eq(t.WEAPONS.rifle.reloadMs, 1100, 'a non-numeric value falls back to factory, never NaN');
  t.apply('nosuch', { fireRate: 60 });   // unknown key: no throw
}

// ---------------------------------------------------------------- the round trip
{
  // serializer emits only CHANGED stats; loaders apply st through the one helper
  assert(/for\(const s of GUN_STAT_KEYS\)\{ if\(w\[s\]!=null && GUN_BASE\[k\] && w\[s\]!==GUN_BASE\[k\]\[s\]\)\{ \(st=st\|\|\{\}\)\[s\]=w\[s\]; \} \}/.test(src),
    'the serializer diffs against GUN_BASE — factory levels carry no sheet at all (623\'s pattern)');
  // build 1401: BOTH runtime loaders route through ONE `_applyLevelKit`, so counting copies of this line
  // counts the DUPLICATION rather than the behaviour — build 1280's lesson, and the reason the old count of
  // three could have gone green against three copies that had quietly diverged. It asserts the property now,
  // which is stronger: boot carries it, the one shared applier carries it, and both loaders reach that
  // applier.
  eq((src.match(/_wepApplyStats\(k, wd\.st\);/g) || []).length, 2, 'boot and the one shared applier apply the sheet');
  assert(/_wepApplyStats\(k, wd\.st\);/.test(extractFunction('_applyLevelKit')), '...and that applier is where the level paths do it');
  eq((src.match(/_applyLevelKit\(level\);/g) || []).length, 2, '...which BOTH loaders call, so neither can be forgotten');
  assert(/_wepApplyStats\(k, null\);/.test(extractFunction('_applyLevelKit')),
    '...and a weapon the level does not mention is reset to factory on every level path');
  // build 1296 added melee + reach to the sheet and normalises both on the live weapon first, because the
  // only-changed serializer compares against this baseline and `true !== 1` would emit a phantom override.
  // build 1303 added `windup` alongside 1296's melee/reach, normalised the same way and for the same reason.
  assert(/const GUN_BASE = \{\}; for\(const _k in WEAPONS\)\{ const _w=WEAPONS\[_k\];/.test(src) &&
         /_w\.melee = _w\.melee \? 1 : 0; _w\.reach = _w\.reach \|\| 3\.4;/.test(src) &&
         /GUN_BASE\[_k\]=\{ fireRate:_w\.fireRate, magSize:_w\.magSize, reserve0:_w\.reserve, reserveMax:_w\.reserveMax, spread:_w\.spread, reloadMs:_w\.reloadMs, pellets:_w\.pellets, melee:_w\.melee, reach:_w\.reach, windup:_w\.windup, kickV:_w\.kickV, kickH:_w\.kickH, adsMs:_w\.adsMs \}; _w\.reserve0=_w\.reserve; \}/.test(src),
    'the baseline is captured from the live table before any override — retuning a factory gun retunes its baseline everywhere');
}

// ---------------------------------------------------------------- the startGame reset
{
  assert(!/WEAPONS\.rifle\.mag=30; WEAPONS\.rifle\.reserve=90;/.test(src), 'the four hardcoded reset lines are gone');
  assert(/for\(const _wk in WEAPONS\)\{ const _w=WEAPONS\[_wk\]; if\(_w\.magSize>0\)\{ _w\.mag=_w\.magSize; _w\.reserve=Math\.min\(_w\.reserve0!=null\?_w\.reserve0:_w\.reserve, _w\.reserveMax\); \} \}/.test(src),
    'every gun resets from its (possibly authored) sheet — including the pistol and launcher, which had carried spent ammo across runs since 976');
  { // the loop reproduces the old hardcoded values exactly at factory settings
    const run = new Function('WEAPONS',
      "for(const _wk in WEAPONS){ const _w=WEAPONS[_wk]; if(_w.magSize>0){ _w.mag=_w.magSize; _w.reserve=Math.min(_w.reserve0!=null?_w.reserve0:_w.reserve, _w.reserveMax); } }\nreturn WEAPONS;");
    const W = run({
      rifle: { magSize: 30, reserve0: 90, reserveMax: 270, mag: 3, reserve: 0 },
      smg: { magSize: 40, reserve0: 120, reserveMax: 360, mag: 0, reserve: 5 },
      shotgun: { magSize: 6, reserve0: 24, reserveMax: 72, mag: 1, reserve: 2 },
      sniper: { magSize: 5, reserve0: 20, reserveMax: 60, mag: 0, reserve: 0 },
      pistol: { magSize: 12, reserve0: 48, reserveMax: 144, mag: 2, reserve: 7 },
      hands: { magSize: 0, mag: 0, reserve: 0 },
    });
    eq(W.rifle.mag, 30, 'rifle 30'); eq(W.rifle.reserve, 90, '/90 — byte-identical to the old lines');
    eq(W.smg.mag, 40, 'smg 40'); eq(W.smg.reserve, 120, '/120');
    eq(W.shotgun.mag, 6, 'shotgun 6'); eq(W.shotgun.reserve, 24, '/24');
    eq(W.sniper.mag, 5, 'sniper 5'); eq(W.sniper.reserve, 20, '/20');
    eq(W.pistol.mag, 12, 'the pistol finally resets too'); eq(W.pistol.reserve, 48, '...');
    eq(W.hands.mag, 0, 'melee (magSize 0) is untouched');
  }
}

// ---------------------------------------------------------------- the editor
{
  // build 1296: the sheet shows for EVERY weapon now — hiding it from melee weapons is what made the
  // crowbar's own reach and swing speed unauthorable. What a melee weapon does not get is the magazine
  // rows, which is the same intent expressed on the field list instead of on the whole panel.
  assert(/const _isM = !!WEAPONS\[curWep\]\.melee;/.test(src), 'the sheet asks whether this weapon is melee');
  assert(/\? \[ \['reach','Reach m',0\.1\], \['fireRate','Swing interval ms',10\], \['windup','Contact delay ms',10\] \]/.test(src),
    'a melee weapon gets reach and swing speed, not a magazine — fists have no magazine');
  for (const f of ["'fireRate','Fire interval ms'", "'magSize','Magazine'", "'reserve0','Start ammo'", "'reserveMax','Max ammo'", "'spread','Spread'", "'reloadMs','Reload ms'", "'pellets','Pellets'"])
    assert(src.indexOf('[' + f) > -1, 'the editor exposes ' + f.split(',')[1]);
  assert(/rs\.textContent='\\u21ba '\+GUN_BASE\[curWep\]\[sk\];/.test(src), 'every field carries a reset-to-factory button showing the factory value');
  assert(/_wepApplyStats\(curWep, keep\);/.test(src), 'the editor writes through the SAME clamped helper as the loaders — no second code path to drift');
}

done('build 1190: the full weapon stat sheet per level — fire rate, magazine, start/max ammo, spread, reload, pellets — factory baseline captured at boot, only diffs serialized, three loaders + the editor all writing through one clamped helper (hostile files proven clamped), startGame resetting every gun from the sheet and finally resetting the pistol and launcher too');
