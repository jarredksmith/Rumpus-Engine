// build 1398 — REPORTED FROM PLAY: "marking a prop as a target that is breakable doesn't save with the
// level. When I re-open or refresh, I can't break the prop and have to go back and tick the box again."
//
// Build 1390's own probe checked `propEntry(o)` — the WRITE — and stopped there. This drives the real
// serializeLevel -> restoreLevel round trip and then SHOOTS the prop that comes back, because "the flag is
// in the file" and "the target is breakable after a reload" turned out to be different facts.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    const cands = propModels.filter(p => p && p.userData && !p.userData.runtime && !p.userData.phys);
    const tgt = cands[0], carried = cands[1];
    /* UNCONDITIONALLY. The first run of this probe wrote nid = nid || 770001 and the props already had one
       ("s-1"), so the assignment was a no-op and every later search found nothing — which read exactly like
       "the restore dropped the prop". */
    tgt.userData.nid = 770001;
    carried.userData.nid = 770002;
    tgt.userData._tag2 = 'plate'; carried.userData._tag2 = 'rider';
    tgt.scale.set(1,1,1); tgt.position.set(0, 1, 32);
    /* the exact authoring the report describes: tick Shootable, tick Breakable, set health */
    tgt.userData.shootable = true; tgt.userData.breakable = true;
    tgt.userData.maxHp = 40; tgt.userData.hp = 40; tgt.userData.breakStyle = 'puff';
    tgt.userData.hitSnd = 'https://example.test/clang.mp3';
    /* and build 1309's own stated commonest case, which nobody reported: a STATIC crate riding a lift */
    carried.userData.parNid = '770001';
    if(typeof refreshPropCollider==='function') refreshPropCollider(tgt);
    const e = propEntry(tgt), e2 = propEntry(carried);
    return { written: { sht:e.sht, hp:e.hp, bst:e.bst, hsn: e.hsn ? 'set' : undefined, dyn:e.dyn },
             carriedWritten: { par: e2.par, dyn: e2.dyn } };
  })()`)));

  // THE ROUND TRIP: serialize, wipe, restore — the real thing a save-and-reopen does
  console.log('\\nafter a real save + restore:', JSON.stringify(await P(`(function(){
    const lv = serializeLevel();
    restoreLevel(JSON.parse(JSON.stringify(lv)));
    const t = propModels.find(o=>o&&o.userData&&o.userData.nid===770001 || (o&&o.userData&&o.userData.nid==='770001'));
    const c = propModels.find(o=>o&&o.userData&&(o.userData.nid===770002 || o.userData.nid==='770002'));
    return {
      target: t ? { shootable: !!t.userData.shootable, breakable: t.userData.breakable,
                    maxHp: t.userData.maxHp, hp: t.userData.hp, breakStyle: t.userData.breakStyle,
                    hitSnd: t.userData.hitSnd ? 'restored' : 'LOST',
                    inDamageable: damageableProps().indexOf(t) >= 0 } : 'PROP MISSING',
      carried: c ? { parNid: c.userData.parNid || 'LOST' } : 'PROP MISSING' };
  })()`)));

  // and the report's own test: can you break it now?
  console.log('\\nshoot the restored target:', JSON.stringify(await P(`(function(){
    const t = propModels.find(o=>o&&o.userData&&(o.userData.nid===770001 || o.userData.nid==='770001'));
    if(!t) return 'PROP MISSING';
    t.position.set(0, 1, 32); if(typeof refreshPropCollider==='function') refreshPropCollider(t);
    player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
    curWep='rifle'; WEAPONS.rifle.mag = 30;
    const hp0 = t.userData.hp; const out=[];
    for(let i=0;i<3;i++){ lastShot=0; shoot(); out.push(t.userData.hp); }
    return { hp0, afterEachShot: out, shattered: !!t.userData._shattered };
  })()`)));

  // ---- the CONTROL: a dynamic prop's own state must still round-trip exactly as it did ------------
  console.log('\\ndynamic control:', JSON.stringify(await P(`(function(){
    const c = propModels.filter(p=>p&&p.userData&&!p.userData.runtime&&!p.userData.phys&&!p.userData._tag2)[0];
    c.userData.nid = 770003;
    if(typeof setPropDynamic==='function') setPropDynamic(c, true);
    c.userData.mass = 7; c.userData.noGrab = true; c.userData.maxHp = 55; c.userData.hp = 55;
    c.userData.breakStyle = 'puff'; c.userData.onFire = true; c.userData.fireDps = 9;
    const lv = serializeLevel();
    restoreLevel(JSON.parse(JSON.stringify(lv)));
    const b = propModels.find(o=>o&&o.userData&&(o.userData.nid===770003||o.userData.nid==='770003'));
    return b ? { dyn: !!b.userData.phys, mass: b.userData.mass, noGrab: !!b.userData.noGrab,
                 maxHp: b.userData.maxHp, breakStyle: b.userData.breakStyle,
                 onFire: !!b.userData.onFire, fireDps: b.userData.fireDps } : 'MISSING';
  })()`)));

  // ---- and an ORDINARY static prop gains nothing — this must not make every wall breakable --------
  console.log('\\nplain static prop:', JSON.stringify(await P(`(function(){
    const p = propModels.filter(o=>o&&o.userData&&!o.userData.phys&&!o.userData.shootable&&!o.userData._tag2)[0];
    return { breakable: p.userData.breakable, maxHp: p.userData.maxHp,
             inDamageable: damageableProps().indexOf(p) >= 0 };
  })()`)));
}, { settleMs: 9000 });
