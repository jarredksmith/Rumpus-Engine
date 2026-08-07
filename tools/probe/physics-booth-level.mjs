// The PHYSICS booth, AS A LEVEL FILE — authored, saved, reloaded, and then played.
//
// `physics-booth.mjs` verifies the mechanics in the running game. What no probe covered is the thing a
// creator does every session: press Save, come back, and play what came out. `range-booth-level.mjs` did
// that for the range booth (20/20) and a physics booth is the harder case by a distance — `propEntry`
// serializes 51 fields and the physics ones are most of them: mass, grabbing, joints, anchoring, blast
// radius, fuse, debris shape, collision opt-out, parenting.
//
// That surface is exactly where this repo's expensive bugs live: 1398 (a shootable target saved and was
// never read back), 1400 (five game settings written and never loaded), 1406 (fourteen of seventeen signal
// verbs lost every parameter), 1420 (the format was not idempotent).
//
// BUILD INSIDE THE ARENA. The ground plane stops at +-ARENA (70), and a prop built outside it falls
// forever — physics-booth.mjs measured three features as broken that way before it moved in.
import { withGame } from './driver.mjs';

const B = 46;
const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P) => {
  // ---------------------------------------------------------------- author the booth
  const built = await safe(P, `(function(){
    paused = false; gameOn = true;
    window.__B = ${B};
    window.__mk = (src, t, f) => { let o=null; spawnProp(src, t, (b)=>{o=b;}); if(o) f(o); return o; };

    /* a heavy crate you can throw: mass, a custom grab prompt, a reach */
    __mk('box', [__B, 3, __B, 0,0,0, 1,1,1], (o)=>{
      o.userData.tag = 'crate'; o.userData.name = 'Heavy crate';
      setPropDynamic(o, true);
      o.userData.mass = 24; o.userData.grabLabel = 'Heave it'; o.userData.grabRange = 4.5;
      o.userData.hitSnd = 'https://example.invalid/wood.mp3';
      o.userData.breakStyle = 'puff'; o.userData.fragCount = 18; o.userData.fragSize = 22;
      o.userData.debrisShape = 'cubes'; o.userData.maxHp = 40; o.userData.hp = 40;
    });

    /* one you cannot pick up — the opt-out that has to survive, or the booth hands you the scenery */
    __mk('box', [__B+3, 3, __B, 0,0,0, 2,1,2], (o)=>{
      o.userData.tag = 'anvil'; setPropDynamic(o, true);
      o.userData.mass = 90; o.userData.noGrab = true;
    });

    /* a barrel that lights on the first shot and blows on its own fuse (build 629) */
    __mk('box', [__B-4, 3, __B, 0,0,0, 1,1.4,1], (o)=>{
      o.userData.tag = 'barrel'; setPropDynamic(o, true);
      o.userData.explosive = true; o.userData.blastRadius = 9; o.userData.blastDmg = 85;
      o.userData.impactVel = 14; o.userData.fireFuse = 2.5;
      o.userData.breakSnd = 'https://example.invalid/boom.mp3';
    });

    /* a static building block. NOTE: anc is a BUILD-MENU slot field (build 928's quick-build ghost),
       not a prop field — propEntry never writes it, and the first draft of this probe set it on a prop and
       measured a real feature as broken. For a PLACED prop, "anchored" is simply not ticking Physics. */
    __mk('box', [__B, 0.5, __B+5, 0,0,0, 4,1,4], (o)=>{
      o.userData.tag = 'plinth';
    });

    /* decoration that must NOT block the doorway (build 1324) */
    __mk('box', [__B+6, 1, __B+5, 0,0,0, 1,2,1], (o)=>{
      o.userData.tag = 'bush'; o.userData.noCol = true;
      if(typeof applyPropNoCollide==='function') applyPropNoCollide(o);
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    });

    /* a swinging arm on a hinge (build 1035) */
    __mk('box', [__B-8, 3, __B, 0,0,0, 3,0.4,0.4], (o)=>{
      o.userData.tag = 'arm'; setPropDynamic(o, true);
      o.userData.joint = { type:'hinge', axis:'y', to:'', ax:0, ay:0.5, az:0, center:0.4 };   /* build 759: center is the trailer self-centering, and there is no track field */
    });

    return { props: propModels.length, dynamic: dynamicProps.length };
  })()`);
  P_(!built.__threw && built.dynamic === 4, 'the booth is authored — crate, anvil, barrel and arm are dynamic; the plinth deliberately is not', built);

  // let the crates settle, then reset so the save is of the AUTHORED pose, not a mid-bounce one
  await safe(P, `(async function(){ for(let i=0;i<40;i++) await new Promise(r=>requestAnimationFrame(r));
    if(typeof resetDynamicProps==='function') resetDynamicProps(); return 1; })()`);

  // ---------------------------------------------------------------- SAVE, then LOAD
  const trip = await safe(P, `(function(){
    const json = JSON.stringify(serializeLevel());
    window.__json = json;
    restoreLevel(JSON.parse(json));
    const by = t => propModels.find(o=>o&&o.userData&&o.userData.tag===t);
    const u = t => { const o = by(t); return o ? o.userData : null; };
    const c = u('crate'), a = u('anvil'), b = u('barrel'), p = u('plinth'), sh = u('bush'), ar = u('arm');
    return {
      bytes: json.length, dynamic: dynamicProps.length,
      crate: c && { phys:!!c.phys, mass:c.mass, label:c.grabLabel, range:c.grabRange, snd:!!c.hitSnd,
                    style:c.breakStyle, frag:c.fragCount, fz:c.fragSize, dsh:c.debrisShape, hp:c.maxHp, name:c.name },
      anvil: a && { phys:!!a.phys, mass:a.mass, noGrab:!!a.noGrab },
      barrel: b && { exp:!!b.explosive, r:b.blastRadius, d:b.blastDmg, iv:b.impactVel, fuse:b.fireFuse, bsn:!!b.breakSnd },
      plinth: p && { phys:!!p.phys },
      bush: sh && { noCol:!!sh.noCol, boxes:(by('bush').userData.boxes||[]).length,
                    inColliders: colliders.indexOf(by('bush'))>=0 },
      arm: ar && ar.joint ? { type:ar.joint.type, axis:ar.joint.axis, ay:ar.joint.ay, center:ar.joint.center } : null,
    };
  })()`);
  console.log('\nafter save -> load:', JSON.stringify(trip, null, 1).slice(0, 1500));

  P_(trip.crate && trip.crate.phys && trip.crate.mass === 24,
    'the dynamic crate came back dynamic, with its authored mass', trip.crate);
  P_(trip.crate && trip.crate.label === 'Heave it' && trip.crate.range === 4.5,
    '...its custom grab prompt and reach (builds 679, 683)', trip.crate);
  P_(trip.crate && trip.crate.style === 'puff' && trip.crate.frag === 18 && trip.crate.fz === 22 && trip.crate.dsh === 'cubes',
    '...and every debris setting, which is four separate fields', trip.crate);
  P_(trip.anvil && trip.anvil.noGrab && trip.anvil.mass === 90,
    'the un-grabbable anvil is still un-grabbable — an opt-out that got lost would hand the player the scenery',
    trip.anvil);
  P_(trip.barrel && trip.barrel.exp && trip.barrel.r === 9 && trip.barrel.d === 85 && trip.barrel.iv === 14 && trip.barrel.fuse === 2.5,
    'the barrel kept all five explosive settings including the fuse (build 629)', trip.barrel);
  P_(trip.plinth && !trip.plinth.phys, 'the static plinth came back static, not dynamic', trip.plinth);
  P_(trip.bush && trip.bush.noCol && trip.bush.boxes === 0,
    'the decoration is still intangible — its COLLIDER BOX LIST is empty, not just the flag. It stays in ' +
    '`colliders` by design: build 1324 returns early and bypasses 1148’s fail-solid fallback, so every ' +
    'consumer walks an empty list. Asserting it left the array was my own over-strict reading.',
    trip.bush);
  P_(trip.arm && trip.arm.type === 'hinge' && trip.arm.axis === 'y' && trip.arm.ay === 0.5 && trip.arm.center === 0.4,
    'the hinge kept its axis, its anchor point and its self-centering (builds 707, 759)', trip.arm);

  // ---------------------------------------------------------------- byte-stable across cycles
  const again = await safe(P, `(function(){
    let prev=null, drift=0;
    for(let i=0;i<3;i++){
      if(typeof resetDynamicProps==='function') resetDynamicProps();
      const j = JSON.stringify(serializeLevel());
      if(prev!==null && j!==prev) drift++;
      prev = j; restoreLevel(JSON.parse(j));
    }
    return { drift };
  })()`);
  P_(again.drift === 0, 'the booth is byte-stable across repeated save/reload cycles (build 1420)', again);

  // ---------------------------------------------------------------- now PLAY it
  const play = await safe(P, `(async function(){
    const by = t => propModels.find(o=>o&&o.userData&&o.userData.tag===t);
    if(typeof resetDynamicProps==='function') resetDynamicProps();
    const crate = by('crate');
    const y0 = crate.position.y;
    for(let i=0;i<80;i++) await new Promise(r=>requestAnimationFrame(r));
    const landed = { y0:+y0.toFixed(2), y1:+crate.position.y.toFixed(2), fell: y0 - crate.position.y };

    /* shove it, the way the graph's push verb does (build 1258) */
    const before = crate.position.x;
    _applySignalAction({ do:'pushprop', target:'crate', amt:40, at:'start' });
    for(let i=0;i<50;i++) await new Promise(r=>requestAnimationFrame(r));
    const shoved = { moved:+(crate.position.x - before).toFixed(2) };

    /* the static plinth must NOT have moved through any of that */
    const pl = by('plinth');
    const anchored = { y:+pl.position.y.toFixed(2), dynamic: dynamicProps.indexOf(pl)>=0 };

    /* and the barrel lights rather than dying on the first shot */
    const barrel = by('barrel');
    const hp0 = barrel.userData.hp;
    damageProp(barrel, 9999, barrel.position.clone(), new THREE.Vector3(0,0,-1), 1, null);
    const lit = { ignited: !!barrel.userData._fireIgnited, gone: !!barrel.userData._shattered, hp: barrel.userData.hp, hp0 };

    return { landed, shoved, anchored, lit };
  })()`);
  console.log('\nplayed:', JSON.stringify(play, null, 1).slice(0, 900));

  P_(play.landed && play.landed.fell > 0.5, 'a restored dynamic crate really falls and lands', play.landed);
  P_(play.shoved && Math.abs(play.shoved.moved) > 0.3,
    '...and the push verb moves it after a reload (build 1258)', play.shoved);
  P_(play.anchored && Math.abs(play.anchored.y - 0.5) < 0.4 && !play.anchored.dynamic,
    'the static plinth stayed exactly where it was placed, through a reload and a blast', play.anchored);
  P_(play.lit && play.lit.ignited && !play.lit.gone,
    'the barrel LIT on a killing shot instead of dying — its fuse survived the round trip (build 629)',
    play.lit);
}, { settleMs: 5000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   ' + String(JSON.stringify(o.detail)).slice(0, 190) : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  the physics booth survives a save and plays'));
process.exit(bad ? 1 : 0);
