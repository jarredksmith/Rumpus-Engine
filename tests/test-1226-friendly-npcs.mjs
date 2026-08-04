// build 1226: wandering NPCs — "every moving creature is hostile" was the feature panel's civic gap.
// A spawn marker gains a Friendly flag: the NPC rides the SAME nav/patrol/route stack (zero new movement
// code) with every combat system stripped, never aggros (sight, gunfire, blasts, the logic 'alert' verb
// all slide off), doesn't count as a hostile anywhere (HUD, net snapshot, wave-clear), never duplicates
// across waves, and killing it gives nothing — while the On-kill logic event still fires so a creator
// can punish it. Also fixes a REAL reload bug found on the way: buildSpawnMarker validated types against
// a pre-628 three-entry list, so every saved gunner/sapper/shielded/charger/boss marker silently
// demoted to grunt on reload.
import { gameSource, extractFunction, assert, extractConst, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the brain, executed: a friendly never hunts, never aggros
{
  const fn = extractFunction('enemyDesiredTarget');
  const run = (en, dist) => new Function('en', 'dist',
    'const _losBudget = 5;\n' + fn + '\nreturn enemyDesiredTarget(en, 0, 0, dist, 1000, 1.4);')(en, dist);
  const mkEn = (over) => ({ mesh: { position: { x: 5, y: 1.4, z: 5 } }, mode: 'hunt', home: { x: 5, z: 5 },
    patrolR: 8, detectR: 18, route: null, aware: false, lostAt: 0, _nearEyeY: 1.4, ...over });

  { const en = mkEn({ _seesC: true, _losT: 999 });      // hostile control: hunt + LOS = chase
    const td = run(en, 7);
    assert(td.chase && td.see, 'CONTROL: a hostile hunt-mode enemy with LOS chases and sees'); }
  { const en = mkEn({ friendly: true, _seesC: true, _losT: 999 });   // same situation, friendly
    const td = run(en, 7);
    assert(!td.chase, 'the same enemy flagged friendly does NOT chase — hunt demotes to patrol');
    assert(!td.see, '...and never reports contact');
    eq(en.aware, false, '...and never becomes aware, even standing 7 m away in plain sight'); }
  { const en = mkEn({ friendly: true, mode: 'patrol', _losT: null });
    run(en, 7);
    eq(en._losT, null, 'a friendly never spends a sightline raycast (the LOS refresh is skipped entirely)'); }
  { const en = mkEn({ friendly: true, mode: 'hold' });
    const td = run(en, 100);
    assert(!td.chase, 'a friendly hold guards its post without engaging'); }
}

// ---------------------------------------------------------------- nothing aggros a friendly
{
  const fn = extractFunction('alertEnemy');
  const en = { friendly: true, aware: false, lkp: null };
  new Function('en', fn + '\nalertEnemy(en, 1, 2);')(en);
  eq(en.aware, false, 'alertEnemy (gunfire, blasts, the logic alert verb — all route here) slides off a friendly');
  const en2 = { aware: false, lkp: null };
  new Function('en', 'const performance={now:()=>1};\n' + fn + '\nalertEnemy(en, 1, 2);')(en2);
  eq(en2.aware, true, '...and still wakes a hostile');
}

// ---------------------------------------------------------------- hostile accounting, executed
{
  // build 1355: the accounting now asks _enFac/_facOf too — "hostile" means hostile TO THE PLAYER, so an
  // ALLY no longer holds a wave open either. Lifted from source rather than restated, or this rig would be
  // testing its own copy of the rule.
  const both = extractFunction('_enFac') + '\n' + extractFunction('_facOf') + '\n' +
    'const FACTION_NAMES = ' + JSON.stringify(eval(extractConst('FACTION_NAMES'))) + ';\n' +
    'const FACTION_DEFAULT = ' + extractConst('FACTION_DEFAULT') + ';\n' +
    extractFunction('_hostileAlive') + '\n' + extractFunction('_hostilePending');
  const r = new Function(
    'const enemies = [{ hp: 30 }, { hp: 30, friendly: true }, { hp: 30 }];\n' +
    'const toSpawn = 4; const spawnQueue = [{}, { friendly: true }, {}, {}];\n' +
    both + '\nreturn { alive: _hostileAlive(), pending: _hostilePending() };')();
  eq(r.alive, 2, '_hostileAlive counts hostiles only');
  eq(r.pending, 3, '_hostilePending subtracts queued friendlies from toSpawn — and build 1355\u2019s ' +
    'queue descriptors carry no `fac` at all, so this is also the guard that _facOf(undefined) reads as ' +
    'HOSTILE rather than as an ally (it did not, and this assertion is what caught it)');
  const r2 = new Function(
    'const enemies = [{ hp: 30, friendly: true }];\nconst toSpawn = 0; const spawnQueue = [];\n' +
    both + '\nreturn _hostileAlive();')();
  eq(r2, 0, 'a level populated only by villagers reads zero hostiles — the wave can clear');
}
{
  assert(/\} else if\(_hostileAlive\(\)===0\)\{/.test(src),
    'the wave-clear gate asks about HOSTILES — living friendlies must not hold the wave open forever');
  assert(/'HOSTILES: '\+\(_hostileAlive\(\)\+_hostilePending\(\)\)/.test(src), 'the HUD counts the same way');
  assert(/wv:wave, en:_hostileAlive\(\) \}/.test(src), '...and so does the net snapshot the client HUD reads');
}

