// (build 977) FIVE FIELD FIXES from real play reports:
// 1. Flashlight first-toggle froze the game for seconds — creating the spotlight late (or toggling
//    .visible) changes the scene light COUNT and three.js recompiles every material. Now it joins
//    the scene at level start, always visible at intensity 0; the toggle is intensity-only.
// 2. Shared levels reset the third-person framing — it only lived on roster characters. The main
//    player config now ships grip + view, applied on load (session-only, old levels unaffected).
// 3. A gun that loaded BEFORE the character was body-gripped to the placeholder (it sat at the
//    feet) and never re-attached. The model's arrival now re-seats the gun so it finds the hand.
// 4. The capsule placeholder flashed before the model swap — hidden while a model is in flight,
//    revealed only if the load fails.
// 5. Enemies/bots ground forever on concave corners — the wall-follow side now escalates: flip,
//    back out of the pocket, then recompute the nav route. Still no teleports.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// ---- 1. flashlight ----
assert(/_flashlight\.visible=true; _flashlight\.castShadow=false;/.test(src),
  'the spotlight is created VISIBLE (at intensity 0) — light count never changes');
assert(/ensureFlashlight\(\); flashlightOn=!flashlightOn;\s+\/\/ build 977: intensity-only toggle/.test(src),
  'the toggle no longer flips .visible');
assert(!/_flashlight\.visible=flashlightOn/.test(src), 'no .visible toggle remains anywhere');
assert(/if\(gameCfg\.flashlight && typeof ensureFlashlight==='function'\) ensureFlashlight\(\);/.test(src),
  'flashlight levels pre-warm at startGame — shaders compile during load, not on the first L');
assert(/flashlightOn=false; if\(_flashlight\)\{ _flashlight\.intensity=0; \}/.test(src),
  'the run-start reset keeps it visible at intensity 0');

// ---- 2. framing + grips travel with the level ----
assert(/grip: _sanitizeGripMap\(tpGunGrips\), view: _snapshotView\(\) \},   \/\/ build 977/.test(src),
  'serializeLevel ships the authored chase framing + per-weapon gun grips on player');
assert(/if\(pl\.view && typeof _applyView==='function'\) _applyView\(pl\.view\);/.test(src),
  'applyPlayerLevel applies the authored framing (guarded: old levels carry none)');
assert(/const _g=_sanitizeGripMap\(pl\.grip\); for\(const _k in _g\)\{ tpGunGrips\[_k\]=Object\.assign\(\{\}, TP_GUN_DEFAULT, _g\[_k\]\); \}/.test(src),
  '...and the authored gun grips (sanitized, session-only — never saved over personal tuning)');
assert(!/_saveTpGun\(\);\s*\n\s*rebuildAvatars\(\); \}/.test(src), 'level grips are NOT persisted to localStorage');

// ---- 3. gun re-seat when the model lands ----
assert(/const _rearmGun = g\.userData\.gunKey \|\| null, _rearmGrip = g\.userData\.gripOverride \|\| null;/.test(src),
  'buildAvatarVisual captures the held gun before tearing down');
assert(/const _wk = g\.userData\.gunKey \|\| _rearmGun;/.test(src)
  && /g\.userData\.gunKey=null; attachAvatarGun\(g, _wk, g\.userData\.gripOverride \|\| _rearmGrip\); \} \}/.test(src),
  'the model-arrival callback re-attaches the gun so it finds the hand bone');

// ---- 4. hidden placeholder ----
assert(/useCapsule\(\);   \/\/ structural fallback[\s\S]{0,200}?g\.userData\.visual\.visible=false;/.test(src),
  'the placeholder is invisible while a model is in flight');
assert(/if\(g\.userData\._loadingUrl===mc\.url && g\.userData\.visual\) g\.userData\.visual\.visible=true; \}   \/\/ build 977/.test(src),
  'a FAILED load reveals the capsule (never an invisible player)');

// ---- 5. escalating unstick ----
const stuck = src.match(/if\(en\._stuckT>0\.2\)\{   \/\/ build 540\/546\/620 wall-follow; build 977[\s\S]{0,1200}?\n        \}/)[0];
assert(/en\._stuckT>1\.2 && !en\._sFlip1/.test(stuck) && /en\._stuckT>2\.4 && !en\._sFlip2/.test(stuck),
  'the wall-follow side flips (twice) when it is not working');
assert(/en\._stuckT>2\.0 && en\._stuckT<2\.6\) \? -0\.9 : 0\.5/.test(stuck),
  'between flips the enemy backs straight OUT of the pocket');
assert(/en\._nav=null; en\._pathBlk=true; en\._pbT=0;/.test(stuck),
  'both sides failing forces a fresh nav route — still NO teleports');
assert((src.match(/en\._sFlip1=0; en\._sFlip2=0;/g) || []).length >= 3, 'flip flags reset once the enemy is moving again');
assert(/if\(b\._stuckT>1\.8 && !b\._sFlip\)\{ b\._sFlip=1; b\._stuckSide\*=-1; \}/.test(src),
  'bots flip their wall-follow side too');

done('build 977: flashlight freeze, framing travels, gun re-seat, no capsule flash, escalating unstick');
