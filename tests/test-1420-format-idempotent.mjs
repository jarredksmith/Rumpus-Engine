// build 1420: saving a level twice produces the same level.
//
// Build 1418 asked whether `serialize -> restore -> serialize` is idempotent, found a light's colour
// decaying to red, and deferred four smaller differences rather than folding them into a colour fix. This
// closes them — and the point is not the four, it is that `tools/probe/level-roundtrip.mjs` is now BYTE
// CLEAN on a 58-key, 59-prop level with every subsystem in it, so it becomes a standing guard: any future
// field that fails to survive a save fails there instead of being discovered by a creator.
//
// Two of the four were the engine and two were the probe's own fixture, which is worth stating because
// three of the four looked identical in the diff:
//
//   ENGINE  st.melee wrote `true` on the first save and `1` on every one after it
//   ENGINE  aimWep grew a full seven-field ADS pose per weapon simply from PLAYING the level
//   fixture a prop's health lives in `maxHp`; the fixture set `hp`, which the serializer does not read
//   fixture widgets minted raw have no id, and the serializer sanitizes into a COPY — the editor's own
//           Add button pushes through the sanitizer, so a real widget has an id from birth
//   fixture animCuts fields are n/s/a/b/f; an unnamed slice is discarded by design
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. a boolean stat, executed
//
// `melee` lives as `true` on the factory table and as 0/1 everywhere else — build 1296 normalises where
// GUN_BASE is captured, and `_wepApplyStats` clamps on load. So a straight `!==` against the baseline wrote
// the raw `true` once and the clamped `1` thereafter.
{
  const mk = (weapons, base, keys) => {
    const fn = new Function('WEAPONS', 'GUN_BASE', 'GUN_STAT_KEYS', 'GUN_BASE_DMG', 'GUN_BASE_NAME', 'Object',
      'const k = "smg", w = WEAPONS[k];' +
      src.match(/let st; for\(const s of GUN_STAT_KEYS\)\{[\s\S]*?\(st=st\|\|\{\}\)\[s\]=_v; \} \}/)[0] +
      '; return st;');
    return fn(weapons, base, keys, {}, {}, Object);
  };
  const KEYS = ['melee', 'reach', 'dmg'];
  const BASE = { smg: { melee: 0, reach: 3.4, dmg: 8 } };

  eq(JSON.stringify(mk({ smg: { melee: true, reach: 3.4, dmg: 8 } }, BASE, KEYS)), '{"melee":1}',
    'a melee flag set as `true` serializes as the NUMBER its baseline is — so the first save and the ' +
    'second write the same bytes');
  eq(mk({ smg: { melee: false, reach: 3.4, dmg: 8 } }, BASE, KEYS), undefined,
    '...and `false` against a baseline of 0 is no change at all, so it writes nothing');
  // the case that matters for a MELEE weapon's own factory row: baseline 1, live `true` -> no change.
  // (Against a baseline of 0, `melee:1` IS a change and correctly writes — my first version of this
  // assertion tested that and called it "already equal".)
  eq(mk({ smg: { melee: true, reach: 3.4, dmg: 8 } }, { smg: { melee: 1, reach: 3.4, dmg: 8 } }, KEYS), undefined,
    'a weapon whose factory row is already melee writes nothing when it is still melee, whichever form ' +
    'the live value arrived in');
  eq(JSON.stringify(mk({ smg: { melee: false, reach: 3.4, dmg: 8 } }, { smg: { melee: 1, reach: 3.4, dmg: 8 } }, KEYS)), '{"melee":0}',
    '...and turning that one OFF writes the number, not `false`');
  eq(JSON.stringify(mk({ smg: { melee: 0, reach: 3.2, dmg: 8 } }, BASE, KEYS)), '{"reach":3.2}',
    'a genuinely changed number still rides, which is what the diff exists for');
  // the normalisation must not touch non-booleans
  eq(JSON.stringify(mk({ smg: { melee: 0, reach: 3.4, dmg: 15 } }, BASE, KEYS)), '{"dmg":15}',
    '...and a number is passed through untouched');
}

