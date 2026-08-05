import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 684: a per-weapon muzzle-flash toggle (WEAPONS[k].noMuzzle). Off-by-default; flip it for a water gun,
// bow, beam, etc. Gates the local viewmodel flash + the launcher flash, propagates to peers so they skip it too,
// and serializes with the weapon.

// --- local viewmodel flash gated on the active weapon ---
// (build 1102 split each flash into a view-correct pair — the noMuzzle gate still wraps BOTH paths)
assert(/if\(!w\.noMuzzle\)\{\n    if\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\) muzzleFlashAt\(muzzleWorld\);/.test(src), 'the main shot skips the flash for a flash-less gun');
assert(/if\(!WEAPONS\.launcher\.noMuzzle\)\{\n    if\(tpActive\(\) \|\| activeViewMode\(\)!=='fps'\)/.test(src), 'the launcher honours its own toggle');

// --- multiplayer: the weapon key rides the fire message; peers skip the flash ---
const nf = extractFunction('netFire');
assert(/w:curWep \}/.test(nf), 'the fire message carries the weapon key');
const rf = extractFunction('remoteFire');
assert(/function remoteFire\(pid, o, d, wep\)\{/.test(src), 'remoteFire takes the shooter weapon');
assert(/if\(!\(wep && WEAPONS\[wep\] && WEAPONS\[wep\]\.noMuzzle\)\) muzzleFlashAt\(from\);/.test(rf), 'peers skip a flash-less weapon');
assert(/remoteFire\(id, msg\.o, msg\.d, msg\.w\)/.test(src) && /remoteFire\(msg\.from, msg\.o, msg\.d, msg\.w\)/.test(src), 'both handlers pass the weapon through');

// --- editor toggle ---
const panel = extractFunction('renderEditorFields');
assert(/<b>Muzzle flash<\/b>/.test(panel), 'a Muzzle flash checkbox exists on the weapon');
assert(/mfCb\.checked=!WEAPONS\[curWep\]\.noMuzzle/.test(panel) && /WEAPONS\[curWep\]\.noMuzzle = !mfCb\.checked;/.test(panel), 'the checkbox drives noMuzzle (checked = flash on)');

// --- persistence: serialized + restored in all load paths ---
assert(/if\(w\.model \|\| w\.view \|\| w\.clips \|\| dmgChg \|\| w\.noMuzzle \|\| st \|\| nmChg\)/.test(src), 'a flash-off weapon creates a weapons record');
assert(/noMuzzle: w\.noMuzzle \? true : undefined/.test(src), 'noMuzzle serialized');
// build 1401: the two level loaders share ONE weapons block, so this is boot + that block. Counting one
// copy per path was counting the duplication (build 1280) — and it would have gone green against three
// copies that had drifted, which is exactly what had happened to the block around it.
assert((src.match(/WEAPONS\[k\]\.noMuzzle = !!wd\.noMuzzle;/g)||[]).length===2, 'noMuzzle restored at boot and in the shared level applier');
assert(/WEAPONS\[k\]\.noMuzzle = !!wd\.noMuzzle;/.test(extractFunction('_applyLevelKit')) && (src.match(/_applyLevelKit\(level\);/g)||[]).length===2,
  '...which BOTH level loaders call, so every load path restores it');

done('build 684: per-weapon muzzle-flash toggle');
