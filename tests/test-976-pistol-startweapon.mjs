// (build 976) SINGLE-SHOT PISTOL + a per-level starting-weapon selector.
// The pistol is a precise semi-auto sidearm (auto:false = one shot per click), fully wired through
// every weapon touchpoint (pickups, duel loadout, per-weapon editor). A new gameCfg.startWeapon lets
// a level choose which primary the player spawns with (default rifle), serialized + restored.
import { gameSource, extractConst, assert, eq, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();

// ---- the pistol weapon def ----
const wm = src.slice(src.indexOf('const WEAPONS')).match(/pistol:\s*\{[^}]*\}/);   /* build 1363 gave _SHOT_LAYERS its own pistol entry ABOVE the WEAPONS table — this pin has always meant the WEAPONS def, so anchor there */
assert(wm, 'the pistol is defined in WEAPONS');
const P = wm[0];
assert(/name:'PISTOL'/.test(P), 'named PISTOL');
assert(/auto:false/.test(P), 'SINGLE SHOT — semi-auto, one bullet per click');
assert(/pellets:1/.test(P), 'fires a single precise round (not a spread)');
assert(/magSize:12/.test(P) && /reserve:48/.test(P), 'a small magazine + modest reserve (a sidearm, not a primary)');
assert(/dmg:20/.test(P), 'a solid per-shot hit — rewards accuracy over spray (build 1373: 26 -> 20, the sidearm no longer out-DPSes the starting rifle)');
assert(/spread:0\.006/.test(P), 'tight spread (a precise sidearm)');
assert(!/melee/.test(P) && !/scope/.test(P) && !/projectile/.test(P), 'a plain hitscan gun — no melee/scope/rocket flags');

// ---- it flows through every weapon list ----
assert(/pistol: \{ c:0x8fb2ff, label:'PISTOL' \}/.test(src), 'its own pickup tint + label');
assert(/const WEAPON_PICKUP_KINDS = \{ pistol:1,/.test(src), 'a pistol pickup grants the weapon');
assert(/\['pistol','Pistol'\],\['rifle','Rifle'\]/.test(src), 'the editor pickup dropdown offers it');
assert(/const weps=\['pistol','rifle','smg','shotgun','sniper','launcher'\]/.test(src), 'it can appear in auto-laid-out weapon pickups');
assert(/let l=\['pistol','rifle','smg','shotgun','sniper','launcher','crowbar'\]\.filter/.test(src), 'duels hand it out too');

// ---- per-level starting weapon ----
assert(/startWeapon: \(savedLevel && savedLevel\.game && typeof savedLevel\.game\.startWeapon==='string'\) \? savedLevel\.game\.startWeapon : 'rifle'/.test(src),
  'gameCfg.startWeapon defaults to rifle (back-compat)');
// build 1272: the guard is the named _canStartWith predicate — same job, and melee is now allowed
// (the crowbar could not be chosen at all before). The FISTS slot is still excluded; "Start unarmed" owns it.
assert(/startWeapon: _canStartWith\(gameCfg\.startWeapon\) \? gameCfg\.startWeapon : 'rifle'/.test(src),
  'serialized, guarded to a weapon you may actually start with');
assert((src.match(/gameCfg\.startWeapon = \(typeof g\.startWeapon==='string' && _canStartWith\(g\.startWeapon\)\) \? g\.startWeapon : 'rifle';/g) || []).length === 1,
  'restored in BOTH load paths (net + local)');
assert(/const _sw=_canStartWith\(gameCfg\.startWeapon\) \? gameCfg\.startWeapon : 'rifle'; owned = \[_sw\]; curWep=_sw;/.test(src),
  'startGame spawns the player holding the chosen weapon');

// ---- the editor "Starts with" selector ----
assert(/if\(!gameCfg\.unarmed\)\{[\s\S]{0,600}?Starts with<\/b> — the weapon players spawn holding/.test(src),
  'an armed level shows a Starts with selector');
assert(/Object\.keys\(WEAPONS\)\.filter\(_canStartWith\)/.test(src),
  'the selector is built from the predicate, so a new weapon appears automatically (the pistol did; build 1272 let the crowbar too)');
assert(/swSel\.onchange=\(\)=>\{ pushUndoSnapshot\(\); gameCfg\.startWeapon=swSel\.value; _levelDirty=true; \}/.test(src),
  'choosing a weapon updates the level');

// ---- executable: base damage table auto-includes the pistol ----
const baseDmg = src.match(/const GUN_BASE_DMG = \{\}; for\(const _k in WEAPONS\) GUN_BASE_DMG\[_k\] = WEAPONS\[_k\]\.dmg;/);
assert(baseDmg, 'GUN_BASE_DMG derives from WEAPONS, so the pistol gets a base damage automatically');

done('build 976: single-shot pistol + per-level starting-weapon selector');
