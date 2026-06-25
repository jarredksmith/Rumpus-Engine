import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 623: per-weapon DAMAGE is editable (editor gun panel) and persists with the level. Factory damage is
// captured once (GUN_BASE_DMG) so only a CHANGED damage is serialized and old levels keep the defaults.

// factory damage captured before any saved override is applied
assert(/const GUN_BASE_DMG = \{\}; for\(const _k in WEAPONS\) GUN_BASE_DMG\[_k\] = WEAPONS\[_k\]\.dmg;/.test(src), 'base damages captured up-front');

// startup + loadLevel + import all restore a saved per-weapon damage (default when absent)
assert(/if\(wd\.dmg!=null\) WEAPONS\[k\]\.dmg = \+wd\.dmg;/.test(src), 'startup restore applies a saved damage');
assert(/WEAPONS\[k\]\.dmg = \(wd\.dmg!=null\) \? \+wd\.dmg : GUN_BASE_DMG\[k\];/.test(src), 'loadLevel/import restore damage, falling back to default');
assert(/WEAPONS\[k\]\.dmg=GUN_BASE_DMG\[k\];/.test(src), 'a weapon with no saved record resets to its default damage');

// serialize writes a damage only when it differs from the factory value
assert(/const dmgChg = \(w\.dmg!=null && w\.dmg!==GUN_BASE_DMG\[k\]\);/.test(src), 'serialize detects a changed damage');
assert(/dmg: dmgChg \? w\.dmg : undefined/.test(src), 'serialize emits the changed damage (else nothing)');
assert(/if\(w\.model \|\| w\.view \|\| w\.clips \|\| dmgChg \|\| w\.noMuzzle\)/.test(src), 'a damage-only change still creates a weapons record');

// editor UI: a number input + a reset-to-default button
assert(/WEAPONS\[curWep\]\.dmg=Math\.max\(0, \+dinp\.value\|\|0\);/.test(src), 'editing the field sets the current weapon damage (clamped >= 0)');
assert(/dreset\.textContent='Default \('\+GUN_BASE_DMG\[curWep\]\+'\)'/.test(src), 'a reset button restores the factory damage');

// damage is read live at fire time, so an edited value takes effect immediately
assert(/const dmg=w\.dmg\*dmgMul\*hsMul;/.test(src), 'hitscan damage reads w.dmg live');

// --- executable: the serialize "changed only" rule ---
function record(w, base){ const dmgChg = (w.dmg!=null && w.dmg!==base); const acc = (w.model || w.view || w.clips || dmgChg) ? { dmg: dmgChg ? w.dmg : undefined } : undefined; return acc; }
eq(record({ dmg:12 }, 12), undefined, 'default damage + nothing else -> no record');
eq(JSON.stringify(record({ dmg:40 }, 12)), JSON.stringify({ dmg:40 }), 'a changed damage -> record carries it');
eq(JSON.stringify(record({ dmg:12, model:'u' }, 12)), JSON.stringify({}), 'default damage with a model -> record, but no dmg key');

done('per-weapon editable damage: editor control + persistence, changed-only serialize (build 623)');
