// build 1395 — REPORTED FROM PLAY: "when a prop is set as something you can blow up/break (target practice
// style), when it reloads the prop, the prop has a red tint to it."
//
// A DYNAMIC prop is the control: it goes through the identical damageProp flash and must clear in ~140 ms,
// which is what tells us the decay works at all and that the static case is a real difference rather than
// a probe that never waited long enough.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    const cands = propModels.filter(p => p && p.userData && !p.userData.runtime && !p.userData.phys);
    const tgt = cands[0], ctl = cands[1];
    tgt.userData._role='static'; ctl.userData._role='dynamic';
    for(const o of [tgt, ctl]) o.scale.set(1,1,1);
    tgt.position.set(0, 1, 40); ctl.position.set(6, 1, 40);
    if(typeof setPropDynamic==='function') setPropDynamic(ctl, true);
    tgt.userData.shootable = true;
    for(const o of [tgt, ctl]){ o.userData.breakable = true; o.userData.maxHp = 500; o.userData.hp = 500; }
    if(typeof refreshPropCollider==='function'){ refreshPropCollider(tgt); refreshPropCollider(ctl); }
    return { staticInDyn: dynamicProps.indexOf(tgt)>=0, ctlInDyn: dynamicProps.indexOf(ctl)>=0,
             inDamageable: damageableProps().indexOf(tgt)>=0 };
  })()`)));

  const emissive = (role) => P(`(function(){
    const o = propModels.find(x=>x&&x.userData&&x.userData._role==='${role}');
    let hex = null, inten = null;
    o.traverse(m=>{ if(m.isMesh && m.material && m.material.emissive && hex===null){
      hex = '#'+m.material.emissive.getHexString(); inten = +m.material.emissiveIntensity.toFixed(2); } });
    return { hex, inten, flash: o.userData._flash ? 'set' : 0, hp: o.userData.hp };
  })()`);

  const hit = (role) => P(`(function(){
    const o = propModels.find(x=>x&&x.userData&&x.userData._role==='${role}');
    damageProp(o, 20, null, null, 0, NET.myId);
    return 1;
  })()`);

  for (const role of ['static', 'dynamic']) {
    console.log('\\n--- ' + role.toUpperCase() + (role === 'dynamic' ? '  (the control)' : '') + ' ---');
    console.log('  before hit ', JSON.stringify(await emissive(role)));
    await hit(role);
    console.log('  just hit   ', JSON.stringify(await emissive(role)));
    // the flash is 140 ms, but this sandbox renders ~1.5 fps and the decay runs in updateFragments —
    // wait on FRAMES, not the clock
    await P(`new Promise(r=>{ let n=0; const t=()=>{ if(++n>6) return r(1); requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
    console.log('  6 frames on', JSON.stringify(await emissive(role)));
  }

  // ---- and the reported sequence end to end: shoot it out, reset it, look at it -------------------
  console.log('\\n--- the report: destroy, then reset ---');
  console.log('  destroyed  ', JSON.stringify(await P(`(function(){
    const o = propModels.find(x=>x&&x.userData&&x.userData._role==='static');
    o.userData.hp = 5; damageProp(o, 99, null, null, 0, NET.myId);
    let hex=null; o.traverse(m=>{ if(m.isMesh && m.material && m.material.emissive && hex===null) hex='#'+m.material.emissive.getHexString(); });
    return { shattered: !!o.userData._shattered, visible: o.visible, emissive: hex };
  })()`)));
  console.log('  reset      ', JSON.stringify(await P(`(function(){
    const o = propModels.find(x=>x&&x.userData&&x.userData._role==='static');
    _restoreDestroyedProp(o);
    let hex=null, inten=null; o.traverse(m=>{ if(m.isMesh && m.material && m.material.emissive && hex===null){
      hex='#'+m.material.emissive.getHexString(); inten=+m.material.emissiveIntensity.toFixed(2); } });
    return { shattered: !!o.userData._shattered, visible: o.visible, hp: o.userData.hp,
             emissive: hex, intensity: inten, flash: o.userData._flash ? 'STILL SET' : 0 };
  })()`)));

  // ---- an emissive prop must get its OWN glow back, not black ------------------------------------
  console.log('\\n--- an authored glow survives the same round trip ---');
  console.log('  ', JSON.stringify(await P(`(function(){
    const o = propModels.find(x=>x&&x.userData&&x.userData._role==='static');
    applyPropEmissive(o, 0x38f5b5, 3);
    damageProp(o, 20, null, null, 0, NET.myId);
    o.userData.hp = 5; damageProp(o, 99, null, null, 0, NET.myId);
    _restoreDestroyedProp(o);
    let hex=null, inten=null; o.traverse(m=>{ if(m.isMesh && m.material && m.material.emissive && hex===null){
      hex='#'+m.material.emissive.getHexString(); inten=+m.material.emissiveIntensity.toFixed(2); } });
    return { emissive: hex, intensity: inten, wanted: '#38f5b5 @ 3' };
  })()`)));
}, { settleMs: 9000 });
