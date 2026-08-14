// (build 49) Between-wave roguelite upgrades (solo). Each pick mutates run-scoped modifiers wired into
// damage, fire rate, move speed, credits, lifesteal, regen, and grenade restock. Co-op stays neutral.
import { extractFunction, extractConst, gameSource, done, assert, near, eq } from './harness.mjs';
const src = gameSource();

// build a sandbox with the real UPGRADES + pickUpgrades and mock globals they touch
const env = `
  "use strict";
  let run = { dmgMul:1, fireMul:1, speedMul:1, coinMul:1, lifesteal:0, regen:0, grenadePerWave:0 };
  const player = { hp:50, maxHp:100 };
  let grenadeCount = 0;
  function updateHUD(){}
  const GAME_ICON = new Proxy({}, { get:()=>'' });   // build 511: UPGRADES icons are SVG strings from GAME_ICON; stub it for the apply-logic sandbox
  const UPGRADES = ${extractConst('UPGRADES')};
  ${extractFunction('pickUpgrades')}
  return { UPGRADES, pickUpgrades, player, getRun:()=>run, getGren:()=>grenadeCount };
`;
const S = new Function('Math', env)(Math);
const byId = id => S.UPGRADES.find(u=>u.id===id);

byId('dmg').apply();   near(S.getRun().dmgMul, 1.25, 1e-9, 'damage +25%');
byId('rof').apply();   near(S.getRun().fireMul, 0.85, 1e-9, 'fire rate +15% (cadence x0.85)');
byId('speed').apply(); near(S.getRun().speedMul, 1.12, 1e-9, 'move speed +12%');
byId('coin').apply();  near(S.getRun().coinMul, 1.3, 1e-9, 'credits +30%');
byId('leech').apply(); eq(S.getRun().lifesteal, 4, 'lifesteal +4');
byId('regen').apply(); eq(S.getRun().regen, 25, 'regen +25/wave');
byId('hp').apply();    eq(S.player.maxHp, 125, 'max HP +25'); eq(S.player.hp, 75, 'and heals 25');
byId('nade').apply();  eq(S.getRun().grenadePerWave, 1, '+1 grenade/wave'); eq(S.getGren(), 1, 'and one now');

// stacking compounds
byId('dmg').apply(); near(S.getRun().dmgMul, 1.5625, 1e-9, 'damage stacks multiplicatively');

// picker offers 3 distinct upgrades
const three = S.pickUpgrades(3);
eq(three.length, 3, 'three choices'); eq(new Set(three.map(u=>u.id)).size, 3, 'all distinct');
eq(S.pickUpgrades(99).length, S.UPGRADES.length, 'never more than the pool');

// --- wiring ---
assert(/const dmgMul = \(buffs\.damage \? 2 : 1\) \* run\.dmgMul/.test(src), 'damage hook');
assert(/w\.fireRate \* run\.fireMul/.test(src), 'fire-rate hook');
assert(/\* run\.speedMul;/.test(src), 'move-speed hook');
assert(/15 \+ Math\.floor\(wave\*2\)\) \* run\.coinMul/.test(src), 'credit hook');
// build 1355: the gate widened from _fr (friendly) to _cred (a kill that is YOURS — not a pacifist, not
// your own ally, and not one your ally made). A hostile kill by the player still heals, which is the
// assertion this pin has always been about.
assert(/if\(_cred && run\.lifesteal>0\) player\.hp = Math\.min\(player\.maxHp, player\.hp \+ run\.lifesteal\)/.test(src), 'lifesteal hook in killEnemy');
assert(/const _cred = !_fr && !byEnemy;/.test(src), '...and _cred is exactly that: a reward-worthy kill');
assert(/else if\(NET\.mode==='off' && gameCfg\.upgrades !== false\)\{ beginUpgradeChoice\(\); \}/.test(src), 'solo + enabled wave-clear opens the picker');
/* build 1502: this used to quote the WHOLE game literal, so every field that joined broke it with
   its assertion still true (the whole-literal trap). It asserts its member inside the real block now. */
