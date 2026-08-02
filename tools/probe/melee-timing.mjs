// REPORTED: "it deals damage immediately, even though the swing hasn't gotten close to the prop yet."
// Measure the gap between the swing input and the prop actually losing health.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P(`(function(){
    let o = dynamicProps[0];
    if(!o){ o = propModels.find(p=>p && !p.userData.runtime); if(o) setPropDynamic(o, true); }
    o.scale.set(1,1,1); o.position.set(0,1,32); if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    player.pos.set(0,EYE,30); player.yaw=Math.PI; player.pitch=0; window.__crate=o; return 1; })()`);
  await page.waitForTimeout(2500);

  for (const w of ['crowbar', 'hands']) {
    console.log(('swing ' + w).padEnd(14), JSON.stringify(await P(`(function(){
      const o=window.__crate; o.userData.hp=900; _meleeT=0; _meleeTok=0;
      const t0=performance.now();
      meleeAttack(WEAPONS['${w}']);
      const immediate = 900 - o.userData.hp;
      return { windup:WEAPONS['${w}'].windup, damageAtInputFrame:immediate };
    })()`)));
    await page.waitForTimeout(600);
    console.log('  after windup ', JSON.stringify(await P(
      "({ damageNow: 900 - window.__crate.userData.hp })")));
  }

  console.log('cancel by weapon switch:', JSON.stringify(await P(`(function(){
    const o=window.__crate; o.userData.hp=900; _meleeT=0;
    meleeAttack(WEAPONS.crowbar);
    if(!owned.includes('pistol')) owned.push('pistol');
    switchWeapon('pistol');            /* put it away mid-swing */
    return { atInput: 900-o.userData.hp };
  })()`)));
  await page.waitForTimeout(600);
  console.log('  after windup ', JSON.stringify(await P("({ damageNow: 900 - window.__crate.userData.hp })")));
}, { settleMs: 9000 });
