// The gauntlet's MOVEMENT & TRAVERSAL booth as a level file — authored, saved, reloaded, then WALKED.
//
// The last of the scoped sections without a round trip. Its state is the ZONE serializers, which are the
// most hand-kept structure left in the file: eight zone types, each written out as an explicit field list
// in serializeLevel and read by its own migrator. That is precisely the shape build 1326 found three
// disagreeing copies of, and the shape builds 1398/1400/1401/1406/1427 each lost a field through.
//
// Water alone carries ten fields and two of them (flowDir, flowSpd) are current-drift; a jump pad carries
// its power; a ladder carries a facing; an effect zone carries a kind and an audience. None of that has
// ever been checked past the in-memory object.
//
// Everything here is authorable through the editor. Nothing pokes a runtime-only field.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P) => {
  const authored = await safe(P, DRIVE_RIG + `(function(){
    paused = false; gameOn = true;
    const B = 44;   // inside the arena, clear of the stock level (builds 1323 / 1405)

    /* every traversal zone a creator can place, each carrying a NON-DEFAULT value in every field it owns,
       because a field that happens to equal its default cannot tell a working loader from a missing one */
    jumpPads.length = 0;  jumpPads.push({ x:B, z:B, r:3, y:0, h:2.5, power:31 });
    ladders.length = 0;   ladders.push({ x:B+10, z:B, r:1.4, y:0, h:7, face:1.25 });
    waterZones.length = 0;
    waterZones.push({ x:B, z:B+14, r:9, y:0, h:2.5, color:0x2277aa, op:0.55, wave:1.7,
                      flowDir:1.1, flowSpd:2.4 });
    fxZones.length = 0;
    for(const k of ['heal','hurt','slow','haste','lowgrav'])
      fxZones.push(_migrateFxZone({ x:B+24, z:B, r:5, y:0, h:4, kind:k, amt:17, who:'both' }));
    deathZones.length = 0; deathZones.push({ x:B-14, z:B, r:4, y:0, h:5 });

    /* the world's movement block — every one of these is a slider in World, and every one changes how a
       level PLAYS rather than how it looks */
    Object.assign(worldCfg, { walk:7.5, run:15, jump:14.5, grav:26, crouch:2.4, jumpCut:0.35,
                              launchPower:1.4, eyeHeight:1.85 });
    applyWorldCfg();

    return { ok:true, pads:jumpPads.length, ladders:ladders.length, water:waterZones.length,
             fx:fxZones.length, death:deathZones.length };
  })()`);
  chk('the booth is authored', authored.ok && authored.fx === 5, JSON.stringify(authored));
  if (!authored.ok) { report(); return; }

  /* ---- SAVE --------------------------------------------------------------------------------------- */
  const saved = await safe(P, `(function(){
    window.__json = serializeLevel();
    const L = JSON.parse(JSON.stringify(window.__json));
    return { pad:(L.jumpPads||[])[0], lad:(L.ladders||[])[0], wat:(L.waterZones||[])[0],
             fxKinds:(L.fxZones||[]).map(z=>z.kind), fx0:(L.fxZones||[])[0], death:(L.deathZones||[])[0],
             w:{ walk:L.world.walk, run:L.world.run, jump:L.world.jump, grav:L.world.grav,
                 crouch:L.world.crouch, jumpCut:L.world.jumpCut, launchPower:L.world.launchPower,
                 eyeHeight:L.world.eyeHeight } };
  })()`);
  chk('a jump pad keeps its POWER', saved.pad && saved.pad.power === 31, JSON.stringify(saved.pad));
  chk('a ladder keeps its facing and height', saved.lad && saved.lad.face === 1.25 && saved.lad.h === 7,
      JSON.stringify(saved.lad));
  chk('water keeps all ten fields incl. the CURRENT', saved.wat && saved.wat.flowDir === 1.1 &&
      saved.wat.flowSpd === 2.4 && saved.wat.wave === 1.7 && saved.wat.op === 0.55,
      JSON.stringify(saved.wat));
  chk('all five effect kinds serialize', saved.fxKinds && saved.fxKinds.length === 5 &&
      saved.fxKinds.includes('lowgrav') && saved.fxKinds.includes('haste'), JSON.stringify(saved.fxKinds));
  chk('an effect zone keeps its amount and audience', saved.fx0 && saved.fx0.amt === 17 &&
      saved.fx0.who === 'both', JSON.stringify(saved.fx0));
  chk('a death zone keeps its band', saved.death && saved.death.h === 5, JSON.stringify(saved.death));
  chk('every movement setting serializes', saved.w && saved.w.walk === 7.5 && saved.w.jump === 14.5 &&
      saved.w.grav === 26 && saved.w.jumpCut === 0.35 && saved.w.launchPower === 1.4 &&
      saved.w.eyeHeight === 1.85, JSON.stringify(saved.w));

  /* ---- RELOAD ------------------------------------------------------------------------------------- */
  const back = await safe(P, `(function(){
    /* reset to a state that is NOT the authored one, so an arriving value was APPLIED (build 1400) */
    jumpPads.length = 0; ladders.length = 0; waterZones.length = 0; fxZones.length = 0; deathZones.length = 0;
    Object.assign(worldCfg, { walk:1, run:1, jump:1, grav:1, crouch:1, jumpCut:1, launchPower:1, eyeHeight:1 });
    applyWorldCfg();
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const byKind = {}; for(const z of fxZones) byKind[z.kind] = z;
    return { pad:jumpPads[0], lad:ladders[0], wat:waterZones[0], fxKinds:Object.keys(byKind),
             haste:byKind.haste, death:deathZones[0],
             w:{ walk:worldCfg.walk, run:worldCfg.run, jump:worldCfg.jump, grav:worldCfg.grav,
                 crouch:worldCfg.crouch, jumpCut:worldCfg.jumpCut, launchPower:worldCfg.launchPower,
                 eyeHeight:worldCfg.eyeHeight },
             live:{ EYE:(typeof EYE!=='undefined'?EYE:null) } };
  })()`);
  chk('the jump pad comes back with its power', back.pad && back.pad.power === 31, JSON.stringify(back.pad));
  chk('the ladder comes back whole', back.lad && back.lad.face === 1.25 && back.lad.h === 7 &&
      back.lad.r === 1.4, JSON.stringify(back.lad));
  chk('the water CURRENT is READ BACK', back.wat && back.wat.flowDir === 1.1 && back.wat.flowSpd === 2.4,
      JSON.stringify(back.wat));
  chk('water appearance is READ BACK', back.wat && back.wat.wave === 1.7 && back.wat.op === 0.55 &&
      back.wat.color === 0x2277aa, JSON.stringify(back.wat));
  chk('all five effect kinds come back', back.fxKinds && back.fxKinds.length === 5,
      JSON.stringify(back.fxKinds));
  chk('an effect zone keeps amount and audience', back.haste && back.haste.amt === 17 &&
      back.haste.who === 'both', JSON.stringify(back.haste));
  chk('the death zone comes back', back.death && back.death.h === 5, JSON.stringify(back.death));
  chk('every movement setting is READ BACK', back.w && back.w.walk === 7.5 && back.w.jump === 14.5 &&
      back.w.grav === 26 && back.w.jumpCut === 0.35 && back.w.launchPower === 1.4 &&
      back.w.eyeHeight === 1.85, JSON.stringify(back.w));

  /* ---- STABILITY ---------------------------------------------------------------------------------- */
  const stable = await safe(P, `(function(){
    const cut = (L)=>JSON.stringify({ jumpPads:L.jumpPads, ladders:L.ladders, waterZones:L.waterZones,
                                      fxZones:L.fxZones, deathZones:L.deathZones });
    const a = cut(serializeLevel());
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const b = cut(serializeLevel());
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const c = cut(serializeLevel());
    return { ab: a===b, bc: b===c };
  })()`);
  chk('the zone block is byte-stable across save cycles', stable.ab && stable.bc, JSON.stringify(stable));

  /* ---- WALK the reloaded booth -------------------------------------------------------------------- */
  // Reading fields back proves the file; it does not prove the player MOVES on them (build 1277's rule).
  const walked = await safe(P, `(function(){
    const B = 44, out = {};
    const stand = (x, z, y)=>{ player.pos.set(x, (y==null?2:y), z); player.vel.set(0,0,0); player.onGround = false; };

    /* the jump pad: stand on it and the reloaded POWER must launch the player */
    stand(B, B, 1.2); __drive(20);
    out.padVy = +player.vel.y.toFixed(2);
    out.padY  = +player.pos.y.toFixed(2);

    /* the water current: float in it and the reloaded FLOW must carry the player sideways */
    stand(B, B+14, 0.8);
    const w0 = { x:player.pos.x, z:player.pos.z };
    __drive(60);
    out.drift = +Math.hypot(player.pos.x-w0.x, player.pos.z-w0.z).toFixed(2);

    /* the death zone must still kill */
    player.hp = 100; stand(B-14, B, 1); __drive(20);
    out.deathHp = player.hp;

    /* and clear of every zone, nothing happens — the control that says the three above are the ZONES */
    player.hp = 100; stand(-B, -B, 1.2);
    const c0 = { x:player.pos.x, z:player.pos.z }; __drive(60);
    out.controlDrift = +Math.hypot(player.pos.x-c0.x, player.pos.z-c0.z).toFixed(2);
    out.controlHp = player.hp;
    out.controlVy = +player.vel.y.toFixed(2);
    out.gate = __gate();
    return out;
  })()`);
  console.log('  measured: ' + JSON.stringify(walked));
  chk('nothing is gating the frame loop', !walked.gate, String(walked.gate));
  chk('the reloaded jump pad LAUNCHES the player', walked.padVy > 5 || walked.padY > 3,
      'vy ' + walked.padVy + ', y ' + walked.padY);
  chk('the reloaded water CURRENT carries the player', walked.drift > 1,
      walked.drift + ' m in 1 s (control ' + walked.controlDrift + ')');
  chk('the reloaded death zone kills', walked.deathHp <= 0, 'hp ' + walked.deathHp);
  chk('...and away from every zone, none of it happens', walked.controlHp === 100 &&
      walked.controlDrift < 1 && walked.controlVy <= 0,
      JSON.stringify({ hp: walked.controlHp, drift: walked.controlDrift, vy: walked.controlVy }));

  report();

  function report(){
    console.log('');
    let ok = 0;
    for (const r of R) { console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name +
      (r.ok ? '' : '   <- ' + (r.detail == null ? '' : r.detail))); if (r.ok) ok++; }
    console.log('\n  ' + ok + '/' + R.length + '\n');
  }
}, { settleMs: 5000 });
