// REPORTED: "it freezes the animation on idle after I use the weapon a few times. The character gets stuck
// in the idle position, no animation, but I can still move. Running a distance away picks it back up."
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P("tpMode=true; player.pos.set(0,EYE,30); player.yaw=Math.PI; 1;");
  await page.waitForTimeout(3000);
  await P(`window.__snap = function(){
    const a=_ownAvatar, v=a&&a.userData.visual, acts=v&&v.userData.stateActions;
    if(!acts) return { err:'no actions', hasModel:!!(a&&a.userData.hasModel) };
    const live=[]; for(const k in acts){ const x=acts[k]; if(x.getEffectiveWeight&&x.getEffectiveWeight()>0.01)
      live.push(k+' w'+x.getEffectiveWeight().toFixed(2)+' t'+(x.time||0).toFixed(2)+(x.paused?' PAUSED':'')+(x.loop===THREE.LoopOnce?' ONCE':'')); }
    return { animState:v.userData.animState, live:live, climb:_climbAnim||'', evt:(_ownEvt&&performance.now()<_ownEvt.until)?_ownEvt.slot:'', curWep:curWep };
  }; 1;`);

  console.log('idle      ', JSON.stringify(await P('window.__snap()')));
  await P("if(!owned.includes('crowbar')) owned.push('crowbar'); switchWeapon('crowbar'); 1;");
  await page.waitForTimeout(900);
  for (let i = 0; i < 4; i++) {
    await P("_meleeT=0; meleeAttack(WEAPONS.crowbar); 1;");
    await page.waitForTimeout(500);
    console.log('swing ' + (i + 1) + '   ', JSON.stringify(await P('window.__snap()')));
  }
  await page.waitForTimeout(2500);
  console.log('2.5s later', JSON.stringify(await P('window.__snap()')));
  await page.waitForTimeout(2500);
  console.log('5s later  ', JSON.stringify(await P('window.__snap()')));
}, { settleMs: 9000 });
