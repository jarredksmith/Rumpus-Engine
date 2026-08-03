// build 1316 (gameplay audit F4) — "there is no rotational slowdown near a target, no bullet magnetism, no
// target snap. Rumpus ships a full touch layout editor and a gamepad prefs panel, so it clearly intends
// those inputs to be first-class; a 3D FPS with zero aim assist on a stick is not."
//
// Drives the REAL scan against REAL enemies in the REAL scene, and measures the two things that matter:
// how much the look slows on target, and how far a fixed stick input actually turns you.
import { withGame } from './driver.mjs';

const SPAWN = `(function(){
  enemies.slice().forEach(e=>{ try{ scene.remove(e.mesh); }catch(_){} }); enemies.length = 0;
  /* TWO instrument errors cost a run each here, both worth recording:
     1. the engine's forward is (-sin yaw, -cos yaw), so yaw = PI faces +Z — the enemy has to go at +Z of
        the player, not -Z. The first run had it backwards and read k=0 everywhere.
     2. the second run put them on a line the stock level has a WALL across (a box at z[26,35] y[0,1.2] and
        another to y=2.5): segmentBlocked correctly said "blocked" and the assist correctly declined. Open
        ground had to be FOUND rather than assumed — (0,0) is clear in all four directions. */
  player.pos.set(0, EYE, 0); player.pitch = 0; player.hp = player.maxHp;
  spawnEnemy({ x:0, z:20, type:'grunt' });          /* 20 m dead ahead when yaw = PI, on clear ground */
  const en = enemies[enemies.length-1];
  if(en){ en.dead = false; en.hp = 100; }
  return { at: en ? [+en.mesh.position.x.toFixed(1), +en.mesh.position.z.toFixed(1)] : null, n: enemies.length };
})()`;

const SCAN = (yawDeg) => `(function(){
  player.pos.set(0, EYE, 0); player.yaw = Math.PI + (${yawDeg} * Math.PI/180);
  _aimAssistScan();
  return { offDeg:${yawDeg}, slow:+_aaSlow.toFixed(3), k:+_aaK.toFixed(3),
           pullYawDeg:+(_aaYaw*180/Math.PI).toFixed(2) };
})()`;

await withGame(async (P, page) => {
  console.log('consts   :', JSON.stringify(await P(`(function(){
    return { coneDeg:+(AA_CONE*180/Math.PI).toFixed(1), slowMin:AA_SLOW_MIN, mag:AA_MAG, range:AA_RANGE, pref:padPrefs.aim };
  })()`)));
  console.log('spawn    :', JSON.stringify(await P(SPAWN)));
  await page.waitForTimeout(500);

  console.log('\\n--- ADHESION: look slowdown vs angle off target ---');
  for (const d of [0, 2, 4, 6, 8, 10, 20]) console.log('  ' + String(d).padStart(3) + ' deg off:', JSON.stringify(await P(SCAN(d))));

  console.log('\\n--- MAGNETISM: a fixed stick input, with and without ---');
  console.log(JSON.stringify(await P(`(function(){
    const turn = (assist, off) => {
      padPrefs.aim = assist;
      player.pos.set(0, EYE, 0); player.yaw = Math.PI + (off*Math.PI/180); player.pitch = 0;
      const y0 = player.yaw;
      for(let i=0;i<30;i++){          /* half a second of a half-deflected stick, the same input both times */
        _aimAssistScan();
        const rx = 0.5, _sm = (padPrefs.sens||1) * _aaSlow;
        player.yaw -= (rx*Math.abs(rx)) * PAD_LOOK_YAW * _sm * (1/60);
        _aimAssistPull(1/60, Math.abs(rx));
      }
      return +((player.yaw - y0)*180/Math.PI).toFixed(2);
    };
    const r = { offAt4deg: turn(0, 4), onAt4deg: turn(1, 4), offFarAway: turn(0, 40), onFarAway: turn(1, 40) };
    padPrefs.aim = 1; return r;
  })()`)));
  console.log('  (a smaller sweep on target = the look is being held there; far from any target the two must MATCH)');

  console.log('\\n--- THE THINGS IT MUST NOT DO ---');
  console.log('assist 0     :', JSON.stringify(await P(`(function(){
    padPrefs.aim = 0; player.pos.set(0, EYE, 0); player.yaw = Math.PI; _aimAssistScan();
    const r = { slow:_aaSlow, k:_aaK }; padPrefs.aim = 1; return r;
  })()`)));
  console.log('still stick  :', JSON.stringify(await P(`(function(){
    player.pos.set(0, EYE, 0); player.yaw = Math.PI; player.pitch = 0; _aimAssistScan();
    const y0 = player.yaw;
    for(let i=0;i<60;i++) _aimAssistPull(1/60, 0);        /* a full second with the stick at rest */
    return { drifted:+((player.yaw-y0)*180/Math.PI).toFixed(4), k:+_aaK.toFixed(3) };
  })()`)));
  console.log('dead enemy   :', JSON.stringify(await P(`(function(){
    const en = enemies[enemies.length-1]; en.dead = true;
    player.pos.set(0, EYE, 0); player.yaw = Math.PI; _aimAssistScan(); const r = { k:_aaK, slow:_aaSlow };
    en.dead = false; return r;
  })()`)));
  console.log('behind you   :', JSON.stringify(await P(`(function(){
    player.pos.set(0, EYE, 0); player.yaw = 0; _aimAssistScan(); return { k:+_aaK.toFixed(3), slow:+_aaSlow.toFixed(3) };
  })()`)));
  console.log('out of range :', JSON.stringify(await P(`(function(){
    const en = enemies[enemies.length-1]; const z0 = en.mesh.position.z;
    en.mesh.position.z = AA_RANGE + 15; player.pos.set(0, EYE, 0); player.yaw = Math.PI; _aimAssistScan();
    const r = { k:_aaK, distance: AA_RANGE + 15 }; en.mesh.position.z = z0; return r;
  })()`)));
  console.log('in the editor:', JSON.stringify(await P(`(function(){
    player.pos.set(0, EYE, 0); player.yaw = Math.PI;
    if(typeof toggleEditor==='function' && !editorOpen) toggleEditor();
    _aimAssistScan(); const r = { k:_aaK, slow:_aaSlow };
    if(typeof toggleEditor==='function' && editorOpen) toggleEditor();
    return r;
  })()`)));
  await page.waitForTimeout(400);
  console.log('a MOUSE      :', JSON.stringify(await P(`(function(){
    /* the mouse look handler must not read _aaSlow at all — a mouse is never assisted */
    const h = String(document.onmousemove || '');
    return { padReads: /(_aaSlow)/.test(String(pollGamepad)), mouseReads: /_aaSlow/.test(h) };
  })()`)));
}, { settleMs: 9000 });
