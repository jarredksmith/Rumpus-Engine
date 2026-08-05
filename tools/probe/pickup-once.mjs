// build 1396 — REPORTED FROM PLAY: "there needs to be an option for spawned pickups that it doesn't keep
// respawning after the item has been picked up. Right now it just infinitely keeps popping back up after a
// little bit. I want an option that allows it to be only picked up once and then it doesn't come back."
//
// A RESPAWNING pad sits beside the one-shot in every run as the control: a one-shot that stays gone while
// the control also stays gone would mean the clock, not the flag.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    /* two identical health pads: one authored one-shot, one ordinary */
    pickupSpots.length = 0;
    pickupSpots.push({ x: 0,  z: 40, kind:'health', once:true });
    pickupSpots.push({ x: 8,  z: 40, kind:'health' });
    pickupSpots.push({ x: 16, z: 40, kind:'key_red' });     /* one-shot by its nature, since forever */
    spawnPowerups();
    return { pads: powerups.length, kinds: powerups.map(p=>p.kind),
             once: powerups.map(p=>_puOnce(p)) };
  })()`)));

  const pads = () => P(`(function(){
    return powerups.map(p=>({ kind:p.kind, once:!!p.once, ready:p.ready, gone:!!p.gone,
      cd:+p.cd.toFixed(1), visible: p.mesh ? p.mesh.visible : null }));
  })()`);

  console.log('\\nfresh      ', JSON.stringify(await pads()));

  // take all three, through the real consume the grant sites use
  await P(`(function(){ for(const p of powerups){ grantPowerup({ id:NET.myId }, p.kind, p.item); _puConsume(p); } return 1; })()`);
  console.log('just taken ', JSON.stringify(await pads()));

  // run the real updatePowerups past the 15 s cooldown, in one go
  await P(`(function(){ for(let i=0;i<40;i++) updatePowerups(0.5); return 1; })()`);
  console.log('20 s later ', JSON.stringify(await pads()));
  await P(`(function(){ for(let i=0;i<400;i++) updatePowerups(0.5); return 1; })()`);
  console.log('220 s later', JSON.stringify(await pads()));

  // ---- once per RUN, not once forever: a fresh deploy restores it --------------------------------
  console.log('\\nafter a redeploy:', JSON.stringify(await P(`(function(){
    spawnPowerups();
    return powerups.map(p=>({ kind:p.kind, once:!!p.once, ready:p.ready, gone:!!p.gone }));
  })()`)));

  // ---- the round trip, because a flag that does not survive a save is not a setting ---------------
  console.log('\\nround trip:', JSON.stringify(await P(`(function(){
    const lv = serializeLevel();
    const written = lv.pickups.map(s=>({ kind:s.kind, once:s.once }));
    /* and back in through the loader every level load uses */
    const back = lv.pickups.map(s=>({ x:+s.x||0, z:+s.z||0, kind:s.kind||'health', once:!!s.once }));
    return { written, backOnce: back.map(s=>s.once) };
  })()`)));

  // ---- and the whole point: an ordinary pad still comes back ---------------------------------------
  console.log('\\nordinary pad, taken and left alone for 20 s:', JSON.stringify(await P(`(function(){
    const p = powerups.find(x=>x.kind==='health' && !x.once);
    grantPowerup({ id:NET.myId }, p.kind, p.item); _puConsume(p);
    const taken = { ready:p.ready, visible:p.mesh.visible };
    for(let i=0;i<40;i++) updatePowerups(0.5);
    return { taken, after: { ready:p.ready, visible:p.mesh.visible } };
  })()`)));
}, { settleMs: 9000 });
