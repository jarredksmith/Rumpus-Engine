// Does a gunner in the RUNNING game give the player a beat before the round leaves?
//
// The test drives the sliced block. This drives the REAL enemy tick inside the real `loop()`, with a real
// spawned gunner and `enemyShots` counted off the real array — and on build 1406's frame rig, because the
// real clock CANNOT resolve this: SwiftShader renders ~1.5 fps here, so a 260 ms window opens and closes
// inside a single frame and the first attempt measured the tell and the shot landing together.
//
// The control is `aimMs = 0` — the pre-1448 engine, which must fire on the first eligible frame and at the
// same rate. A run where the control never fires is the instrument, not the finding.
import { withGame } from './driver.mjs';
import { DRIVE_RIG, DRIVE_CONTROL } from './drive.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(26) + JSON.stringify(v));

await withGame(async (P) => {
  await P(DRIVE_RIG + '(function(){ return 1; })()');
  say('settled', await P(`(function(){
    return { build: BUILD_VERSION, RANGED_AIM_MS,
             gunnerAimMs: (ENEMY_TYPES.gunner && ENEMY_TYPES.gunner.aimMs != null) ? ENEMY_TYPES.gunner.aimMs : '(default)' };
  })()`));
  say('positive control', await P(DRIVE_CONTROL));

  /* One gunner, well clear of the stock level's geometry but inside +-ARENA so the floor is under it
     (build 1323), the player standing inside its standoff so it holds and shoots rather than closing. */
  const trial = (aim, frames, breakLosAtFrame) => `(function(){
    __wavesOff(); __clearEnemies();
    player.pos.set(40, EYE, 40); player.hp = 9999; player.vel.set(0,0,0);
    spawnEnemy({ x: 48, z: 40, type: 'gunner', mode: 'hunt' });
    const en = enemies[enemies.length-1];
    if(!en || !en.ranged) return { err: 'no ranged enemy' };
    en.aimMs = ${aim}; en.aware = true; en.shootCd = 0; en._flash = 0;
    enemyShots.length = 0;
    const ev = [], t0 = __vnow;
    let lastAim = 0, lastShots = 0;
    for(let i = 0; i < ${frames}; i++){
      /* cover goes up ON the frame the wind-up first appears — a fixed frame number cannot work, because
         acquisition takes as long as the AI takes and the first attempt dropped it before any wind-up had
         started (winds:0, which measures nothing at all) */
      ${breakLosAtFrame ? `if(lastAim && !window.__covered){ window.__covered = 1; __cover(); }` : ''}
      __drive(1);
      const a = en._aimT ? 1 : 0;
      if(a && !lastAim) ev.push({ ev:'wind', t: +(__vnow - t0).toFixed(0) });
      lastAim = a;
      if(enemyShots.length > lastShots){ ev.push({ ev:'shot', t: +(__vnow - t0).toFixed(0) }); lastShots = enemyShots.length; }
    }
    const out = { ev, cooldownLeft: +(en.shootCd || 0).toFixed(2), dist: +en._dist.toFixed(1),
                  standoff: en.standoff, sawPlayer: !!en._see };
    __clearEnemies();
    return out;
  })()`;

  const summarise = (r) => {
    if (r.err) return r;
    const shots = r.ev.filter((e) => e.ev === 'shot').map((e) => e.t);
    const winds = r.ev.filter((e) => e.ev === 'wind').map((e) => e.t);
    return { shots: shots.length, winds: winds.length, firstShot: shots[0],
             leadMs: (winds[0] != null && shots[0] != null) ? shots[0] - winds[0] : null,
             gaps: shots.slice(1).map((t, i) => +(t - shots[i]).toFixed(0)) };
  };

  console.log('\n--- CONTROL: aimMs 0 — the pre-1448 engine ------------------------------------------');
  const ctl = await P(trial(0, 420));
  say('raw', { dist: ctl.dist, standoff: ctl.standoff, sawPlayer: ctl.sawPlayer });
  say('summary', summarise(ctl));

  console.log('\n--- SHIPPED: aimMs 260 ---------------------------------------------------------------');
  const now = await P(trial(260, 420));
  say('summary', summarise(now));

  console.log('\n--- a longer authored tell, so the effect is provably the field ----------------------');
  say('aimMs 800', summarise(await P(trial(800, 420))));

  console.log('\n--- ducking behind cover during the tell ---------------------------------------------');
  /* `en._see` is RECOMPUTED from a real raycast every frame, so writing it from outside is overwritten
     before the fire gate reads it — the first attempt did exactly that and reported the abort failing.
     Cover has to be REAL cover: a wall dropped between them, which is what a player ducking behind one is. */
  await P(`window.__cover = function(){
    /* spawnProp(src, TUPLE) — the tuple is [x,y,z, rx,ry,rz, sx,sy,sz]. Read the signature. */
    spawnProp('box', [44, 0, 40, 0, 0, 0, 1, 6, 8]);
    const w = propModels[propModels.length-1];
    window.__coverProp = w; return !!w;
  }; 1`);
  await P("window.__covered = 0; 1");
  const duck = await P(trial(260, 200, 1));
  await P('(function(){ if(window.__coverProp) __kill(__coverProp); __coverProp=null; return 1; })()');
  say('summary', summarise(duck));
  say('cooldown still spent', duck.cooldownLeft);

  console.log('\n--- the capsule pulses through build 1367’s own function ------------------------------');
  say('mid wind-up', await P(`(function(){
    __wavesOff(); __clearEnemies();
    spawnEnemy({ x: 48, z: 40, type: 'gunner' });
    const en = enemies[enemies.length-1];
    en._flash = 0; en._emi0 = null; en.aimMs = 260;
    const v = en.mesh.userData.visual;
    const base = v.material.emissiveIntensity, sc0 = v.scale.y;
    en._aimT = __vnow + 200;
    const f = _telegraphFrac(en, __vnow);
    _telegraphTick(en, __vnow);
    const mid = { frac: +f.toFixed(3), emissive: +v.material.emissiveIntensity.toFixed(3),
                  squash: +(v.scale.y / v.scale.x).toFixed(4) };
    en._aimT = 0; _telegraphTick(en, __vnow);
    const out = { base: +base.toFixed(3), mid, restored: +v.scale.y.toFixed(4) === +sc0.toFixed(4),
                  emissiveBack: +v.material.emissiveIntensity.toFixed(3) };
    __clearEnemies();
    return out;
  })()`));

  await P('__release(); 1');
}, { settleMs: 6000 });

console.log('');
