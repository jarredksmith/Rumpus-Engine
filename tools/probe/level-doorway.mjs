// build 1394: a doorway between levels.
//
// Asked for from use: "is there a way to trigger the next level? ... break out large rooms into separate
// json files ... a trigger that shows a loading message and then picks up with the newly loaded scene.
// Half-Life and Portal do this regularly."
//
// The transition existed (build 1352's `goto`). Three things were missing, and this probe drives all three
// through the REAL `_lgPulse` switch rather than calling a handler — build 1352 shipped `goto` into the
// wrong dispatcher and only a probe that drove the switch caught it.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  // --- a two-room campaign, built from the live level so both rooms are real -------------------------
  console.log('setup:', JSON.stringify(await P(`(function(){
    /* ROOM 2 carries an arrival marker: a tagged primitive with a deliberate facing. */
    const base = serializeLevel();
    const room1 = JSON.parse(JSON.stringify(base)); room1.name = 'West Wing';
    const room2 = JSON.parse(JSON.stringify(base)); room2.name = 'Reactor Hall';
    /* put the marker at a place nothing else occupies, facing +X (yaw -PI/2) */
    const marker = { src:'box', t:[120, 0, -80, 0, -Math.PI/2, 0, 1,1,1], tg:'doorFromWest', nid:987654 };
    room2.props = (room2.props||[]).concat([marker]);
    campaign.levels = [room1, room2];
    campaignActive = true; campaignIdx = 0; _campaignComplete = false;
    return { levels: campaign.levels.map(l=>l.name), room2props: room2.props.length };
  })()`)));

  const state = () => P(`(function(){
    return { level: campaignIdx, name: (campaign.levels[campaignIdx]||{}).name,
      pos: [ +player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2) ],
      yaw: +player.yaw.toFixed(3), hp: player.hp,
      wep: curWep, mag: WEAPONS[curWep] ? WEAPONS[curWep].mag : null,
      owned: owned.slice(), loaderUp: _levelLoaderActive, title: _loaderTitle,
      arrivePending: _arrivePending ? _arrivePending.tag : null };
  })()`);

  // Fire the node through the real switch, exactly as a trigger zone would. `_lgPulse(id, pin)` takes an
  // ID and resolves it out of logicGraph.nodes — passing a node OBJECT returns at its first line, which is
  // how the first run of this probe reported every transition doing nothing. The node is re-pushed each
  // time because loading a level replaces logicGraph with the destination's own.
  const goto = (params) => P(`(function(){
    logicGraph.nodes = (logicGraph.nodes||[]).filter(n=>n.id!=='g1');
    logicGraph.nodes.push({ id:'g1', type:'goto', x:0, y:0, p:${JSON.stringify(params)} });
    _lgBudget = 0;
    _lgPulse('g1', 'in');
    return 1;
  })()`);
  // wait on the LOADER, not the clock: this sandbox renders ~1.5 fps and the reveal is frame-driven
  const settle = async (max = 40) => {
    for (let i = 0; i < max; i++) {
      if (!(await P('_levelLoaderActive'))) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };

  await P(`(function(){ startGame(); return 1; })()`);
  await settle();

  console.log('\\n-- before: room 1, roughed up and holding a rifle --');
  console.log(JSON.stringify(await P(`(function(){
    owned.length=0; owned.push('pistol','rifle'); curWep='rifle';
    WEAPONS.rifle.mag = 7; WEAPONS.rifle.reserve = 41; player.hp = 43;
    if(typeof switchWeapon==='function') switchWeapon('rifle');
    player.pos.set(3, EYE, 12); player.yaw = 1.0;
    return { hp:player.hp, mag:WEAPONS.rifle.mag, owned:owned.slice() };
  })()`)));

  // ---------------------------------------------------- 1. plain goto: unchanged behaviour + a cover
  await goto({ n: '2' });
  console.log('\\nPLAIN goto (no keep, no at):');
  console.log('  immediately  ', JSON.stringify(await state()));
  await settle();
  console.log('  settled      ', JSON.stringify(await state()));

  // ---------------------------------------------------- 2. back to room 1, then a seamless doorway
  await goto({ n: '1' });
  await settle();
  await P(`(function(){
    owned.length=0; owned.push('pistol','rifle'); curWep='rifle';
    WEAPONS.rifle.mag = 7; WEAPONS.rifle.reserve = 41; player.hp = 43;
    if(typeof switchWeapon==='function') switchWeapon('rifle');
    return 1;
  })()`);
  console.log('\\nSEAMLESS goto (keep + arrive at "doorFromWest"):');
  await goto({ n: '2', at: 'doorFromWest', keep: 1 });
  console.log('  immediately  ', JSON.stringify(await state()));
  await settle();
  console.log('  settled      ', JSON.stringify(await state()));
  console.log('  marker is at ', JSON.stringify(await P(`(function(){
    const m = propModels.find(o=>o&&o.userData&&o.userData.tag==='doorFromWest');
    return m ? { at:[+m.position.x.toFixed(2),+m.position.y.toFixed(2),+m.position.z.toFixed(2)], yaw:+m.rotation.y.toFixed(3) } : 'MISSING';
  })()`)));

  // ---------------------------------------------------- 3. a tag nothing carries must SAY so
  console.log('\\nBAD TAG:');
  await goto({ n: '1', at: 'noSuchDoor' });
  await settle();
  console.log('  settled      ', JSON.stringify(await state()));
  console.log('  reported     ', JSON.stringify(await P(`(function(){
    const iss = (typeof levelIssues==='function') ? levelIssues() : [];
    return iss.filter(t=>/noSuchDoor/.test(String(t))).map(t=>String(t).slice(0,150));
  })()`)));

  // ---------------------------------------------------- 4. the guards 1352 shipped are untouched
  console.log('\\nGUARDS:', JSON.stringify(await P(`(function(){
    const out = {};
    const before = campaignIdx;
    const put=(pp)=>{ logicGraph.nodes = (logicGraph.nodes||[]).filter(n=>n.id!=='gg');
      logicGraph.nodes.push({ id:'gg', type:'goto', x:0, y:0, p:pp }); _lgBudget=0; _lgPulse('gg','in'); };
    put({ n:'99' }); out.outOfRange = (campaignIdx === before);
    put({ n:'0' });  out.zero = (campaignIdx === before);
    const wasActive = campaignActive; campaignActive = false;
    put({ n:'2' });  out.notInCampaign = (campaignIdx === before);
    campaignActive = wasActive;
    out.armedNothing = (_arrivePending === null);
    out.coverNotLeft = (_loadCover === false);
    return out;
  })()`)));
}, { settleMs: 9000 });
