// build 1305 — REPORTED: "there needs to be a way to add a per prop hit sound... It would also be nice to
// have some sort of visual that the blow landed, maybe with some small particles etc."
//
// Drives the REAL swing at a REAL prop and records what actually got played and drawn. playSample and spark
// are function DECLARATIONS in the game closure, so re-assigning the binding replaces them for every caller —
// which is the only way to observe an audio call under SwiftShader, where nothing decodes.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    player.pos.set(0,EYE,30); player.yaw=Math.PI; player.pitch=0;   /* face +Z */
    let o = dynamicProps[0];
    if(!o){ o = propModels.find(p=>p && !p.userData.runtime);
      if(!o) return { err:'no props at all' };
      if(typeof setPropDynamic==='function') setPropDynamic(o, true); }
    o.scale.set(1,1,1); o.position.set(0, 1, 32);          /* 2.0 m in front — see melee-props.mjs */
    o.userData.breakable = true; o.userData.maxHp = 500; o.userData.hp = 500;
    o.userData.hitSnd = 'https://example.invalid/wood.mp3';
    if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    /* the spies */
    window.__snd = []; window.__spk = [];
    const _realPlay = playSample, _realSpark = spark;
    playSample = function(url, opts){ window.__snd.push({ url:String(url), at: (opts&&opts.at) ? [+opts.at.x.toFixed(2),+opts.at.y.toFixed(2),+opts.at.z.toFixed(2)] : null, vary:(opts&&opts.vary)||0 }); return true; };
    spark = function(pos, col){ window.__spk.push({ at:[+pos.x.toFixed(2),+pos.y.toFixed(2),+pos.z.toFixed(2)], col: col==null?null:('0x'+col.toString(16)) }); return _realSpark(pos, col); };
    return { dyn:dynamicProps.length, at:o.position.toArray(), hp:o.userData.hp, snd:o.userData.hitSnd };
  })()`)));

  // the pose must be set a FRAME before the swing: meleeAttack reads camera.getWorldDirection, which the
  // frame loop is what updates (learned in build 1303's probe).
  await P("tpMode=false; 1;"); await page.waitForTimeout(1200);

  console.log('ONE SWING     ', JSON.stringify(await P(`(function(){
    const o = dynamicProps[0]; window.__snd=[]; window.__spk=[];
    o.userData._hitSndT = 0; _meleeT = 0; _meleeTok++;
    const hp0 = o.userData.hp;
    meleeAttack(WEAPONS.crowbar);
    if(typeof _meleeStrike==='function') _meleeStrike(WEAPONS.crowbar, WEAPONS.crowbar.reach||2.9, WEAPONS.crowbar.dmg);
    return { damaged:+(hp0-o.userData.hp).toFixed(1), sounds:window.__snd, sparks:window.__spk.slice(0,3), sparkN:window.__spk.length };
  })()`)));

  console.log('SHOTGUN BURST ', JSON.stringify(await P(`(function(){
    /* 8 pellets in one frame must be ONE sound, not eight copies of the same buffer at once */
    const o = dynamicProps[0]; window.__snd=[]; o.userData._hitSndT = 0; o.userData.hp = 5000;
    for(let i=0;i<8;i++) damageProp(o, 3, {x:0,y:1,z:31}, null, 6, NET.myId);
    return { calls:window.__snd.length, url:window.__snd[0]&&window.__snd[0].url };
  })()`)));

  console.log('EXPLOSION     ', JSON.stringify(await P(`(function(){
    /* thirty crates in one radius must not start thirty buffers on one frame */
    const src = dynamicProps[0]; const made=[];
    for(let i=0;i<12;i++){ const c = src.clone(true); c.userData = Object.assign({}, src.userData);
      c.userData.hitSnd='https://example.invalid/wood.mp3'; c.userData.hp=5000; c.userData._hitSndT=0;
      c.position.set(i*0.5-3, 1, 33); scene.add(c); dynamicProps.push(c); made.push(c); }
    window.__snd=[]; _propSndT = 0; _propSndN = 0;
    for(const c of made) damageProp(c, 3, null, null, 6, NET.myId);
    const n = window.__snd.length;
    const posAt = window.__snd.map(s=>s.at && s.at[0]);
    for(const c of made){ const i=dynamicProps.indexOf(c); if(i>=0) dynamicProps.splice(i,1); scene.remove(c); }
    return { props:made.length, sounds:n, cap:PROP_SND_BURST, distinctPositions:new Set(posAt).size };
  })()`)));

  console.log('ROUND TRIP    ', JSON.stringify(await P(`(function(){
    const o = dynamicProps[0];
    const e = propEntry(o);
    /* the whole level, through the real serializer and back — the only thing that proves it travels */
    const lvl = JSON.parse(JSON.stringify(serializeLevel()));
    const mine = (lvl.props||[]).filter(p=>p && p.hsn);
    return { serialized:e.hsn, inLevelFile:mine.length, url:mine[0]&&mine[0].hsn };
  })()`)));

  console.log('NO URL        ', JSON.stringify(await P(`(function(){
    const o = dynamicProps[0]; const u = o.userData.hitSnd; delete o.userData.hitSnd;
    window.__snd=[]; o.userData._hitSndT=0; o.userData.hp=5000;
    damageProp(o, 3, {x:0,y:1,z:31}, null, 6, NET.myId);
    const n = window.__snd.length; o.userData.hitSnd = u;
    return { soundsWithNoUrl:n };
  })()`)));
}, { settleMs: 9000 });
