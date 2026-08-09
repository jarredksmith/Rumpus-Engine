// build 1191: per-level enemy tuning — hp / damage / speed per type.
//
// The wave manifest (1179) authors COMPOSITION; the stat sheet (1190) authors the guns; the enemies
// themselves were engine constants. Now each type's hp, damage and speed are level-authorable through
// the same pattern: a factory baseline captured at boot (ENEMY_BASE), only-changed values serialized
// (gameCfg.enemyMods), ONE clamped sanitizer at every loader so a hostile file cannot ship a 99999-dmg
// grunt at 30x speed, and spawn-time application so the formula, manifests and placed spawns all
// inherit it with zero extra plumbing. Speed is a MULTIPLIER of the type's min AND max, so gait
// variance survives tuning.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();

const KEYS = ['grunt', 'runner', 'brute', 'gunner', 'sapper', 'shielded', 'charger', 'boss'];

// ---------------------------------------------------------------- the sanitizer, executed
{
  const san = new Function('ENEMY_TYPE_KEYS', extractFunction('_sanitizeEnemyMods') + '\nreturn _sanitizeEnemyMods;')(KEYS);
  eq(san(null), null, 'no mods = null (a factory level serializes nothing)');
  eq(san({}), null, 'an empty object collapses to null');
  eq(san({ grunt: {} }), null, '...even with empty per-type entries');
  { const o = san({ grunt: { hp: 40, dmg: 12, spd: 1.5 } });
    eq(o.grunt.hp, 40, 'authored hp lands'); eq(o.grunt.dmg, 12, '...dmg'); near(o.grunt.spd, 1.5, 1e-12, '...speed multiplier'); }
  { const o = san({ grunt: { hp: -5, dmg: 1e9, spd: 30 }, boss: { spd: 0.01 } });
    eq(o.grunt.hp, 1, 'hp clamps to 1 — a 0-hp army dies on spawn, which is a broken level, not a mode');
    eq(o.grunt.dmg, 999, 'damage clamps');
    near(o.grunt.spd, 3, 1e-12, 'speed clamps to 3x — a hostile file cannot ship teleporting grunts');
    near(o.boss.spd, 0.25, 1e-12, '...and 0.25x on the floor'); }
  { const o = san({ dragon: { hp: 9000 }, grunt: { hp: 'NaN' } });
    eq(o, null, 'unknown types and non-numeric values are dropped entirely'); }
}

// ---------------------------------------------------------------- the effective stats, executed
{
  // build 1449 gave _enemyEff five more fields driven by a table; this rig's subject is the hp/dmg/speed
  // derivation, so the table is LIFTED FROM SOURCE rather than restated — a rig that restates a dependency
  // keeps passing against a stale copy.
  const mk = (mods) => new Function('ENEMY_BASE', 'gameCfg',
    'const ENEMY_MOD_RANGED = ' + extractConst('ENEMY_MOD_RANGED') + ';\n' +
    extractFunction('_enemyEff') + '\nreturn _enemyEff;')(
    { grunt: { hp: 20, dmg: 10, speedMin: 4, speedMax: 7 } }, { enemyMods: mods });
  { const e = mk(null)('grunt');
    eq(e.hp, 20, 'no mods: factory hp'); eq(e.dmg, 10, '...dmg'); eq(e.speedMin, 4, '...speed'); eq(e.speedMax, 7, '...'); }
  { const e = mk({ grunt: { hp: 55, spd: 2 } })('grunt');
    eq(e.hp, 55, 'authored hp'); eq(e.dmg, 10, 'unauthored dmg stays factory');
    eq(e.speedMin, 8, 'the multiplier scales min'); eq(e.speedMax, 14, '...and max together — gait variance survives'); }
  { const e = mk(null)('nosuch');
    assert(e.hp > 0 && e.speedMax > 0, 'an unknown type yields sane fallbacks, never NaN'); }
}

// ---------------------------------------------------------------- the wiring
{
  // A pin that quotes a WHOLE literal is a pin against the literal (builds 519/928/1411/1447) — build 1449
  // legitimately added five more captured fields. The property is that the baseline is READ FROM the live
  // type table at boot rather than restated, so assert THAT.
  {
    const cap = src.slice(src.indexOf('const ENEMY_BASE = {};'), src.indexOf('const ENEMY_MOD_RANGED'));
    assert(/for\(const _ek of ENEMY_TYPE_KEYS\)\{ const _t=ENEMY_TYPES\[_ek\];/.test(cap),
      'the baseline is captured from the live type table at boot');
    for (const f of ['hp', 'dmg', 'speedMin', 'speedMax'])
      assert(new RegExp(f + ':_t\\.' + f).test(cap), '...including ' + f + ', read off the type');
  }
  assert(/const _eff = \(typeof _enemyEff==='function'\) \? _enemyEff\(typeKey\) : ty;/.test(src) &&
    /const _hp = Math\.round\(_eff\.hp \* _wr\);/.test(src) &&
    /hp:_hp, maxHp:_hp, speed: _eff\.speedMin \+ Math\.random\(\)\*\(_eff\.speedMax-_eff\.speedMin\), dmg:_eff\.dmg,/.test(src),
    'the factory spawns from effective stats — formula waves, manifests and placed spawns all inherit with zero plumbing (hp passes through the build-1213 random-mode wave ramp, which is 1x in every authored mode)');
  assert(/enemyMods: _sanitizeEnemyMods\(savedLevel && savedLevel\.game && savedLevel\.game\.enemyMods\)/.test(src),
    'the boot path sanitizes');
  eq((src.match(/gameCfg\.enemyMods = _sanitizeEnemyMods\(g\.enemyMods\);/g) || []).length, 1,
    '...and both loaders (net + restore) do — a joiner plays the host\'s tuning, and a level with none resets to factory (the sanitizer returns null)');
  assert(/enemyMods: _sanitizeEnemyMods\(gameCfg\.enemyMods\) \|\| undefined,/.test(src),
    'the serializer re-sanitizes on the way OUT too — nothing out-of-range ever enters a share code');
  assert(/<b>Enemy tuning<\/b>/.test(src) && /gameCfg\.enemyMods=_sanitizeEnemyMods\(o\);/.test(src),
    'the editor grid lives in the waves fold and writes through the same sanitizer');
  assert(/ip\.placeholder=ph/.test(src) || /placeholder=ph/.test(src),
    '...with each field\'s factory value as its placeholder, so blank visibly means factory');
}

done('build 1191: per-level enemy tuning — hp/damage/speed-multiplier per type, factory baseline at boot, one clamped sanitizer on every path in AND out (hostile files proven clamped: hp floor 1, dmg cap 999, speed 0.25-3x), spawn-time application covering formula waves, manifests and placed spawns alike, edited from a grid in the waves fold where blank means factory');
