// build 1091: the attachment mount rebuild no longer runs before its own state exists.
//
// showWeaponModel() runs during startup, above the attachment block. Function declarations hoist, so the
// `typeof rebuildAttMounts==='function'` guard was true while ATT_SLOTS / _attLoadout / attModels / the mount
// group were all still in their temporal dead zone. The call threw, the try/catch swallowed it, and every boot
// logged "attachment mounts skipped: Cannot access '_attMountGroup' before initialization". Harmless in the end
// — applyAttachments() at the bottom of the block mounts a saved loadout properly — but it is the exact shape
// of the bug that broke booting in 1087, so the noise has to go or it will hide the next one.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// 1. The flag is `var`, not `let`/`const`. This matters: a let/const flag would itself be in the TDZ at the
//    call site, and reading it would throw the very error we are trying to avoid. `var` reads as undefined.
const decl = /var\s+_attStateReady\s*=\s*false\s*;/.exec(src);
assert(decl, '_attStateReady is declared with var and starts false');
assert(!/(?:let|const)\s+_attStateReady\b/.test(src), 'no let/const declaration of _attStateReady (would re-introduce a TDZ read)');

// 2. Both boot-reachable call sites in showWeaponModel are gated on it.
const calls = src.match(/if\s*\(\s*[^)]*typeof\s+rebuildAttMounts\s*===\s*'function'\s*\)\s*rebuildAttMounts\(key\)/g) || [];
assert(calls.length === 2, 'both showWeaponModel call sites found (got ' + calls.length + ')');
for (const c of calls) assert(/_attStateReady\s*&&/.test(c), 'call site is gated on _attStateReady: ' + c.slice(0, 60));

// 3. The flag flips only after the state it protects has been initialised, and before the startup apply that
//    is what actually mounts a saved loadout.
const iFlag = src.indexOf('_attStateReady = true;');
assert(iFlag > 0, 'the flag is set somewhere');
for (const dep of ["const ATT_SLOTS = ['optic'", 'let _attLoadout =', 'let mountByWep =', 'let attModels =', 'let _attMountGroup=null']) {
  const i = src.indexOf(dep);
  assert(i > 0, 'dependency present in source: ' + dep);
  assert(i < iFlag, dep + ' is initialised before the flag flips');
}
const iApply = src.indexOf('applyAttachments();   // apply any saved loadout at startup');
assert(iApply > iFlag, 'the startup applyAttachments() runs after the flag flips, so saved loadouts still mount');

// 4. And the guard is a gate, not a removal — the mount rebuild must still be wired to weapon switches.
assert(/if\(typeof curWep!=='undefined'\) rebuildAttMounts\(curWep\);/.test(src),
  'applyAttachments still rebuilds mounts');

done('build 1091: attachment mounts no longer rebuild before their own state is initialised');