// ---------------------------------------------------------------- 2. the ADS poses, executed
//
// `getWeaponAim` creates an entry lazily the first time a weapon is aimed, so simply PLAYING a level grew
// `aimWep` by a full pose per weapon — and a level saved after play differed from the same level saved
// before it, with 56 redundant numbers in between.
{
  const AIM_DEFAULT = { x: 0, y: -0.02, z: -0.4, rx: 0, ry: 0, rz: 0, fov: 55 };
  const mk = (aimByWep) => new Function('aimByWep', 'AIM_DEFAULT', 'Object',
    'return (' + src.match(/\(function\(\)\{ const o=\{\}; let any=false;[\s\S]*?return any \? o : undefined; \}\)/)[0] + ')();'
  )(aimByWep, AIM_DEFAULT, Object);

  eq(mk({ rifle: Object.assign({}, AIM_DEFAULT) }), undefined,
    'a weapon whose pose equals the default writes NOTHING — this is the whole of it, because that entry ' +
    'appears merely from aiming the weapon once');
  eq(mk({ rifle: Object.assign({}, AIM_DEFAULT), smg: Object.assign({}, AIM_DEFAULT) }), undefined,
    '...however many of them there are');
  {
    const r = mk({ rifle: Object.assign({}, AIM_DEFAULT), sniper: Object.assign({}, AIM_DEFAULT, { fov: 20 }) });
    eq(Object.keys(r).join(','), 'sniper', 'an AUTHORED pose rides, and only that one');
    eq(r.sniper.fov, 20, '...with its value');
    eq(r.sniper.x, AIM_DEFAULT.x, '...and the rest of the pose, since a partial pose is not a pose');
  }
  eq(mk({}), undefined, 'no poses at all writes no key');
  eq(mk({ rifle: null }), undefined, 'a hole in the map is skipped rather than thrown on');
  // a value that differs only by TYPE is not a change — it would otherwise reintroduce exactly the churn
  // this build removes
  eq(mk({ rifle: Object.assign({}, AIM_DEFAULT, { fov: String(AIM_DEFAULT.fov) }) }), undefined,
    'and a numeric string equal to the default is not a change (the comparison coerces)');
}

// ---------------------------------------------------------------- and the load side still works
{
  // omitting the defaults is only safe because a weapon with no entry gets one on demand
  const g = extractFunction('getWeaponAim');
  assert(/if\(!aimByWep\[key\]\) aimByWep\[key\]=Object\.assign\(\{\}, AIM_DEFAULT\)/.test(g),
    'a weapon with no saved pose gets AIM_DEFAULT on demand, which is what makes omitting them lossless');
  // ...and the legacy branch keys on the KEY being absent, not on a particular weapon being in it
  assert(/if\(level\.aim\)\{[^\n]*if\(!level\.aimWep\)\{/.test(src),
    'the legacy single-pose branch keys on aimWep being ABSENT, so a level that authored one pose still ' +
    'takes the modern path');
  assert(/if\(level\.aimWep\)\{ for\(const k in level\.aimWep\) aimByWep\[k\]=Object\.assign\(\{\}, AIM_DEFAULT, level\.aimWep\[k\]\); \}/.test(src),
    'and a saved pose is merged ONTO the default, so a partial entry cannot arrive incomplete');
}

// ---------------------------------------------------------------- the property, stated where it is checked
{
  assert(/build 1420/.test(src.slice(src.indexOf('let st; for(const s of GUN_STAT_KEYS)') - 200, src.indexOf('let st; for(const s of GUN_STAT_KEYS)') + 600)),
    'the normalisation says why it is there');
  assert(/only the poses a creator CHANGED/.test(src),
    '...and so does the pose diff');
  const rt = src.indexOf('only the poses a creator CHANGED');
  assert(rt > 0 && src.indexOf('aimWep:', rt) - rt < 1200,
    '...beside the field it describes, rather than somewhere a reader has to go looking for it');
}

done('build 1420: saving a level twice produces the same level — the round trip is byte clean');
