// build 1311 — REPORTED FROM PLAY: "unless the character is directly facing the object with the cross-hair
// dead middle of the prop they're trying to hit, it doesn't deal damage. With a sword, if the player isn't
// dead on, even if it visually looks like a strike landed, it doesn't count."
//
// Sweeps the aim across the swing and asks, at each angle, whether a REAL swing at a REAL crate dealt
// damage. The answer before this build should be a needle; after it, an arc.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  tpMode = false;
  player.pos.set(0, EYE, 30); player.pitch = 0;
  let o = dynamicProps[0];
  if(!o){ o = propModels.find(p=>p && !p.userData.runtime); if(!o) return { err:'no props' };
    if(typeof setPropDynamic==='function') setPropDynamic(o, true); }
  o.scale.set(1,1,1); o.position.set(0, 1, 32);          /* 2.0 m in front — inside the 2.9 m reach */
  o.userData.breakable = true; o.userData.maxHp = 1e9; o.userData.hp = 1e9;
  if(typeof refreshPropCollider==='function') refreshPropCollider(o);
  window.__O = o;
  const b = o.userData.box;
  return { at:o.position.toArray(), halfWidth:+((b.max.x-b.min.x)/2).toFixed(2), reach:WEAPONS.crowbar.reach };
})()`;

// meleeAttack reads the direction from camera.getWorldDirection, which only updates in the frame loop —
// so the yaw has to be set a FRAME before the swing (build 1303's probe learned this the hard way).
const SWING = (deg) => `(function(){
  const o = window.__O;
  player.yaw = Math.PI + (${deg} * Math.PI/180);
  return 'aimed';
})()`;
const RESULT = `(function(){
  const o = window.__O; const hp0 = o.userData.hp;
  _meleeT = 0; _meleeTok++;
  if(typeof _meleeStrike==='function') _meleeStrike(WEAPONS.crowbar, WEAPONS.crowbar.reach||2.9, WEAPONS.crowbar.dmg);
  return +(hp0 - o.userData.hp).toFixed(0);
})()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(SETUP)));
  await page.waitForTimeout(1200);
  const rows = [];
  for (const deg of [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 110]) {
    await P(SWING(deg));
    await page.waitForTimeout(180);           // let the frame loop refresh the camera basis
    const dmg = await P(RESULT);
    rows.push([deg, dmg]);
  }
  console.log('yaw off-centre  ->  damage dealt');
  for (const [d, dmg] of rows) console.log(String(d).padStart(4) + ' deg   ' + (dmg > 0 ? 'HIT  (' + dmg + ')' : 'miss'));
  const hits = rows.filter(r => r[1] > 0).map(r => r[0]);
  console.log('widest hit angle:', hits.length ? Math.max(...hits) + ' deg' : 'none');

  // pitch too — a downward chop at a crate by your feet is the same complaint one axis over
  console.log('\\npitch off-centre ->  damage dealt');
  await P("player.yaw = Math.PI; 1;"); await page.waitForTimeout(200);
  for (const deg of [0, 10, 20, 30, 45, 60]) {
    await P(`player.pitch = ${-deg} * Math.PI/180; 1;`);
    await page.waitForTimeout(180);
    console.log(String(deg).padStart(4) + ' deg down   ' + ((await P(RESULT)) > 0 ? 'HIT' : 'miss'));
  }

  // and the thing that must NOT change: a crate outside the reach is still a miss
  console.log('\\nout of reach:', JSON.stringify(await P(`(function(){
    player.pitch = 0; player.yaw = Math.PI;
    const o = window.__O; o.position.set(0, 1, 30 + 6); if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    const hp0 = o.userData.hp; _meleeT = 0; _meleeTok++;
    _meleeStrike(WEAPONS.crowbar, WEAPONS.crowbar.reach||2.9, WEAPONS.crowbar.dmg);
    return { distance:6, damaged:+(hp0-o.userData.hp).toFixed(0) };
  })()`)));
  console.log('behind you  :', JSON.stringify(await P(`(function(){
    const o = window.__O; o.position.set(0, 1, 28); if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    return { placed:'2m BEHIND the player' };
  })()`)));
  await page.waitForTimeout(250);
  console.log('  -> ', JSON.stringify(await P(RESULT)));
}, { settleMs: 9000 });