const _gmBlk = src.slice(src.indexOf('game:    { mode: gameCfg.mode,'), src.indexOf('spawnRegion:', src.indexOf('game:    { mode: gameCfg.mode,')));
assert(_gmBlk.length > 100 && /upgrades: gameCfg\.upgrades !== false,/.test(_gmBlk),
  'upgrade toggle saved with the level');
assert(/upgrades: \(savedLevel && savedLevel\.game && savedLevel\.game\.upgrades!=null\) \? !!savedLevel\.game\.upgrades : true/.test(src), 'defaults on, persists when set');
assert(/ugCb\.onchange=\(\)=>\{ pushUndoSnapshot\(\); gameCfg\.upgrades=ugCb\.checked; \}/.test(src), 'editor checkbox toggles it');
assert(!/!NET\.mode\)\{ beginUpgradeChoice/.test(src), 'no broken !NET.mode gate (off is a truthy string)');
assert(/else \{ wave\+\+; SFX\.wave\(\); startWave\(\); \}/.test(src), 'co-op advances waves with no picker (run stays neutral)');
  // build 1478 added a sixth term to the frame loop's freeze gate and broke five harnesses at once, every
  // one of their assertions still TRUE — they had each quoted the WHOLE condition to assert one thing about
  // it. That is build 1468's own recorded trap one line over: a pin that quotes a whole condition is a pin
  // against the condition's NEIGHBOURS. They assert MEMBERSHIP now.
{ const gate = src.match(/if\(\(shopOpen \|\| choosingUpgrade[^\n]*?\) \{ pollGamepad/);
  assert(gate, 'the frame loop has a freeze gate');
  assert(/\bchoosingUpgrade\b/.test(gate[0]), 'world freezes while picking an upgrade');
  assert(/!\(duelDead && pvpMode\(\)\)/.test(gate[0]), '...but never while waiting to respawn'); }
assert(/run = \{ \.\.\.RUN0 \};/.test(src) && /player\.maxHp=100;/.test(src), 'new game resets modifiers + max HP');
const aw = extractFunction('advanceWave');
assert(/run\.regen>0\) player\.hp = Math\.min/.test(aw) && /run\.grenadePerWave>0\) grenadeCount/.test(aw), 'per-wave perks applied on advance');

// --- runnable: the picker must SHOW ONCE and keep the world paused (regression: showUpgradePicker
//     used to call closeUpgradePicker(), which reset choosingUpgrade=false every frame -> frantic cycling) ---
{
  const a = src.indexOf('const RUN0 =');
  const b = src.indexOf('// ---------- Grenades (throwable) ----------');
  const block = src.slice(a, b);
  const store = { upgrade:null };
  const mkEl = () => ({ id:'', textContent:'', _h:'', style:{}, set innerHTML(v){this._h=v;}, get innerHTML(){return this._h;},
    appendChild(){}, remove(){ if(store.upgrade===this) store.upgrade=null; }, onmouseenter:null, onmouseleave:null, onclick:null });
  const document = { exitPointerLock(){}, createElement(){ return mkEl(); },
    getElementById(id){ return id==='upgrade' ? store.upgrade : null; },
    body:{ appendChild(el){ if(el.id==='upgrade') store.upgrade=el; } } };
  const API = new Function('document','wave','safeExitPointerLock', block + '\n return { begin:beginUpgradeChoice, close:closeUpgradePicker, getChoosing:()=>choosingUpgrade };')(document, 7, ()=>{});
  API.begin();
  assert(API.getChoosing() === true, 'choosingUpgrade STAYS true after the picker shows (so the loop pauses)');
  const first = store.upgrade;
  assert(!!first, 'an overlay element was mounted');
  API.begin();   // simulate the next frame re-hitting the wave-clear branch
  assert(store.upgrade === first, 'guard blocks rebuilding the picker every frame (no cycling)');
  API.close();
  assert(API.getChoosing() === false && store.upgrade === null, 'closeUpgradePicker tears down + clears the flag');
}

done('between-wave upgrade loop (apply / stack / pick / wiring)');
