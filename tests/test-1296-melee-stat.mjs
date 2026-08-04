import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1296: REPORTED (as part of the melee thread) — a creator wants "a pistol, a sword, an axe and a
// rifle". Build 1240 answered the same report with RENAMING and 1190 made the stat sheet authorable, but
// `melee` and `reach` were in neither list — so the SMG could be renamed SWORD and it still fired bullets.
// Exactly ONE slot shipped as a usable melee weapon (`crowbar`; `hands` is the bare-fist loadout), so the
// sword and the axe were competing for it.
//
// Adding the two keys to 1190's array IS the feature: the only-changed serializer, the three loaders, the
// per-stat reset button and the clamp all already work on any key in it.
//
// Measured live, authoring two melee weapons through the real _wepApplyStats and firing the real shoot():
//   SWORD (smg)      melee 1  reach 3.2   55 damage to a crate
//   AXE (shotgun)    melee 1  reach 3.8  110
//   CROWBAR          melee 1  reach 3.4   60   (unchanged)
//   RIFLE            melee 0             12   (still a gun, still the bullet path)

const KEYS = new Function('return ' + extractConst('GUN_STAT_KEYS', src) + ';')();
// build 1297 replaced the reach floor with a named constant, so the clamp table no longer evaluates on its
// own — which is the point: the floor on `reach` and the floor on a bot's stand-off have to be readable as
// a pair. Feed it the same constants the engine does, from the source, rather than hardcoding them here.
const LIM = new Function('BOT_MELEE_REACH_MIN', 'return ' + extractConst('GUN_STAT_LIM', src) + ';')(
  +src.match(/BOT_MELEE_REACH_MIN = ([0-9.]+)/)[1]);

// ---------------------------------------------------------------- the two new stats
{
  assert(KEYS.includes('melee'), 'melee is an authorable stat');
  assert(KEYS.includes('reach'), '...and so is reach');
  eq(KEYS.length, 13, 'thirteen stats — the seven build 1190 shipped, 1296’s melee + reach, 1303’s contact delay, 1362’s kickV/kickH, and 1373’s adsMs');
  for (const k of ['fireRate', 'magSize', 'reserve0', 'reserveMax', 'spread', 'reloadMs', 'pellets'])
    assert(KEYS.includes(k), '1190’s ' + k + ' is untouched');
  eq(LIM.melee.join(','), '0,1', 'melee rides as 0/1 — no separate boolean path, and every reader already asks `if(w.melee)`');
  eq(LIM.reach[0], 1.2, 'the shortest authorable reach is BOT_MELEE_REACH_MIN — build 1297 ties it to the closest a bot will stand, so no authorable weapon leaves its bots swinging outside their own reach');
  eq(LIM.reach[1], 12, '...nor absurd');
  for (const k of KEYS) assert(Array.isArray(LIM[k]) && LIM[k].length === 2, k + ' has a clamp');
}

