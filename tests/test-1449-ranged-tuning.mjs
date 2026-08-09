// build 1449 — the five fields that decide how a ranged enemy behaves become level data.
//
// Build 1191 made hp/damage/speed per-level and stopped there. Fire rate, burst size, bolt speed, standoff
// and (1448) the aim wind-up were engine constants read straight off the type table by `spawnEnemy` — so a
// creator building a shooting range could not make the gunners fire slower, aim longer or stand further
// back. Those are the knobs a range IS.
//
// They are ABSOLUTE, unlike `spd`. A speed multiplier exists so a type's gait variance survives tuning; a
// fire rate has no variance to preserve, and "fires every 3 seconds" is what a creator thinks in.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const RANGED = JSON.parse(extractConst('ENEMY_MOD_RANGED', src).replace(/'/g, '"'));
eq(RANGED.length, 5, 'five ranged fields');
for (const f of ['fireCd', 'burst', 'projSpeed', 'standoff', 'aimMs'])
  assert(RANGED.includes(f), f + ' is one of them');

/* ---- EXECUTED: the sanitizer ------------------------------------------------------------------------ */
const san = (o) => new Function('O', `
  const ENEMY_TYPE_KEYS = ['grunt','gunner','brute'];
  ${extractFunction('_sanitizeEnemyMods', src)}
  return _sanitizeEnemyMods(O);
`)(o);

