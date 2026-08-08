// The gauntlet's AI booth as a LEVEL FILE — authored, saved, reloaded through the real loader, then played.
//
// `ai-booth.mjs` drives the AI in memory and says nothing about whether any of it survives a save. That gap
// is where this repo's expensive bugs live: build 1398 (a shootable prop saved and was never read back),
// 1400 (five game settings written and never loaded), 1401 (thirteen sections a joiner never received),
// 1406 (fourteen of seventeen signal verbs lost every parameter), 1427 (the fuse, lost since build 629).
// Every one of those is a serializer/loader asymmetry that every in-memory test passes straight through.
//
// A spawn marker carries TWELVE fields and three of them were added in the last two hundred builds
// (build 1087's height, 1226's friendly, 1355's faction), so it is exactly the shape that goes wrong. Two
// more AI-owned sections ride the game block: build 1191's per-type enemy tuning and build 1179's wave
// manifest text.
//
// Everything here is authorable by a creator through the editor. Nothing pokes a runtime-only field.
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

    /* Build the booth 44 m out: inside the arena (the ground plane stops at +-ARENA — build 1405) and
       clear of the stock level's geometry (build 1323). */
    const B = 44;
    spawnMarkers.length = 0;   // author from a known state, or the stock level's own markers ride along

    /* Six markers, between them touching every field the serializer writes. A creator authors each of
       these from the Enemies tab. */
    buildSpawnMarker({ t:[B, B], mode:'patrol', type:'gunner', radius:9, detect:22, face:1.25,
                       route:[[B, B], [B+12, B], [B+12, B+10]], loop:false, wave:2 });
    buildSpawnMarker({ t:[B+20, B], mode:'hold',  type:'brute',   radius:4, detect:17, wave:3 });
    buildSpawnMarker({ t:[B, B+20], mode:'hunt',  type:'charger', radius:6, detect:30 });
    buildSpawnMarker({ t:[B+20, B+20], mode:'patrol', type:'grunt', fr:1, route:[[B+20,B+20],[B+26,B+20]] });
    buildSpawnMarker({ t:[B+10, B+10], mode:'hold', type:'shielded', fac:2 });          // build 1355: a third party
    buildSpawnMarker({ t:[B+10, B-6],  mode:'hold', type:'boss', y:5.5, wave:5 });      // build 1087: on a catwalk

    /* build 1191: per-type tuning, and 1179: an authored wave manifest. Both are game-block sections a
       creator sets in the Rules tab, and both are AI composition rather than props. */
    /* the speed key is spd, not speed — my first fixture wrote the long name and the sanitizer correctly
       dropped it, which reads exactly like the loader losing it (build 1427's lesson: a fixture that
       invents a field name measures a working feature as broken). */
    gameCfg.enemyMods = { brute: { hp: 260, dmg: 31 }, runner: { spd: 1.4 } };
    gameCfg.wavesText = '3x grunt, 2x runner\\n-\\n4x gunner @post1';
    gameCfg.objective = 'eliminate';

    const marks = spawnMarkers.map(g=>g.userData.mark);
    return { ok:true, markers: marks.length, types: marks.map(m=>m.type) };
  })()`);
  chk('the booth is authored', authored.ok && authored.markers === 6, JSON.stringify(authored));
  if (!authored.ok) { report(); return; }

  /* ---- SAVE ------------------------------------------------------------------------------------- */
  const saved = await safe(P, `(function(){
    window.__json = serializeLevel();
    const L = JSON.parse(JSON.stringify(window.__json));
    return { spawns: (L.spawns||[]).length,
             first: (L.spawns||[])[0],
             faction: (L.spawns||[]).map(s=>s.fac==null?'(absent)':s.fac),
             friendly: (L.spawns||[]).map(s=>s.fr==null?'(absent)':s.fr),
             y: (L.spawns||[]).map(s=>s.y==null?'(absent)':s.y),
             mods: L.game && L.game.enemyMods, waves: L.game && L.game.wavesText };
  })()`);
  chk('every marker serializes', saved.spawns === 6, 'wrote ' + saved.spawns);
  chk('a marker writes its whole shape', saved.first && saved.first.mode === 'patrol' &&
      saved.first.type === 'gunner' && saved.first.route && saved.first.route.length === 3,
      JSON.stringify(saved.first));
  // The absent-when-default rule is what keeps every pre-1226/pre-1355 level byte-identical. If these
  // started emitting, every saved level in the wild would grow two keys per marker.
  chk('the default faction is ABSENT, not written', saved.faction.filter(f=>f==='(absent)').length === 5 &&
      saved.faction.includes(2), JSON.stringify(saved.faction));
  chk('friendly is absent unless set', saved.friendly.filter(f=>f==='(absent)').length === 5,
      JSON.stringify(saved.friendly));
  chk('height is absent at ground level', saved.y.filter(v=>v==='(absent)').length === 5 && saved.y.includes(5.5),
      JSON.stringify(saved.y));
  chk('build 1191 enemy mods serialize', saved.mods && saved.mods.brute && saved.mods.brute.hp === 260,
      JSON.stringify(saved.mods));
  chk('build 1179 wave manifest serializes', typeof saved.waves === 'string' && saved.waves.includes('gunner'),
      JSON.stringify(saved.waves));

  /* ---- RELOAD through the real loader ----------------------------------------------------------- */
  const back = await safe(P, `(function(){
    /* Reset to a state that is NOT the authored one, so a value that arrives was APPLIED and a value that
       still reads the reset was not. Build 1400's first probe restored the same level and proved nothing,
       because nothing had cleared what it was reading. */
    spawnMarkers.length = 0; gameCfg.enemyMods = null; gameCfg.wavesText = ''; gameCfg.objective = 'survival';
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const marks = spawnMarkers.map(g=>g.userData.mark);
    const byType = {}; for(const m of marks) byType[m.type] = m;
    return { n: marks.length, types: marks.map(m=>m.type),
             gunner: byType.gunner && { mode:byType.gunner.mode, radius:byType.gunner.radius,
               detect:byType.gunner.detect, face:+byType.gunner.face.toFixed(2),
               route:byType.gunner.route.map(p=>[p.x,p.z]), loop:byType.gunner.routeLoop, wave:byType.gunner.wave },
             brute: byType.brute && { mode:byType.brute.mode, radius:byType.brute.radius, wave:byType.brute.wave },
             friendlyOf: byType.grunt && byType.grunt.friendly,
             facOf: byType.shielded && byType.shielded.fac,
             yOf: byType.boss && byType.boss.y,
             mods: gameCfg.enemyMods, waves: gameCfg.wavesText, objective: gameCfg.objective };
  })()`);
  chk('every marker comes back', back.n === 6, 'got ' + back.n);
  // build 1226's bug: the type whitelist stopped at 3 entries, so five of these silently became grunts.
  for (const t of ['gunner', 'brute', 'charger', 'shielded', 'boss'])
    chk('the ' + t + ' marker keeps its TYPE', (back.types || []).includes(t), JSON.stringify(back.types));
  chk('patrol keeps mode/radius/detect/facing', back.gunner && back.gunner.mode === 'patrol' &&
      back.gunner.radius === 9 && back.gunner.detect === 22 && back.gunner.face === 1.25,
      JSON.stringify(back.gunner));
  chk('a patrol ROUTE survives, in order', back.gunner && back.gunner.route.length === 3 &&
      back.gunner.route[2][0] === 56 && back.gunner.route[2][1] === 54, JSON.stringify(back.gunner && back.gunner.route));
  chk('ping-pong survives (loop:false is the non-default)', back.gunner && back.gunner.loop === false,
      String(back.gunner && back.gunner.loop));
  chk('the wave a marker belongs to survives', back.gunner && back.gunner.wave === 2 && back.brute.wave === 3,
      JSON.stringify([back.gunner && back.gunner.wave, back.brute && back.brute.wave]));
  chk('hold keeps its post radius', back.brute && back.brute.mode === 'hold' && back.brute.radius === 4,
      JSON.stringify(back.brute));
  chk('build 1226 friendly survives', back.friendlyOf === true, String(back.friendlyOf));
  chk('build 1355 faction survives', back.facOf === 2, String(back.facOf));
  chk('build 1087 height survives', back.yOf === 5.5, String(back.yOf));
  chk('build 1191 enemy mods are READ BACK', back.mods && back.mods.brute && back.mods.brute.hp === 260 &&
      back.mods.runner && back.mods.runner.spd === 1.4, JSON.stringify(back.mods));
  chk('build 1179 manifest is READ BACK', typeof back.waves === 'string' && back.waves.includes('gunner'),
      JSON.stringify(back.waves));
  chk('the objective is read back (positive control)', back.objective === 'eliminate', String(back.objective));

  /* ---- STABILITY -------------------------------------------------------------------------------- */
  // build 1420's subject: a value that drifts a little on every save is a level that degrades every time
  // the creator presses Save, and this engine autosaves every 20 seconds.
  const stable = await safe(P, `(function(){
    const a = JSON.stringify(serializeLevel().spawns);
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const b = JSON.stringify(serializeLevel().spawns);
    restoreLevel(JSON.parse(JSON.stringify(window.__json)));
    const c = JSON.stringify(serializeLevel().spawns);
    return { ab: a===b, bc: b===c, len: a.length };
  })()`);
  chk('the marker block is byte-stable across save cycles', stable.ab && stable.bc, JSON.stringify(stable));

  /* ---- PLAY the restored booth ------------------------------------------------------------------ */
  // Reading fields back proves the file. It does not prove the AI acts on them — which is the half that
  // matters, and the half build 1277's rule is about: pinning the two ends of a wire says nothing about
  // the wire.
  const played = await safe(P, `(function(){
    enemies.length = 0;
    /* spawn from the RESTORED markers, through the engine's own path */
    const marks = spawnMarkers.map(g=>g.userData.mark);
    const want = {}; for(const g of spawnMarkers) want[g.userData.mark.type] = g;
    const out = {};
    for(const t of ['gunner','grunt','shielded']){
      const g = want[t]; if(!g) continue;
      /* Through the engine's OWN marker->descriptor function, never a hand-built object. A first draft
         passed radius/detect/loop — the real keys are patrolR/detectR/routeLoop — so the live
         enemy read undefined for its sight range and it looked like the reload had dropped it. */
      spawnEnemy(descFromMarker(g));
    }
    const byT = {}; for(const e of enemies) byT[e.type] = e;
    out.spawned = enemies.length;
    out.gunnerDetect = byT.gunner && byT.gunner.detectR;
    out.gunnerMode   = byT.gunner && byT.gunner.mode;
    out.friendly     = byT.grunt && !!byT.grunt.friendly;
    out.faction      = byT.shielded && (byT.shielded.faction != null ? byT.shielded.faction : byT.shielded.fac);
    out.hostileAlive = (typeof _hostileAlive==='function') ? _hostileAlive() : null;
    /* and then RUN it: the patrol must actually move along the route it was reloaded with */
    const g0 = byT.gunner && { x: byT.gunner.mesh.position.x, z: byT.gunner.mesh.position.z };
    player.pos.set(-40, EYE, -40);   // far away, so nothing is chasing — this measures PATROL, not pursuit
    __drive(240);
    const g1 = byT.gunner && { x: byT.gunner.mesh.position.x, z: byT.gunner.mesh.position.z };
    out.patrolMoved = (g0 && g1) ? +Math.hypot(g1.x-g0.x, g1.z-g0.z).toFixed(2) : null;
    out.gate = __gate();
    return out;
  })()`);
  chk('the restored markers spawn enemies', played.spawned === 3, JSON.stringify(played));
  chk('nothing is gating the frame loop', !played.gate, String(played.gate));
  chk('the reloaded DETECT radius reaches the live enemy', played.gunnerDetect === 22, String(played.gunnerDetect));
  chk('the reloaded MODE reaches the live enemy', played.gunnerMode === 'patrol', String(played.gunnerMode));
  chk('a reloaded friendly is friendly in play', played.friendly === true, String(played.friendly));
  chk('a reloaded faction reaches the live enemy', played.faction === 2, String(played.faction));
  chk('a friendly does not count as a hostile', played.hostileAlive === 2, String(played.hostileAlive));
  chk('the patrol WALKS its reloaded route', played.patrolMoved > 1, String(played.patrolMoved) + ' m in 4 s');

  report();

  function report(){
    console.log('');
    let ok = 0;
    for (const r of R) { console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name +
      (r.ok ? '' : '   <- ' + (r.detail == null ? '' : r.detail))); if (r.ok) ok++; }
    console.log('\n  ' + ok + '/' + R.length + '\n');
  }
}, { settleMs: 5000 });
