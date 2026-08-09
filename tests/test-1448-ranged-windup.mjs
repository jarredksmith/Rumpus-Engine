// build 1448 — the ranged half of build 627's telegraph.
//
// A melee enemy has wound up before it swings since build 627 (320 ms, audible since 1283, and visible on a
// capsule since 1367); a charger since 635. A GUNNER fired on the exact frame `shootCd` hit zero — so a
// player stepping out of cover was hit before anything on screen or in the mix said a shot was coming.
// Build 1371 floored `shootCd` on the AWARE rising edge, which covers the FIRST acquisition and nothing
// after it: in an ongoing firefight every later round was still instant.
//
// The load-bearing decision is WHERE THE COOLDOWN IS CHARGED. Spend it at the wind-up and the cycle stays
// exactly `fireCd`; spend it at the shot and every ranged enemy in every level ever authored silently loses
// `aimMs` of fire rate — a stealth nerf wearing a feature's name.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const AIM = +extractConst('RANGED_AIM_MS', src);
const MELEE = +extractConst('ENEMY_MELEE_WINDUP_MS', src);
eq(AIM, 260, 'lifted the real wind-up from source');
assert(AIM < MELEE, 'a shot commits less than a swing, so its tell is shorter (' + AIM + ' < ' + MELEE + ')');

/* ---- EXECUTED: the whole ranged block, frame by frame ---------------------------------------------- */
// The block lives inline in the enemy tick, so it is sliced out and driven with a stub world — the same
// shape build 1371 used for the acquisition matrix.
const BLOCK = (() => {
  const a = src.indexOf('      } else if(en.ranged){');
  const b = src.indexOf('      } else if(en._chase && en._dist < (en._reach || 2.4)', a);
  assert(a > 0 && b > a, 'found the ranged block between its own two anchors');
  return src.slice(a + '      } else if(en.ranged){'.length, b);
})();

const mkEnemy = (o = {}) => Object.assign({
  ranged: true, standoff: 11, fireCd: 1.5, projSpeed: 24, burst: 1, burstGap: 0.09, shootCd: 0,
  aimMs: AIM, _chase: true, _see: true, _dist: 8, _burstN: 0, _burstT: 0, _burstTgt: null,
  mesh: { position: { x: 0, y: 1.4, z: 0 } },
}, o);

const run = (en, frames, w = {}) => {
  const shots = [];
  const sounds = [];
  const fn = new Function('EN', 'FRAMES', 'W', 'SHOTS', 'SOUNDS', `
    let nowMs = 0, dt = 1/60, _losBudget = 99;
    const EYE = 1.7, editorOpen = false;
    const en = EN;
    const near = { pos: { x: 8, y: 1.7, z: 0 } };
    const RANGED_AIM_MS = ${AIM};
    const fireEnemyShot = (e, t, sp) => SHOTS.push({ t: nowMs, tgt: t === near ? 'player' : 'other', sp });
    const segmentBlocked = () => !!W.blocked;
    const SFX = { rangedWind: (at) => SOUNDS.push({ t: nowMs, at }) };
    for(const f of FRAMES){
      nowMs = f.t; dt = f.dt == null ? 1/60 : f.dt;
      if(f.blocked != null) W.blocked = f.blocked;
      if(f.see != null) en._see = f.see;
      if(f.hit) { if(en._aimT){ en._aimT=0; en._aimTgt=null; } }   // build 1209's heavy-hit interrupt, verbatim
      ${BLOCK}
    }
    return null;
  `);
  fn(en, frames, w, shots, sounds);
  return { shots, sounds, en };
};

// a run of frames at 60 Hz for `ms` milliseconds
const frames = (ms, extra = {}) => {
  const out = [];
  for (let t = 0; t <= ms; t += 1000 / 60) out.push(Object.assign({ t }, extra));
  return out;
};

/* ---- it no longer fires on the frame the cooldown expires ------------------------------------------ */
{
  const r = run(mkEnemy(), frames(1000));
  assert(r.shots.length >= 1, 'the enemy does eventually shoot');
  assert(r.shots[0].t >= AIM - 20, 'the first round arrives AFTER the wind-up, not on frame 1 (t=' + r.shots[0].t.toFixed(0) + ')');
  assert(r.shots[0].t < AIM + 40, '...and not much after it');
  eq(r.sounds.length >= 1, true, 'the tell is audible');
  near(r.sounds[0].t, 0, 20, '...and it plays at the START of the wind-up, not at the shot');
}

