// build 1458 — an enemy telegraph reaches a co-op client.
//
// The unit test drives the pieces. This drives the WIRE: a real enemy winds up, the real
// `serializeWorld()` produces the packet, the real `upsertEnemyMesh` applies it on the client side, and
// the real `_telegraphTick` runs on the resulting mirror. Build 1277's rule — pinning the two ends of a
// wire proves nothing about the wire, and six logic verbs once shipped dead because only the ends were
// pinned.
//
// The control is what makes it a finding: an identical enemy with NO telegraph must produce no field, no
// cue, and a mirror that does not move a pixel.
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(28), JSON.stringify(v));

  const r = await probe(P(`
    const R = {};
    paused = true; _tabHidden = true;
    /* build 1323: build the fixture where nothing else lives */
    player.pos.set(0, 2.9, 0);

    /* record every cue the client path fires */
    window.__cues = [];
    if(!window.__hooked){
      window.__hooked = 1;
      for(const k of ['meleeWind','lungeWind','rangedWind']){
        const f = SFX[k];
        SFX[k] = function(at){ window.__cues.push({ k: k, at: at ? [+at.x.toFixed(1), +at.z.toFixed(1)] : null }); return f.apply(SFX, arguments); };
      }
    }

    /* a real enemy, host side */
    /* paused already stops the wave loop; __wavesOff belongs to DRIVE_RIG, which this probe does not import */
    spawnEnemy({ x: 200, z: 200, type: 'grunt' });
    const en = enemies[enemies.length - 1];
    R.spawned = !!en;

    const entryFor = () => {
      const w = serializeWorld();
      const list = w.E || [];
      for(const e of list) if(e.id === en.id) return e;
      return null;
    };

    /* --- CONTROL: no telegraph --- */
    _snapPrevE.clear(); _snapN = 0;                     /* _snapPrevE is a const Map; a keyframe is _snapN%10===1 */
    const quiet = entryFor();
    R.quiet = quiet ? { tg: quiet.tg, tgd: quiet.tgd, hasFields: ('tg' in quiet) } : null;

    /* --- a melee wind-up, exactly as enemyAttack sets it --- */
    en._windupT = performance.now() + ENEMY_MELEE_WINDUP_MS;
    _snapPrevE.clear(); _snapN = 0;
    const winding = entryFor();
    R.winding = winding ? { tg: winding.tg, tgd: winding.tgd } : null;

    /* --- the CLIENT applies that very packet --- */
    window.__cues.length = 0;
    NET.enemyMeshes = NET.enemyMeshes || {};
    upsertEnemyMesh(winding);
    const em = NET.enemyMeshes[winding.id];
    R.armed = em ? { windupT: em._windupT > 0, cues: window.__cues.slice() } : null;

    /* the same packet again must NOT re-fire — it is an edge */
    upsertEnemyMesh(winding);
    upsertEnemyMesh(winding);
    R.afterRepeats = window.__cues.length;

    /* --- and the mirror actually PULSES --- */
    const vis = em.mesh.userData.visual;
    const readVis = () => ({ emi: +vis.material.emissiveIntensity.toFixed(4),
                             sx: +vis.scale.x.toFixed(4), sy: +vis.scale.y.toFixed(4) });
    R.capsule = !em.mesh.userData.hasModel;
    const before = readVis();
    const t0 = performance.now();
    _telegraphTick(em, t0 + 10);
    const early = readVis();
    _telegraphTick(em, t0 + ENEMY_MELEE_WINDUP_MS * 0.75);
    const late = readVis();
    R.pulse = { before, early, late,
                emiMoved: Math.abs(late.emi - before.emi) > 0.01,
                squashed: late.sy < before.sy && late.sx > before.sx };

    /* --- the falling edge: the host stops telegraphing --- */
    en._windupT = 0;
    _snapPrevE.clear(); _snapN = 0;
    const done = entryFor();
    R.ended = done ? { hasFields: ('tg' in done) } : null;
    upsertEnemyMesh(done);
    R.disarmed = { windupT: em._windupT|0, cues: window.__cues.length };
    _telegraphTick(em, performance.now() + 5000);
    const restored = readVis();
    R.restored = { emi: restored.emi, sx: restored.sx, sy: restored.sy,
                   backToStart: restored.emi === before.emi && restored.sx === before.sx && restored.sy === before.sy };

    /* --- CONTROL 2: a mirror that never telegraphs must not move --- */
    const em2key = 999001;
    upsertEnemyMesh({ id: em2key, p: [210, 0, 210], hd: 0, hs: 0 });
    const em2 = NET.enemyMeshes[em2key];
    const v2 = em2.mesh.userData.visual;
    const b2 = { emi: +v2.material.emissiveIntensity.toFixed(4), sy: +v2.scale.y.toFixed(4) };
    for(let i = 0; i < 8; i++) _telegraphTick(em2, performance.now() + i * 40);
    const a2 = { emi: +v2.material.emissiveIntensity.toFixed(4), sy: +v2.scale.y.toFixed(4) };
    R.control2 = { before: b2, after: a2, unmoved: b2.emi === a2.emi && b2.sy === a2.sy, cues: window.__cues.length };

    /* --- the charger and ranged kinds reach the client with their AUTHORED windows --- */
    window.__cues.length = 0;
    upsertEnemyMesh({ id: em2key, p: [210,0,210], hd:0, hs:0, tg: 3, tgd: 700 });
    const lunge = { cue: (window.__cues[0]||{}).k, wind: em2.lungeWind, pending: !!em2._lungePending };
    upsertEnemyMesh({ id: em2key, p: [210,0,210], hd:0, hs:0 });
    upsertEnemyMesh({ id: em2key, p: [210,0,210], hd:0, hs:0, tg: 2, tgd: 500 });
    R.kinds = { lunge, ranged: { cue: (window.__cues[2]||window.__cues[1]||{}).k, aimMs: em2.aimMs } };

    return R;
  `));

  say('enemy spawned', r.spawned);
  say('CONTROL no telegraph', r.quiet);
  say('winding up', r.winding);
  say('client armed + cued', r.armed);
  say('repeats re-fire?', r.afterRepeats);
  say('mirror is a capsule', r.capsule);
  say('the pulse', r.pulse);
  say('host stopped', r.ended);
  say('client disarmed', r.disarmed);
  say('restored exactly', r.restored);
  say('CONTROL unmoved mirror', r.control2);
  say('other kinds', r.kinds);

  const ok = r.spawned
          && r.quiet && r.quiet.hasFields === false            // no tell, no bytes
          && r.winding && r.winding.tg === 1 && r.winding.tgd === 320
          && r.armed && r.armed.windupT && r.armed.cues.length === 1 && r.armed.cues[0].k === 'meleeWind'
          && r.afterRepeats === 1                              // an edge, not a level
          && r.capsule && r.pulse.emiMoved && r.pulse.squashed
          && r.ended && r.ended.hasFields === false
          && r.disarmed.windupT === 0 && r.disarmed.cues === 1
          && r.restored.backToStart
          && r.control2.unmoved && r.control2.cues === 1        // the control never moves and never sounds
          && r.kinds.lunge.cue === 'lungeWind' && r.kinds.lunge.wind === 700 && r.kinds.lunge.pending
          && r.kinds.ranged.cue === 'rangedWind' && r.kinds.ranged.aimMs === 500;
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + ' — a telegraph crosses the wire, cues once, pulses the mirror, and restores');
  if (!ok) process.exitCode = 1;
}, { settleMs: 3000 });
