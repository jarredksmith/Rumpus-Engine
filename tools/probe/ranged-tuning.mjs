// Does a level's ranged tuning reach a spawned enemy, and survive a save?
//
// The test drives the sanitizer and the derivation. This drives the whole road: author the mods the way the
// editor does, spawn through the real `spawnEnemy`, then `serializeLevel` -> `restoreLevel` and spawn again.
// The in-memory half is where builds 1398/1400/1401/1406/1427 all passed and the FILE was the defect.
//
// The control is an untuned level in the same run: it must read factory at every step.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(24) + JSON.stringify(v));
const F = ['fireCd', 'burst', 'projSpeed', 'standoff', 'aimMs'];

await withGame(async (P) => {
  await P(DRIVE_RIG + '1');
  say('settled', await P(`(function(){
    return { build: BUILD_VERSION, ranged: ENEMY_MOD_RANGED,
             factory: (function(){ const b=ENEMY_BASE.gunner, o={}; for(const f of ENEMY_MOD_RANGED) o[f]=b[f]; return o; })() };
  })()`));

  const spawnAndRead = `(function(){
    __wavesOff(); __clearEnemies();
    spawnEnemy({ x: 48, z: 40, type: 'gunner' });
    const en = enemies[enemies.length-1];
    const o = {}; for(const f of ENEMY_MOD_RANGED) o[f] = en[f];
    __clearEnemies();
    return o;
  })()`;

  console.log('\n--- CONTROL: no tuning ---------------------------------------------------------------');
  say('spawned gunner', await P(`(function(){ gameCfg.enemyMods = null; return 1; })()`) && await P(spawnAndRead));

  console.log('\n--- author the tuning, the way the editor writes it -----------------------------------');
  say('stored', await P(`(function(){
    gameCfg.enemyMods = _sanitizeEnemyMods({ gunner: { fireCd: 4, burst: 3, projSpeed: 55, standoff: 28, aimMs: 900 } });
    return gameCfg.enemyMods;
  })()`));
  say('spawned gunner', await P(spawnAndRead));

  console.log('\n--- and it reaches the BEHAVIOUR, not just the field ----------------------------------');
  say('a real firefight', await P(`(function(){
    __wavesOff(); __clearEnemies();
    player.pos.set(40, EYE, 40); player.hp = 9999; player.vel.set(0,0,0);
    spawnEnemy({ x: 48, z: 40, type: 'gunner' });
    const en = enemies[enemies.length-1];
    en.aware = true; en.shootCd = 0; enemyShots.length = 0;
    const ev = []; let lastAim = 0, lastShots = 0; const t0 = __vnow;
    for(let i=0;i<600;i++){
      __drive(1);
      const a = en._aimT ? 1 : 0;
      if(a && !lastAim) ev.push({ ev:'wind', t:+(__vnow-t0).toFixed(0) });
      lastAim = a;
      if(enemyShots.length > lastShots){ ev.push({ ev:'shot', t:+(__vnow-t0).toFixed(0) }); lastShots = enemyShots.length; }
    }
    const shots = ev.filter(e=>e.ev==='shot').map(e=>e.t), winds = ev.filter(e=>e.ev==='wind').map(e=>e.t);
    const out = { shots: shots.length, leadMs: (winds[0]!=null&&shots[0]!=null)?shots[0]-winds[0]:null,
                  burstGaps: shots.slice(1,3).map((t,i)=>+(t-shots[i]).toFixed(0)),
                  /* the enemy spawned INSIDE its authored standoff and backs off toward it — 10 simulated
                     seconds is not enough to arrive, so report the direction, which is the honest claim */
                  startedAt: 8, distNow: +en._dist.toFixed(1), authoredStandoff: en.standoff,
                  backingOff: en._dist > 8.5 };
    __clearEnemies();
    return out;
  })()`));

  console.log('\n--- ROUND TRIP: through the real serializer and loader --------------------------------');
  say('what the file carries', await P(`(function(){
    const lvl = serializeLevel();
    return lvl.game && lvl.game.enemyMods ? lvl.game.enemyMods : '(absent)';
  })()`));
  say('after restore', await P(`(function(){
    const json = JSON.stringify(serializeLevel());
    gameCfg.enemyMods = null;                       // prove the reload puts it back, not that nothing cleared it
    restoreLevel(JSON.parse(json));
    return gameCfg.enemyMods;
  })()`));
  say('spawned after reload', await P(spawnAndRead));

  console.log('\n--- an untuned level grows no key -----------------------------------------------------');
  say('control round trip', await P(`(function(){
    gameCfg.enemyMods = null;
    const lvl = serializeLevel();
    /* JSON.stringify DROPS an undefined value, so "the key is present" and "the file carries it" are
       different questions — ask the one that matters by round-tripping the JSON. */
    const back = JSON.parse(JSON.stringify(lvl));
    return { keyPresentInMemory: 'enemyMods' in lvl.game,
             inTheFile: ('enemyMods' in back.game) ? back.game.enemyMods : '(absent — the file grows no key)' };
  })()`));

  console.log('\n--- the editor row exists, and only for a type that shoots ----------------------------');
  say('grid', await P(`(function(){
    if(!editorOpen) toggleEditor();
    setEditorMode('rules'); renderEditorFields();
    const ins = Array.from(document.querySelectorAll('input[type=number]'))
      /* the filter must match the REAL tooltips — "standoff" appears in none of them ("how far back it
         holds"), so the first run reported 8 of 10 and the two missing inputs were the instrument */
      .filter(i => i.title && /wind-up|how far back|bolt speed|rounds per burst|seconds between/.test(i.title));
    const rangedTypes = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].ranged);
    return { rangedFieldInputs: ins.length, rangedTypes, expect: rangedTypes.length * 5,
             sampleTitle: ins.length ? ins[0].title : null };
  })()`));

  await P('__release(); 1');
}, { settleMs: 6000 });

console.log('');