/* ---- THE COMPATIBILITY PROPERTY: the fire RATE is unchanged ----------------------------------------- */
{
  const r = run(mkEnemy(), frames(6200));
  const gaps = r.shots.slice(1).map((s, i) => s.t - r.shots[i].t);
  assert(gaps.length >= 3, 'several rounds went out, got ' + r.shots.length);
  for (const g of gaps)
    near(g, 1500, 40, 'every gap is exactly fireCd — the tell costs the enemy no fire rate at all (got ' + g.toFixed(0) + ')');
  // and this is what a naive implementation would have produced instead
  assert(gaps.every((g) => g < 1500 + AIM - 100),
    'if the cooldown were charged at the SHOT, every gap would be fireCd + aimMs — a silent nerf to every authored fireCd');
}

/* ---- ducking behind cover during the tell cancels the shot ------------------------------------------ */
{
  // visible at t=0 (the wind-up starts), blocked from t=100 onward
  const f = frames(900).map((x) => (x.t >= 100 ? Object.assign({}, x, { blocked: true }) : x));
  const r = run(mkEnemy(), f);
  eq(r.sounds.length, 1, 'the wind-up started and was heard');
  eq(r.shots.length, 0, '...and the round never came, because the player got behind cover');
}
{
  // losing SIGHT is the same counterplay by the other door
  const f = frames(900).map((x) => (x.t >= 100 ? Object.assign({}, x, { see: false }) : x));
  const r = run(mkEnemy(), f);
  eq(r.sounds.length, 1, 'the wind-up started');
  eq(r.shots.length, 0, '...and breaking line of sight cancels it too');
}
{
  // ...and the cooldown STAYS SPENT — the enemy committed and the player beat it
  const f = frames(900).map((x) => (x.t >= 100 ? Object.assign({}, x, { blocked: true }) : x));
  const en = mkEnemy();
  run(en, f);
  assert(en.shootCd > 0.4,
    'an aborted shot still costs the enemy its full cycle, so peeking is not free either (' + en.shootCd.toFixed(2) + ')');
}

/* ---- a heavy hit breaks the aim, which is what makes suppressing fire mean something ---------------- */
{
  const f = frames(900).map((x) => (Math.abs(x.t - 100) < 9 ? Object.assign({}, x, { hit: true }) : x));
  const r = run(mkEnemy(), f);
  eq(r.sounds.length, 1, 'the wind-up started');
  eq(r.shots.length, 0, '...and a heavy hit during it cost the enemy the shot outright');
}
assert(/if\(en\._aimT\)\{ en\._aimT=0; en\._aimTgt=null; \}/.test(src),
  'and that interrupt lives beside build 1209’s melee and lunge ones, in the same heavy-hit branch');

/* ---- one wind-up at a time, and a burst is ONE commitment ------------------------------------------- */
{
  const r = run(mkEnemy(), frames(200));
  eq(r.sounds.length, 1, 'a live wind-up does not start a second one every frame');
}
{
  const en = mkEnemy({ burst: 3, burstGap: 0.09 });
  const r = run(en, frames(700));
  eq(r.shots.length, 3, 'a burst fires all three rounds');
  assert(r.sounds.length === 1, '...off ONE wind-up — rounds 2 and 3 are not each telegraphed');
  assert(r.shots[1].t - r.shots[0].t < 200, '...and they follow at burstGap, not at aimMs');
}

/* ---- an authored 0 is the pre-1448 engine, exactly -------------------------------------------------- */
{
  const r = run(mkEnemy({ aimMs: 0 }), frames(1000));
  near(r.shots[0].t, 0, 20, 'aimMs 0 fires on the very first eligible frame');
  eq(r.sounds.length, 0, '...with no tell at all');
  const gaps = run(mkEnemy({ aimMs: 0 }), frames(6200)).shots;
  near(gaps[1].t - gaps[0].t, 1500, 40, '...and the same fire rate');
}
{
  const r = run(mkEnemy({ aimMs: 800 }), frames(2000));
  assert(r.shots[0].t >= 780, 'a longer authored tell is honoured (a sniper can wind up for most of a second)');
}

