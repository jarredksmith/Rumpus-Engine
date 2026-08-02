// REPORTED: "if I give the player a sword as a melee weapon, I can't break/explode props if I swing at it."
// meleeAttack's prop test raycasts from the CAMERA and range-limits on the distance from the CAMERA, while
// its enemy test uses a cone measured from the PLAYER. In third person the camera is a boom metres behind.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  // put a dynamic prop directly in front of the spawn, the way a creator would place a barrel
  console.log('setup:', JSON.stringify(await P(`(function(){
    player.pos.set(0,EYE,30); player.yaw=Math.PI; player.pitch=0;   /* face +Z */
    /* the stock level ships no dynamic props, so make one the way the editor's Dynamic toggle does */
    let o = dynamicProps[0];
    if(!o){ o = propModels.find(p=>p && !p.userData.runtime);
      if(!o) return { err:'no props at all' };
      if(typeof setPropDynamic==='function') setPropDynamic(o, true); }
    if(dynamicProps.indexOf(o)<0) return { err:'setPropDynamic did not register it', dyn:dynamicProps.length };
    /* the first prop in the stock level is a 16-unit floor slab; scale it to a crate or the ray starts
       INSIDE it and three reports no hit at all (front faces only) — that cost a probe run */
    o.scale.set(1,1,1); o.position.set(0, 1, 32);   /* 2.0 m in front */
    if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    return { dyn:dynamicProps.length, prop:o.userData.src||'(prim)', at:o.position.toArray(), scale:o.scale.toArray() };
  })()`)));

  const measure = () => P(`(function(){
    const RANGE = 2.9;
    /* build 1295 ships this: drive the REAL swing and see whether the prop actually took damage */
    const prop = dynamicProps[0];
    if(prop.userData.hp==null) prop.userData.hp = (typeof defaultHpFor==='function') ? defaultHpFor(prop) : 100;
    const hp0 = prop.userData.hp;
    _meleeT = 0;                                   /* clear the cooldown so each trial really swings */
    meleeAttack(WEAPONS.crowbar);
    const hp1 = prop.userData.hp;
    raycaster.setFromCamera({x:0,y:0}, camera);
    const ph = raycaster.intersectObjects(dynamicProps, true);
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const rc2 = new THREE.Raycaster(); rc2.set(new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z), fwd.clone().normalize());
    const ph2 = rc2.intersectObjects(dynamicProps, true);
    const camBack = Math.hypot(camera.position.x-player.pos.x, camera.position.z-player.pos.z);
    return { tp:!!tpActive(), camY:+camera.position.y.toFixed(2), camBehindPlayer:+camBack.toFixed(2),
      camToProp: ph.length ? +ph[0].distance.toFixed(2) : null,
      playerToProp: ph2.length ? +ph2[0].distance.toFixed(2) : null,
      REAL_SWING_damaged: +(hp0-hp1).toFixed(1),
      OLD_camera_test: !!(ph.length && ph[0].distance<=RANGE),
      FROM_PLAYER_hits: !!(ph2.length && ph2[0].distance<=RANGE),
      /* why is it missing at all? */
      fwd:[+fwd.x.toFixed(2),+fwd.y.toFixed(2),+fwd.z.toFixed(2)],
      playerAt:[+player.pos.x.toFixed(2),+player.pos.y.toFixed(2),+player.pos.z.toFixed(2)],
      propAt: dynamicProps[0] ? dynamicProps[0].position.toArray().map(v=>+v.toFixed(2)) : null,
      propVisible: dynamicProps[0] ? dynamicProps[0].visible : null,
      meshCount: dynamicProps[0] ? (function(){ let n=0; dynamicProps[0].traverse(x=>{ if(x.isMesh) n++; }); return n; })() : 0,
      rayHitsAnything: rc2.intersectObjects(scene.children, true).slice(0,2).map(h=>({d:+h.distance.toFixed(2), n:h.object.name||h.object.type})) };
  })()`);

  await P("tpMode=false; 1;"); await page.waitForTimeout(1500);
  console.log('FIRST  PERSON', JSON.stringify(await measure()));
  await P("tpMode=true; 1;"); await page.waitForTimeout(2500);
  console.log('THIRD  PERSON', JSON.stringify(await measure()));
}, { settleMs: 9000 });
