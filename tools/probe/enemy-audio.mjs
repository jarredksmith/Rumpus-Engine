// build 1315 (gameplay audit F3) — "enemies produce sound in exactly three places. No approach/footstep,
// no aggro/spot vocal, no sapper fuse. A brute closing from behind you is inaudible in a genre where audio
// does most of the threat detection."
//
// `_enemyFootstep` and `_sapperFuse` live inside the enemy-AI closure, not module scope (probed: `_enStep`
// and `updateEnemies` are equally unreachable, while `shatterProp` and the module-level constants are
// visible) — so this probe does NOT poke them directly. It spawns a REAL enemy, lets the REAL AI walk it at
// the player, and counts what the engine actually plays. The unit-level behaviour is executed in
// tests/test-1315 instead, where extractFunction can lift the functions out.
import { withGame } from './driver.mjs';

const REC = `(function(){
  window.__snd = [];
  const _rt = tone, _rn = noise;
  tone  = function(o){ window.__snd.push('tone:'+((o&&o.freq)||'?')+(o&&o.at?'@pos':'@flat')); return _rt.apply(null, arguments); };
  noise = function(o){ window.__snd.push('noise:'+((o&&o.filterFreq)||'?')+(o&&o.at?'@pos':'@flat')); return _rn.apply(null, arguments); };
  return { recording:true, consts:{ stepM:ENEMY_STEP_M, range:ENEMY_STEP_RANGE, near:ENEMY_STEP_NEAR, budget:ENEMY_STEP_BUDGET },
           heavy:JSON.stringify(ENEMY_HEAVY), fuse:[SAPPER_FUSE_FAR, SAPPER_FUSE_NEAR],
           sfx:['enemyStep','enemySpot','sapperFuse'].filter(k=>typeof SFX[k]==='function') };
})()`;

const WALK = (type, secs) => `(function(){
  enemies.slice().forEach(e=>{ try{ scene.remove(e.mesh); }catch(_){} }); enemies.length = 0;
  player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.hp = player.maxHp;
  spawnEnemy({ x:0, z:14, type:${JSON.stringify(type)} });   /* spawnEnemy pushes rather than returns */
  const en = enemies[enemies.length-1];
  if(!en) return { err:'no enemy' };
  en.aware = false; en._wasAware = 0;
  window.__EN = en; window.__snd = [];
  return { spawned: en.type, at:[+en.mesh.position.x.toFixed(1), +en.mesh.position.z.toFixed(1)], speed:+(en.speed||0).toFixed(1) };
})()`;

const REPORT = `(function(){
  const en = window.__EN;
  const steps = window.__snd.filter(s=>/^noise:(260|420)@pos$/.test(s)).length;
  const spots = window.__snd.filter(s=>/^tone:(90|170)@pos$/.test(s)).length;
  const fuse  = window.__snd.filter(s=>/^tone:1500@pos$/.test(s)).length;
  return { steps, spots, fuse, total:window.__snd.length,
           movedTo: en && en.mesh ? +en.mesh.position.z.toFixed(1) : null,
           aware: !!(en && en.aware) };
})()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(REC)));

  for (const type of ['grunt', 'brute', 'sapper']) {
    console.log('\\n--- a ' + type + ' walks at the player for 5 s ---');
    console.log('  spawn :', JSON.stringify(await P(WALK(type, 5))));
    await page.waitForTimeout(5200);
    console.log('  heard :', JSON.stringify(await P(REPORT)));
  }

  console.log('\\n--- the same, with the enemy ACROSS the arena (out of range) ---');
  console.log('  spawn :', JSON.stringify(await P(`(function(){
    enemies.slice().forEach(e=>{ try{ scene.remove(e.mesh); }catch(_){} }); enemies.length = 0;
    player.pos.set(0, EYE, 30); player.yaw = Math.PI;
    spawnEnemy({ x:0, z:-45, type:'grunt' });
    const en = enemies[enemies.length-1]; window.__EN = en; window.__snd = [];
    return { at: en ? +en.mesh.position.z.toFixed(0) : null, distFromPlayer: en ? +Math.abs(en.mesh.position.z-30).toFixed(0) : null, rangeGate: ENEMY_STEP_RANGE };
  })()`)));
  await page.waitForTimeout(4200);
  console.log('  heard :', JSON.stringify(await P(REPORT)));

  console.log('\\n--- the sound definitions themselves ---');
  console.log('  step  :', JSON.stringify(await P(`(function(){
    window.__snd=[]; SFX.enemyStep(new THREE.Vector3(0,1,25), false); const light=window.__snd.slice();
    window.__snd=[]; SFX.enemyStep(new THREE.Vector3(0,1,25), true);  return { light, heavy:window.__snd.slice() };
  })()`)));
  console.log('  spot  :', JSON.stringify(await P(`(function(){
    window.__snd=[]; SFX.enemySpot(new THREE.Vector3(0,1,25), false); const light=window.__snd.slice();
    window.__snd=[]; SFX.enemySpot(new THREE.Vector3(0,1,25), true);  return { light, heavy:window.__snd.slice() };
  })()`)));
  console.log('  player step is still FLAT (not positional) :', JSON.stringify(await P(`(function(){
    window.__snd=[]; SFX.step(); return window.__snd.slice();
  })()`)));
}, { settleMs: 9000 });