/* ---- the field, defaulted where every other ranged field is ------------------------------------------ */
// build 1449 moved the default into the ENEMY_BASE capture so a LEVEL can tune it too; the property is
// unchanged — aimMs defaults per type, and the != null test is what lets an authored 0 mean "instant".
assert(/aimMs:\(_t\.aimMs!=null\)\?_t\.aimMs:RANGED_AIM_MS/.test(src),
  'aimMs is a per-type field beside fireCd/burst/projSpeed/standoff');
assert(/aimMs: _eff\.aimMs/.test(src), '...and the spawn reads the derived value, so a level can tune it');
// the != null test moved into the baseline capture with the default; what it protects is unchanged, and
// build 1449 added a SECOND place the same rule has to hold — the level's own tuning
assert(/aimMs:\(_t\.aimMs!=null\)/.test(src) && !/aimMs:_t\.aimMs\|\|/.test(src),
  '...tested for null rather than falsiness, or an authored 0 could never mean "instant"');
assert(/out\[f\] = \(m && m\[f\]!=null\) \? m\[f\] : b\[f\]/.test(src),
  '...and a LEVEL authoring 0 is honoured the same way (build 1449)');

/* ---- the capsule pulses for it, through the ONE telegraph function ---------------------------------- */
{
  const frac = new Function('EN', 'NOW',
    'const ENEMY_MELEE_WINDUP_MS = ' + MELEE + ', RANGED_AIM_MS = ' + AIM + ';' +
    /* build 1458: the frac now delegates the "which telegraph" question to _teleLive, so the rig needs
       it too — lifted from source rather than restated. */
    (src.match(/const _TL = \{ kind:0, end:0, dur:1 \};/) || [''])[0] + '\n' +
    extractFunction('_teleLive', src) + '\n' +
    extractFunction('_telegraphFrac', src) + '; return _telegraphFrac(EN, NOW);');
  eq(frac({ _aimT: 0 }, 100), -1, 'no wind-up, no pulse');
  near(frac({ _aimT: 260, aimMs: 260 }, 0), 0, 1e-9, 'the pulse starts at 0 when the wind-up does');
  near(frac({ _aimT: 260, aimMs: 260 }, 130), 0.5, 1e-9, '...is half way at half way');
  eq(frac({ _aimT: 260, aimMs: 260 }, 260), -1, '...and ends exactly when the shot goes out');
  near(frac({ _aimT: 800, aimMs: 800 }, 400), 0.5, 1e-9, 'a longer authored tell paces its own pulse');
  // it must measure against its OWN window: melee's 320 would read a 260 ms tell as already part-done
  near(frac({ _aimT: 260 }, 0), 0, 1e-9, 'a missing aimMs falls back to the constant, not to melee’s');
  // and the melee/lunge paths are untouched
  near(frac({ _windupT: 320 }, 160), 0.5, 1e-9, 'the melee telegraph is unchanged');
  near(frac({ _lungePending: true, _lungeWind: 520, lungeWind: 520 }, 260), 0.5, 1e-9, '...and the lunge');
}

/* ---- and the attack pose starts at the wind-up, so a MODELLED gunner raises its weapon --------------- */
{
  const gate = src.slice(src.indexOf('en.shootCd = en.fireCd; en._attackT = nowMs +'));
  assert(gate.indexOf('en._aimT = nowMs + _aim') < gate.indexOf('fireEnemyShot'),
    'the attack anim and the wind-up are armed together, before any shot');
}
eq((src.match(/SFX\.rangedWind\(/g) || []).length, 1, 'the tell is played from exactly one place');
assert(/rangedWind\(at\)\{ tone\(\{freq:420/.test(src),
  'and it is thinner and higher than the melee tell, so a player under fire from both can tell them apart');

done('build 1448: a gunner winds up for ' + AIM + ' ms before the round leaves — audible, positional, and ' +
     'visible on a capsule through build 1367’s own pulse — and ducking behind cover during it cancels the ' +
     'shot. The cooldown is charged at the WIND-UP, so no authored fire rate loses a millisecond');
