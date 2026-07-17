// (build 976) SINGLE-SHOT PISTOL + a per-level starting-weapon selector.
// The pistol is a precise semi-auto sidearm (auto:false = one shot per click), fully wired through
// every weapon touchpoint (pickups, duel loadout, per-weapon editor). A new gameCfg.startWeapon lets
// a level choose which primary the player spawns with (default rifle), serialized + restored.
import { gameSource, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- the pistol weapon def ----
const wm = src.match(/pistol:\s*\{[^}]*\}/);
assert(wm, 'the pistol is defined in WEAPONS');
const P = wm[0];
assert(/name:'PISTOL'/.test(P), 'named PISTOL');
assert(/auto:false/.test(P), 'SINGLE SHOT — semi-auto, one bullet per click');
assert(/pellets:1/.test(P), 'fires a single precise round (not a spread)');
assert(/magSize:12/.test(P) && /reserve:48/.test(P), 'a small magazine + modest reserve (a sidearm, not a primary)');
assert(/dmg:26/.test(P), 'a solid per-shot hit — rewards accuracy over spray');
assert(/spread:0\.006/.test(P), 'tight spread (a precise sidearm)');
assert(!/melee/.test(P) && !/scope/.test(P) && !/projectile/.test(P), 'a plain hitscan gun — no melee/scope/rocket flags');

// ---- it flows through every weapon list ----
assert(/pistol: \{ c:0x8fb2ff, label:'PISTOL' \}/.test(src), 'its own pickup tint + label');
assert(/const WEAPON_PICKUP_KINDS = \{ pistol:1,/.test(src), 'a pistol pickup grants the weapon');
assert(/\['pistol','Pistol'\],\['rifle','Rifle'\]/.test(src), 'the editor pickup dropdown offers it');
assert(/const weps=\['pistol','rifle','smg','shotgun','sniper','launcher'\]/.test(src), 'it can appear in auto-laid-out weapon pickups');
assert(/owned=\['pistol','rifle','smg','shotgun','sniper','launcher','crowbar'\]/.test(src), 'duels hand it out too');

// ---- per-level starting weapon ----
assert(/startWeapon: \(savedLevel && savedLevel\.game && typeof savedLevel\.game\.startWeapon==='string'\) \? savedLevel\.game\.startWeapon : 'rifle'/.test(src),
  'gameCfg.startWeapon defaults to rifle (back-compat)');
assert(/startWeapon: \(WEAPONS\[gameCfg\.startWeapon\] && !WEAPONS\[gameCfg\.startWeapon\]\.melee\) \? gameCfg\.startWeapon : 'rifle'/.test(src),
  'serialized, guarded to a real non-melee gun');
assert((src.match(/gameCfg\.startWeapon = \(typeof level\.game\.startWeapon==='string' && WEAPONS\[level\.game\.startWeapon\] && !WEAPONS\[level\.game\.startWeapon\]\.melee\) \? level\.game\.startWeapon : 'rifle';/g) || []).length === 2,
  'restored in BOTH load paths (net + local)');
assert(/const _sw=\(gameCfg\.startWeapon && WEAPONS\[gameCfg\.startWeapon\] && !WEAPONS\[gameCfg\.startWeapon\]\.melee\) \? gameCfg\.startWeapon : 'rifle'; owned = \[_sw\]; curWep=_sw;/.test(src),
  'startGame spawns the player holding the chosen weapon');

// ---- the editor "Starts with" selector ----
assert(/if\(!gameCfg\.unarmed\)\{[\s\S]{0,600}?Starts with<\/b> — the weapon players spawn holding/.test(src),
  'an armed level shows a Starts with selector');
assert(/Object\.keys\(WEAPONS\)\.filter\(k=>WEAPONS\[k\] && !WEAPONS\[k\]\.melee\)/.test(src),
  'the selector lists every non-melee gun (so the pistol appears automatically)');
assert(/swSel\.onchange=\(\)=>\{ pushUndoSnapshot\(\); gameCfg\.startWeapon=swSel\.value; _levelDirty=true; \}/.test(src),
  'choosing a weapon updates the level');

// ---- executable: base damage table auto-includes the pistol ----
const baseDmg = src.match(/const GUN_BASE_DMG = \{\}; for\(const _k in WEAPONS\) GUN_BASE_DMG\[_k\] = WEAPONS\[_k\]\.dmg;/);
assert(baseDmg, 'GUN_BASE_DMG derives from WEAPONS, so the pistol gets a base damage automatically');

done('build 976: single-shot pistol + per-level starting-weapon selector');