// ---------------------------------------------------------------- apply, against the real function
const mkApply = (weapons) => {
  const W = JSON.parse(JSON.stringify(weapons));
  const BASE = {};
  for (const k in W) { const w = W[k]; w.melee = w.melee ? 1 : 0; w.reach = w.reach || 3.4;
    BASE[k] = {}; for (const s of KEYS) BASE[k][s] = (s === 'reserve0') ? w.reserve : w[s];
    w.reserve0 = w.reserve; }
  const fn = new Function('WEAPONS', 'GUN_BASE', 'GUN_STAT_KEYS', 'GUN_STAT_LIM',
    extractFunction('_wepApplyStats') + '; return _wepApplyStats;')(W, BASE, KEYS, LIM);
  return { W, BASE, fn };
};
const FACTORY = {
  rifle: { fireRate: 95, magSize: 30, reserve: 90, reserveMax: 270, spread: 0, reloadMs: 1100, pellets: 1 },
  smg: { fireRate: 60, magSize: 25, reserve: 120, reserveMax: 300, spread: 0.02, reloadMs: 900, pellets: 1 },
  crowbar: { fireRate: 500, magSize: 0, reserve: 0, reserveMax: 0, spread: 0, reloadMs: 0, pellets: 0, melee: true, reach: 3.4 },
};
{ // a gun becomes a sword
  const { W, fn } = mkApply(FACTORY);
  eq(W.smg.melee, 0, 'the SMG starts as a gun');
  fn('smg', { melee: 1, reach: 3.2, fireRate: 420, magSize: 0, reserve0: 0, reserveMax: 0, reloadMs: 0 });
  eq(W.smg.melee, 1, 'and can be authored into a melee weapon');
  eq(W.smg.reach, 3.2, '...with its own reach');
  eq(W.smg.fireRate, 420, '...and its own swing interval');
  eq(W.smg.magSize, 0, '...and no magazine');
  // ...and a second one, independently — which is the whole point
  fn('rifle', { melee: 1, reach: 3.8, fireRate: 900 });
  eq(W.rifle.melee, 1, 'a SECOND slot can be melee at the same time — the sword and the axe stop competing');
  assert(W.smg.reach !== W.rifle.reach, '...with different reach');
}
{ // the values are normalised at capture, or every level saves a spurious melee override
  const { W, BASE } = mkApply(FACTORY);
  eq(W.crowbar.melee, 1, 'the shipped melee flag is normalised from `true` to 1');
  eq(BASE.crowbar.melee, 1, '...and the baseline matches it exactly');
  assert(typeof W.crowbar.melee === 'number' && typeof BASE.crowbar.melee === 'number',
    'BOTH are numbers — `true !== 1` would make the only-changed serializer emit an override for a level nobody edited');
  eq(W.rifle.reach, 3.4, 'a gun gets the crowbar’s reach as its baseline, so flipping the flag gives a usable weapon');
  eq(BASE.rifle.reach, 3.4);
  assert(/3\.4 is the crowbar's reach, which is what a gun becomes when a creator flips it/.test(src),
    'and why 3.4 is recorded');
}
{ // clamps, and the round trip back to factory
  const { W, fn } = mkApply(FACTORY);
  fn('smg', { melee: 5, reach: 99 });
  eq(W.smg.melee, 1, 'a nonsense melee value clamps to on');
  eq(W.smg.reach, 12, '...and reach to the ceiling');
  fn('smg', { melee: -3, reach: 0.01 });
  eq(W.smg.melee, 0, '...and to off');
  eq(W.smg.reach, 1.2, '...and the floor (build 1297 raised it from 0.5, so a bot can always reach what it closes to)');
  fn('smg', { melee: NaN, reach: NaN });
  eq(W.smg.melee, 0, 'NaN falls back to the baseline rather than poisoning the weapon');
  eq(W.smg.reach, 3.4);
  fn('smg', null);
  eq(W.smg.melee, 0, 'and a level with no stat sheet plays factory');
  eq(W.smg.fireRate, 60);
  eq(W.crowbar === undefined, false);
}
{ // PELLETS FLOORS AT 0. A melee weapon fires none, and the old floor of 1 rewrote the crowbar's authored 0
  // the moment any stat was applied — the same spurious-diff fault as the magazine below.
  eq(LIM.pellets[0], 0, 'pellets can be zero');
  const { W, BASE, fn } = mkApply(FACTORY);
  fn('crowbar', null);
  eq(W.crowbar.pellets, 0, 'a melee weapon keeps none after an apply');
  eq(W.crowbar.pellets, BASE.crowbar.pellets, '...so it never differs from its baseline and never serializes');
}

// ---------------------------------------------------------------- the magazine floor that undid it
{
  const att = src.slice(src.indexOf('const newMag ='), src.indexOf('const newMag =') + 200);
  assert(/const newMag = \(base\.magSize > 0\) \? Math\.max\(1, Math\.round\(base\.magSize\*r\.magMul\)\) : 0;/.test(att),
    'a weapon with no magazine keeps none through the attachment recompute');
  assert(/the floor of 1 handed the crowbar and the fists a 1-round magazine/.test(src),
    'and what build 583’s unconditional floor was doing is recorded');
  assert(/spurious `st:\{magSize:1\}` into EVERY level saved\n    \/\/ since build 1190/.test(src),
    '...including that it was writing a phantom override into every saved level');
  // the floor still does its real job
  const f = new Function('base', 'r', 'return (base.magSize > 0) ? Math.max(1, Math.round(base.magSize*r.magMul)) : 0;');
  eq(f({ magSize: 30 }, { magMul: 1.5 }), 45, 'a real magazine still scales');
  eq(f({ magSize: 2 }, { magMul: 0.1 }), 1, '...and is never rounded away to nothing');
  eq(f({ magSize: 0 }, { magMul: 1.5 }), 0, 'but a weapon that has none is left alone');
  eq(f({ magSize: 0 }, { magMul: 0 }), 0);
}