{
  eq(san(null), null, 'nothing in, nothing out');
  eq(san({}), null, '...and an empty object is still nothing, so a level with no tuning grows no key');
  eq(san({ gunner: {} }), null, '...even with an empty per-type entry');
}
{
  const r = san({ gunner: { fireCd: 3, burst: 4, projSpeed: 60, standoff: 25, aimMs: 700 } });
  eq(r.gunner.fireCd, 3, 'fire interval survives');
  eq(r.gunner.burst, 4, 'burst survives');
  eq(r.gunner.projSpeed, 60, 'bolt speed survives');
  eq(r.gunner.standoff, 25, 'standoff survives');
  eq(r.gunner.aimMs, 700, 'the aim wind-up survives');
}
{
  // THE CASE A TRUTHINESS TEST LOSES: build 1448's documented opt-out is aimMs 0, and it is the only value
  // in the object. Written as `e.hp!=null || e.dmg!=null || e.spd!=null` the whole entry was dropped.
  const r = san({ gunner: { aimMs: 0 } });
  assert(r && r.gunner, 'a mods object carrying ONLY aimMs:0 survives');
  eq(r.gunner.aimMs, 0, '...with the 0 intact, because 0 is a real authored value here');
  const r2 = san({ gunner: { standoff: 0 } });
  eq(r2.gunner.standoff, 0, 'and a standoff of 0 — walk right up — is authorable too');
  // pin the STATEMENT, never the bare phrase — this build's own comment names the removed form while
  // explaining why it went, which is the prose trap builds 164/1393/1395/1411/1421/1439/1441 all record
  assert(/if\(Object\.keys\(e\)\.length\)\{ out\[k\]=e; any=true; \}/.test(src),
    'the any-check counts KEYS rather than listing them, so the next field cannot be forgotten');
  assert(!/if\(e\.hp!=null \|\| e\.dmg!=null \|\| e\.spd!=null\)\{/.test(src),
    '...and the enumerated form is gone from the code, not merely described');
}
{
  // a level file is untrusted input (build 1325)
  const r = san({ gunner: { fireCd: 1e9, burst: 1e9, projSpeed: 1e9, standoff: 1e9, aimMs: 1e9 } });
  eq(r.gunner.fireCd, 60, 'fire interval ceiling');
  eq(r.gunner.burst, 20, 'burst ceiling');
  eq(r.gunner.projSpeed, 200, 'bolt speed ceiling');
  eq(r.gunner.standoff, 200, 'standoff ceiling');
  eq(r.gunner.aimMs, 3000, 'aim ceiling');
  const lo = san({ gunner: { fireCd: -5, burst: -5, projSpeed: -5, standoff: -5, aimMs: -5 } });
  eq(lo.gunner.fireCd, 0.05, 'and a floor that is a real value — a minigun, not a defensive minimum');
  eq(lo.gunner.burst, 1, 'at least one round');
  eq(lo.gunner.projSpeed, 2, 'a bolt that moves');
  eq(lo.gunner.standoff, 0, 'zero standoff is legitimate');
  eq(lo.gunner.aimMs, 0, '...as is an instant shot');
  eq(san({ gunner: { burst: 3.7 } }).gunner.burst, 4, 'burst is a whole number of rounds');
  eq(san({ gunner: { aimMs: 261.6 } }).gunner.aimMs, 262, '...and so is a millisecond');
  eq(san({ gunner: { fireCd: 'soon' } }), null, 'garbage is dropped, not coerced');
  eq(san({ notAType: { fireCd: 3 } }), null, 'and a type the engine does not have is dropped');
}

/* ---- EXECUTED: the derivation ----------------------------------------------------------------------- */
const eff = (mods, k) => new Function('MODS', 'K', `
  const RANGED_AIM_MS = 260;
  const ENEMY_MOD_RANGED = ${JSON.stringify(RANGED)};
  const ENEMY_BASE = { gunner: { hp: 40, dmg: 9, speedMin: 5, speedMax: 6,
                                 fireCd: 1.5, burst: 1, projSpeed: 24, standoff: 11, aimMs: 260 } };
  const gameCfg = { enemyMods: MODS };
  ${extractFunction('_enemyEff', src)}
  return _enemyEff(K);
`)(mods, k);

{
  const f = eff(null, 'gunner');
  eq(f.fireCd, 1.5, 'with no tuning the factory fire rate is used');
  eq(f.burst, 1, '...and burst');
  eq(f.projSpeed, 24, '...and bolt speed');
  eq(f.standoff, 11, '...and standoff');
  eq(f.aimMs, 260, '...and the aim window');
  eq(f.hp, 40, '...and build 1191’s own fields are untouched');
  near(f.speedMin, 5, 1e-9, '...including the speed multiplier path');
}
{
  const t = eff({ gunner: { fireCd: 4, standoff: 30 } }, 'gunner');
  eq(t.fireCd, 4, 'an authored fire rate wins');
  eq(t.standoff, 30, '...and an authored standoff');
  eq(t.burst, 1, '...while the fields the creator did NOT touch stay factory');
  eq(t.projSpeed, 24, '...all of them');
}
{
  eq(eff({ gunner: { aimMs: 0 } }, 'gunner').aimMs, 0,
    'an authored 0 is honoured, not read as "unset" — `!= null`, never falsiness');
  eq(eff({ gunner: { standoff: 0 } }, 'gunner').standoff, 0, '...the same for standoff');
}
{
  // an unknown type must not throw mid-wave
  const u = eff({ gunner: { fireCd: 4 } }, 'nosuchtype');
  eq(u.hp, 10, 'an unknown type falls back to the hardcoded shape');
  assert(u.fireCd === undefined || isFinite(u.fireCd), '...without producing NaN for the ranged fields');
}

/* ---- the spawn reads the DERIVED values, not the raw type ------------------------------------------- */
{
  const spawn = src.slice(src.indexOf('ranged: !!ty.ranged'), src.indexOf('ranged: !!ty.ranged') + 400);
  for (const f of RANGED)
    assert(new RegExp('\\b' + f + ': _eff\\.' + f).test(spawn),
      f + ' comes from _eff, so a level’s own tuning reaches the spawned enemy');
  assert(!/standoff: ty\.standoff/.test(spawn) && !/fireCd: ty\.fireCd/.test(spawn),
    '...and none of them still read the raw type table');
  assert(/burstGap: ty\.burstGap/.test(spawn),
    'burstGap deliberately stays on the type — the internal cadence of one burst is not a range’s dial');
}

/* ---- the baseline names each default ONCE ----------------------------------------------------------- */
// The `||` fallbacks spawnEnemy had always applied are now restated in the capture instead — so the
// baseline the editor shows as a placeholder and the value a spawn uses cannot disagree about "factory".
{
  const cap = src.slice(src.indexOf('const ENEMY_BASE = {};'), src.indexOf('const ENEMY_MOD_RANGED'));
  for (const [f, d] of [['fireCd', '1.5'], ['burst', '1'], ['projSpeed', '24'], ['standoff', '11']])
    assert(new RegExp(f + ':_t\\.' + f + '\\|\\|' + d.replace('.', '\\.')).test(cap),
      f + '’s factory default is captured with the same fallback the spawn used to apply');
  assert(/aimMs:\(_t\.aimMs!=null\)\?_t\.aimMs:RANGED_AIM_MS/.test(cap),
    '...and aimMs keeps its != null test, so a type authoring 0 is not overwritten by the constant');
}
// and that capture runs at BOOT, so everything it reads must be declared above it (the TDZ trap, six times)
assert(src.indexOf('const RANGED_AIM_MS') < src.indexOf('const ENEMY_BASE = {};'),
  'RANGED_AIM_MS is declared above the boot-time capture that reads it');
assert(src.indexOf('const ENEMY_TYPES') < src.indexOf('const ENEMY_BASE = {};'),
  '...as is the type table');

/* ---- the editor: only a type that shoots gets the row ----------------------------------------------- */
assert(/if\(ENEMY_TYPES\[ek\] && ENEMY_TYPES\[ek\]\.ranged\)\{/.test(src),
  'the five fields are shown only for a type that shoots — a fire rate on a melee grunt is a dead control');
for (const f of RANGED)
  assert(new RegExp("\\['" + f + "',").test(src), f + ' has an input in the grid');
assert(/placeholder=ph/.test(src) && /_base=\(f\)=>String\(\(ENEMY_BASE\[ek\]/.test(src),
  'every field shows its own factory value as the placeholder, so blank visibly means factory');
assert(/aimMs:'wind-up before the round leaves \(ms\)/.test(src),
  'and each carries a tooltip saying what it is in, because "standoff" is not self-explaining');

done('build 1449: fire interval, burst, bolt speed, standoff and the 1448 aim wind-up are per-level per-type ' +
     'now — absolute values, clamped on the way in, shown only on types that shoot, and every one of them ' +
     'able to hold an authored 0');