// ---------------------------------------------------------------- once only: a living friendly's marker doesn't restack
{
  const sw = extractFunction('startWave');
  assert(/if\(\(_m\.friendly \|\| _facOf\(_m\.fac\) === 0\) && enemies\.some\(e => e\._mark === _m && e\.hp > 0\)\) continue;/.test(sw),
    'startWave skips a friendly marker whose NPC is still alive — wave 0 = every wave would otherwise stack a copy of the same villager per wave');
}

// ---------------------------------------------------------------- spawn: combat systems stripped, visual tinted
{
  const se = extractFunction('spawnEnemy');
  assert(/e\.friendly = true; e\._mark = spawn\.mark \|\| null;/.test(se) &&
    /e\.ranged = false; e\.exploder = false; e\.charger = false; e\.cover = false;/.test(se),
    'a friendly spawn disarms ranged/exploder/charger/cover at the source — no attack gate anywhere can misfire');
  assert(/if\(spawn && spawn\.friendly\) mesh\.userData\.friendly = true;/.test(se), 'the visual hook is set before buildEnemyVisual');
  assert(/emissive:\(body\.userData\.friendly \? 0x59d98c : \(body\.userData\.facTint \|\| ty\.tint\)\)/.test(src), 'a friendly capsule reads green, not threat-red');   // build 1355: and a faction capsule tints to its side, with the friendly green still winning
}

// ---------------------------------------------------------------- a friendly death is a death, not a score event
{
  const ke = extractFunction('killEnemy');
  assert(/const _fr = !!en\.friendly \|\| _enFac\(en\) === 0;/.test(ke), 'killEnemy knows');   // build 1355: and killing your own ALLY is the same non-reward
  assert(/if\(_cred\) runKills\+\+;/.test(ke), 'no kill count');   // build 1355: _cred = !_fr && you made it
  assert(/const drops = _fr \? 0 :/.test(ke), 'no coins');
  assert(/if\(!_fr\) score \+= 100;/.test(ke), 'no score');
  assert(/if\(_cred && en\.type==='boss'\)/.test(ke), 'no boss payday');
  assert(/if\(_cred && run\.lifesteal>0\)/.test(ke), 'no lifesteal');
  const iKill = ke.indexOf("_lgFireEvents('onkill'"), iFr = ke.indexOf('const _fr');
  assert(iKill >= 0 && iKill < iFr, 'the On-kill logic event still fires FIRST — a creator can punish killing the villager');
}

// ---------------------------------------------------------------- serialization + the reload-demotion fix
{
  assert(/type:m\.type, wave:m\.wave, \.\.\.\(m\.friendly\?\{fr:1\}:\{\}\)/.test(src),
    'fr serializes only when set — old levels byte-identical');
  assert(/'grunt','runner','brute','gunner','sapper','shielded','charger','boss'/.test(src),
    'buildSpawnMarker accepts ALL 8 types — a saved gunner/boss marker no longer demotes to grunt on reload');
  assert(/friendly: !!\(opts\.fr \|\| opts\.friendly\),/.test(src), 'the loader reads it back');   // build 1355: no longer the last field of the mark
  assert(/type:m\.type, wave:m\.wave, y:m\.y, fr:m\.friendly\?1:0, fac:m\.fac \}/.test(src),
    'duplicate-marker carries type/wave/height/friendly (it had been dropping the first three since they were added)');
  assert(/friendly:!!m\.friendly, fac:_facOf\(m\.fac\), mark:m \}; \}/.test(src), 'descFromMarker threads the flag and the live mark');
}

// ---------------------------------------------------------------- the editor UI
{
  assert(/Friendly — wanders, never attacks or aggros/.test(src), 'the checkbox exists under the behavior row');
  assert(/g\.userData\.mark\.friendly=fCb\.checked/.test(src), '...writing the mark');
  assert(/mark\.friendly \? 0x59d98c : \(FACTION_COL\[mark\.fac\] \|\| SPAWN_MODE_COLORS\[mode\]\)/.test(src), 'a friendly marker post reads green in the editor');   // build 1355: a non-default faction reads as its own colour, and the DEFAULT keeps the mode colour it always had
}

done('build 1226: wandering NPCs — the real brain executed proving a friendly never chases, sees, aggros or spends a LOS raycast while the identical hostile control does; alertEnemy slides off; hostile accounting (HUD, snapshot, wave-clear) executed; living friendlies never restack across waves; combat subsystems disarmed at spawn; a friendly death pays nothing while the On-kill event still fires; and the 8-type marker list fixes saved gunner/sapper/shielded/charger/boss markers silently demoting to grunt on reload');
