import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  await P(`(function(){
    let o = dynamicProps[0];
    if(!o){ o = propModels.find(p=>p && !p.userData.runtime); if(o) setPropDynamic(o, true); }
    o.scale.set(1,1,1); o.position.set(0,1,32); if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    player.pos.set(0,EYE,30); player.yaw=Math.PI; player.pitch=0; window.__crate=o; return 1; })()`);
  await page.waitForTimeout(2500);
  console.log('direct strike, crowbar:', JSON.stringify(await P(`(function(){
    const o=window.__crate; o.userData.hp=900;
    _meleeStrike(WEAPONS.crowbar, WEAPONS.crowbar.reach, WEAPONS.crowbar.dmg);
    return { dmg: 900-o.userData.hp, reach:WEAPONS.crowbar.reach, wdmg:WEAPONS.crowbar.dmg,
             gameOn:!!gameOn, editorOpen:!!editorOpen, paused:!!paused, duelDead:!!duelDead };
  })()`)));
  console.log('direct strike, hands  :', JSON.stringify(await P(`(function(){
    const o=window.__crate; o.userData.hp=900;
    _meleeStrike(WEAPONS.hands, WEAPONS.hands.reach, WEAPONS.hands.dmg);
    return { dmg: 900-o.userData.hp, reach:WEAPONS.hands.reach, wdmg:WEAPONS.hands.dmg };
  })()`)));
  console.log('scheduled, crowbar    :', JSON.stringify(await P(`(function(){
    const o=window.__crate; o.userData.hp=900; _meleeT=0;
    window.__tokBefore=_meleeTok; meleeAttack(WEAPONS.crowbar); window.__tokAfter=_meleeTok;
    return { atInput:900-o.userData.hp, tokBefore:window.__tokBefore, tokAfter:window.__tokAfter };
  })()`)));
  await page.waitForTimeout(700);
  console.log('  700ms later        :', JSON.stringify(await P(
    "({ dmg:900-window.__crate.userData.hp, tokNow:_meleeTok })")));
}, { settleMs: 9000 });
