// Build 1296: can a creator turn the SMG into a sword and the shotgun into an axe, and do both actually
// swing? Driven through the real editor + the real shoot() path.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('factory melee slots:', JSON.stringify(await P(
    "Object.keys(WEAPONS).filter(k=>WEAPONS[k].melee).map(k=>k+':'+WEAPONS[k].melee)")));

  // author two melee weapons the way the editor does — through _wepApplyStats
  console.log('authoring:', JSON.stringify(await P(`(function(){
    const mk=(k,reach,rate,dmg,name)=>{ const keep={}; for(const s of GUN_STAT_KEYS) keep[s]=WEAPONS[k][s];
      keep.melee=1; keep.reach=reach; keep.fireRate=rate; keep.magSize=0; keep.reserve0=0; keep.reserveMax=0; keep.reloadMs=0;
      _wepApplyStats(k, keep); WEAPONS[k].dmg=dmg; if(typeof _wepApplyName==='function') _wepApplyName(k, name);
      WEAPONS[k].mag=0; WEAPONS[k].reserve=0; };
    mk('smg', 3.2, 420, 55, 'SWORD');
    mk('shotgun', 3.8, 900, 110, 'AXE');
    return Object.keys(WEAPONS).filter(k=>WEAPONS[k].melee).map(k=>k+'='+WEAPONS[k].name+' reach'+WEAPONS[k].reach+' rate'+WEAPONS[k].fireRate+' mag'+WEAPONS[k].magSize);
  })()`)));

  // it round-trips through the level format
  console.log('serialize:  ', JSON.stringify(await P(`(function(){
    const L=serializeLevel(); const out={};
    for(const k of ['smg','shotgun','rifle','crowbar']) out[k]=L.weapons[k] ? (L.weapons[k].st||null) : null;
    return out;
  })()`)));

  // ...and comes back after a reload of that same level
  console.log('round trip: ', JSON.stringify(await P(`(function(){
    const L=JSON.parse(JSON.stringify(serializeLevel()));
    for(const k in WEAPONS) _wepApplyStats(k, null);                       /* wipe to factory */
    const wiped=Object.keys(WEAPONS).filter(k=>WEAPONS[k].melee).join(',');
    for(const k in WEAPONS){ const wd=L.weapons[k]; if(wd) _wepApplyStats(k, wd.st); }
    return { afterWipe:wiped, afterReload:Object.keys(WEAPONS).filter(k=>WEAPONS[k].melee).map(k=>k+'/'+WEAPONS[k].reach).join(',') };
  })()`)));

  // is the spurious crowbar magSize there before ANYTHING touches it?
  console.log('boot state: ', JSON.stringify(await P(
    "({ crowbarMagSize:WEAPONS.crowbar.magSize, base:GUN_BASE.crowbar.magSize, pellets:WEAPONS.crowbar.pellets, basePellets:GUN_BASE.crowbar.pellets })")));

  // and they SWING. The pose must be set a FRAME BEFORE the swing: meleeAttack takes its direction from
  // camera.getWorldDirection, and the camera only picks up a new player.yaw in the frame loop — swinging in
  // the same synchronous block as the teleport aims wherever the camera was already looking, which reads
  // exactly like "the weapon does no damage".
  await P(`(function(){
    let o = dynamicProps[0];
    if(!o){ o = propModels.find(p=>p && !p.userData.runtime); if(o) setPropDynamic(o, true); }
    o.scale.set(1,1,1); o.position.set(0,1,32); if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    player.pos.set(0,EYE,30); player.yaw=Math.PI; player.pitch=0; window.__crate=o; return 1; })()`);
  await page.waitForTimeout(2500);

  for (const k of ['smg', 'shotgun', 'crowbar', 'rifle']) {
    console.log(('swing ' + k).padEnd(16), JSON.stringify(await P(`(function(){
      const o=window.__crate;
      if(!owned.includes('${k}')) owned.push('${k}');
      curWep='${k}'; o.userData.hp=500; lastShot=0; _meleeT=0; firingLatch=false; reloading=false; _drawUntil=0; _rlP=0;
      const before=o.userData.hp; shoot();
      return { name:WEAPONS['${k}'].name, melee:WEAPONS['${k}'].melee, reach:WEAPONS['${k}'].reach, damage:+(before-o.userData.hp).toFixed(0) };
    })()`)));
    await page.waitForTimeout(400);
  }
}, { settleMs: 9000 });