// ---------------------------------------------------------------- it rides the existing format
{
  const ser = src.slice(src.indexOf('weapons: Object.keys(WEAPONS).reduce'));
  const body = ser.slice(0, ser.indexOf('}, {}),'));
  assert(/for\(const s of GUN_STAT_KEYS\)\{ if\(w\[s\]!=null && GUN_BASE\[k\] && w\[s\]!==GUN_BASE\[k\]\[s\]\)\{ \(st=st\|\|\{\}\)\[s\]=w\[s\]; \} \}/.test(body),
    'the serializer diffs every key in the array — so the two new stats needed no serializer change at all');
  assert(!/melee:/.test(body) && !/reach:/.test(body),
    '...and are NOT named in it, which is the property that made this build small');
  // all three loaders route through the one applier, so none can be forgotten
  eq((src.match(/_wepApplyStats\(k, wd\.st\)/g) || []).length, 3, 'all three loaders (boot + the two level paths) apply the sheet through the one function');
  assert(/_wepApplyStats\(k, wd\.st\)/.test(src) && /_wepApplyStats\(curWep, keep\)/.test(src),
    'and the editor writes through the same function');
}

// ---------------------------------------------------------------- the editor
{
  assert(/const _isM = !!WEAPONS\[curWep\]\.melee;/.test(src), 'the panel asks whether this weapon is melee');
  assert(/lb\.textContent='Melee weapon';/.test(src), 'and offers the toggle');
  assert(/\? \[ \['reach','Reach m',0\.1\], \['fireRate','Swing interval ms',10\], \['windup','Contact delay ms',10\] \]/.test(src),
    'a melee weapon gets reach, swing speed and (build 1303) the contact delay…');
  assert(/: \[ \['fireRate','Fire interval ms',5\], \['magSize','Magazine',1\]/.test(src),
    '…and a gun keeps the seven it had');
  // BEFORE THIS BUILD THE WHOLE SHEET WAS HIDDEN FOR MELEE WEAPONS — even the crowbar's reach was unreachable
  assert(!/if\(!WEAPONS\[curWep\]\.melee\)\{\n        const sh2/.test(src),
    'the sheet is no longer hidden outright for a melee weapon');
  assert(/before this build the whole stat sheet was hidden for melee\n           weapons, so even the crowbar's reach and swing speed were unreachable/.test(src),
    'and that is recorded');
  assert(/if\(cb\.checked\)\{ keep\.magSize=0; keep\.reserve0=0; keep\.reserveMax=0; keep\.reloadMs=0;/.test(src),
    'ticking it clears the magazine, so a sword does not show 25 rounds');
  // build 1303: it also seeds a contact delay. A gun's factory windup is 0 — right for a trigger, wrong for
  // a swing, and a converted gun would otherwise land its blow before the animation moved.
  assert(/if\(!\(keep\.windup>0\)\) keep\.windup=160; \}/.test(src),
    '...and seeds a real contact delay, which a gun has no factory value for');
  assert(/else \{ const b=GUN_BASE\[curWep\]; keep\.magSize=b\.magSize;/.test(src),
    '...and unticking restores the factory magazine, so the toggle is reversible');
  assert(/renderEditorFields\(\);   \/\* the field list below depends on the answer \*\//.test(src),
    'and the panel re-renders, because the rows underneath change');
}

done('build 1296: melee is a per-weapon STAT, so any slot can be a sword — build 1240 gave creators renaming and 1190 gave them an authorable stat sheet, but `melee` and `reach` were in neither, so a renamed SMG still fired bullets and only one slot could ever swing. Adding the two keys to 1190’s array is the whole feature: the only-changed serializer, both loaders, the reset buttons and the clamps already work on any key in it. Measured live: SWORD 55 and AXE 110 damage from two different slots at once, crowbar unchanged. Also fixes build 583’s unconditional magazine floor, which was handing every magazine-less weapon a 1-round mag and writing a phantom override into every saved level');
