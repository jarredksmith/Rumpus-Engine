// build 1458 — A CO-OP CLIENT RECEIVED NO THREAT CUES AT ALL.
//
// The whole enemy-AI block is `if(!isClient && !duelMode){`. Inside it live build 627's melee wind-up,
// the charger's lunge tell, build 1448's ranged wind-up, and build 1367's visual telegraph — the pulse
// and squash that make an attack readable. So a joining player got **none of them, audio or visual**,
// and was hit with zero warning of any kind. Three builds exist specifically to give the player
// counterplay, and all three reached the host alone.
//
// The wire is one field pair on the enemy snapshot: `tg` (which telegraph) and `tgd` (its full duration),
// both CONSTANT while the tell is live. That matters — build 1197's delta key is what decides whether an
// entity is re-sent, so a remaining-time field would have re-sent every winding-up enemy every frame.
// Constant means twice per attack: once when it starts, once when it ends.
//
// And the client runs the HOST'S OWN `_telegraphTick` on its mirror, by arming the mirror with the same
// timer fields the host sets. No second visual language, and a fourth telegraph cannot be added to one
// side and forgotten on the other, because `_teleLive` and `TELE_NET` are one table read from both ends.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. ONE question, two consumers
{
  const live = extractFunction('_teleLive');
  const frac = extractFunction('_telegraphFrac');
  // the ORDER is the load-bearing part: if the wire and the visual disagreed about which tell is live,
  // a player would see one telegraph and hear another.
  const order = ['_windupT', '_aimT', '_lungePending'];
  let at = -1;
  for (const f of order) { const i = live.indexOf(f); assert(i > at, f + ' is tested in the established order'); at = i; }
  eq((live.match(/_TL\.kind=/g) || []).length, 3, 'three kinds, one per telegraph');
  assert(/const L = _teleLive\(en, nowMs\);/.test(frac),
    'the visual asks _teleLive rather than repeating the three tests');
  assert(!/_windupT/.test(frac) && !/_aimT/.test(frac) && !/_lungePending/.test(frac),
    '...and cannot drift from it, because it no longer names any of the timers');
  // build 1168: this runs per enemy per frame
  assert(/const _TL = \{ kind:0, end:0, dur:1 \};/.test(src), 'the scratch object is hoisted');
  assert(!/return \{ kind:/.test(live), 'and _teleLive allocates nothing per call');
}

// ---------------------------------------------------------------- 2. the frac is arithmetically unchanged
// The refactor must not move build 1367's pulse by a millisecond.
{
  const rig = new Function('EN', 'NOW', `
    const ENEMY_MELEE_WINDUP_MS = ${extractConst('ENEMY_MELEE_WINDUP_MS')};
    const RANGED_AIM_MS = ${extractConst('RANGED_AIM_MS')};
    ${(src.match(/const _TL = \{ kind:0, end:0, dur:1 \};/) || [])[0]}
    ${extractFunction('_teleLive')}
    ${extractFunction('_telegraphFrac')}
    return { frac: _telegraphFrac(EN, NOW), live: (function(){ const L=_teleLive(EN, NOW); return L ? { kind:L.kind, dur:L.dur } : null; })() };`);

  const at = (en, now) => rig(en, now);
  // melee: 320 ms window
  eq(at({ _windupT: 1320 }, 1000).frac, 0, 'a melee tell starts at 0');
  eq(at({ _windupT: 1320 }, 1160).frac, 0.5, '...is half way at 160 ms');
  eq(at({ _windupT: 1320 }, 1319).live.kind, 1, '...and reports kind 1');
  eq(at({ _windupT: 1320 }, 1320).frac, -1, '...and is over exactly at its end');
  // ranged: its own window (build 1448), and per-type tuning (build 1449)
  eq(at({ _aimT: 1260 }, 1000).live.dur, 260, 'the ranged tell uses RANGED_AIM_MS by default');
  eq(at({ _aimT: 1500, aimMs: 500 }, 1000).live.dur, 500, '...or the type\'s authored aimMs (build 1449)');
  eq(at({ _aimT: 1260 }, 1130).frac, 0.5, '...and is measured against its OWN window, not melee\'s');
  eq(at({ _aimT: 1260 }, 1000).live.kind, 2, 'ranged is kind 2');
  // lunge
  eq(at({ _lungePending: true, _lungeWind: 1520 }, 1000).live.dur, 520, 'the lunge tell defaults to 520');
  eq(at({ _lungePending: true, _lungeWind: 1700, lungeWind: 700 }, 1000).live.dur, 700, '...or the authored value');
  eq(at({ _lungePending: true, _lungeWind: 1520 }, 1000).live.kind, 3, 'lunge is kind 3');
  eq(at({ _lungeWind: 1520 }, 1000).frac, -1, '...and needs _lungePending, not just a timer');
  // precedence, unchanged: melee outranks ranged outranks lunge
  eq(at({ _windupT: 1320, _aimT: 1260, _lungePending: true, _lungeWind: 1520 }, 1000).live.kind, 1,
    'melee still outranks the others when several are somehow set');
  // every exit reads empty, which is what keys the restore (build 1209)
  eq(at({}, 1000).frac, -1, 'nothing pending reads -1');
  eq(at({ _windupT: 0 }, 1000).frac, -1, 'a zeroed timer (the heavy-hit interrupt) reads -1');
}

// ---------------------------------------------------------------- 3. the wire carries it, and cheaply
{
  assert(/const L=_teleLive\(e, _teleNow\); if\(L && !e\.dead\)\{ o\.tg=L\.kind; o\.tgd=Math\.round\(L\.dur\); \}/.test(src),
    'the snapshot carries the kind and the duration');
  assert(/o\.tg=L\.kind/.test(src) && !/o\.tgr=/.test(src),
    '...and NOT a remaining time, which would change every frame');
  // build 1197: the delta key decides re-sends. `tg` must be in it, or the client never learns.
  assert(/e\.hd\+'\|'\+e\.hs\+'\|'\+\(e\.tg\|\|0\)/.test(src),
    'the telegraph is part of the delta key, so a starting tell re-sends the enemy');
  // ...and absent when nothing is pending, so a quiet wave costs nothing
  assert(/if\(L && !e\.dead\)/.test(src), 'the fields are omitted entirely when no tell is live');
  assert(/!e\.dead/.test(src), 'and a corpse never telegraphs');
}

// ---------------------------------------------------------------- 4. the client arms on the RISING EDGE
{
  const up = extractFunction('upsertEnemyMesh');
  assert(/if\(_tg !== \(em\._tg\|0\)\)\{/.test(up), 'it acts on a CHANGE, not on every packet');
  assert(/spec\.arm\(em, performance\.now\(\) \+ dur, dur\)/.test(up),
    'the end time comes from the CLIENT\'s clock — no clock skew is possible');
  assert(/SFX\[spec\.snd\]\(em\.mesh\.position\)/.test(up), 'and the cue is positional (build 1208)');
  // the falling edge must CLEAR, or a mirror keeps pulsing after the attack landed
  assert(/em\._windupT = 0; em\._aimT = 0; em\._lungePending = false; em\._lungeWind = 0;/.test(up),
    'and the falling edge clears every timer, so a mirror cannot pulse forever');

  // executed: the edge fires once, and only once
  const rig = new Function('SPEC', `
    const fired = [];
    const em = { mesh: { position: { x:1, y:2, z:3 } } };
    const SFX = { meleeWind:(p)=>fired.push('meleeWind'), lungeWind:(p)=>fired.push('lungeWind'), rangedWind:(p)=>fired.push('rangedWind') };
    const performance = { now: () => 1000 };
    const TELE_NET = SPEC;
    function apply(e){
      const _tg = e.tg|0;
      if(_tg !== (em._tg|0)){
        em._tg = _tg;
        const spec = TELE_NET[_tg];
        if(spec){ const dur = +e.tgd || 320; spec.arm(em, performance.now() + dur, dur);
          if(typeof SFX!=='undefined' && SFX[spec.snd]) SFX[spec.snd](em.mesh.position); }
        else { em._windupT = 0; em._aimT = 0; em._lungePending = false; em._lungeWind = 0; }
      }
    }
    return { apply, em, fired };`);

  const specSrc = src.slice(src.indexOf('const TELE_NET = {'), src.indexOf('};', src.indexOf('const TELE_NET = {')) + 2);
  const SPEC = new Function(specSrc + '\nreturn TELE_NET;')();
  const r = rig(SPEC);

  r.apply({ tg: 1, tgd: 320 });
  eq(r.fired.length, 1, 'a melee tell fires the cue once');
  eq(r.fired[0], 'meleeWind', '...the right cue');
  eq(r.em._windupT, 1320, '...and arms the mirror on the client\'s own clock');

  r.apply({ tg: 1, tgd: 320 });
  r.apply({ tg: 1, tgd: 320 });
  eq(r.fired.length, 1, 'the next two packets of the SAME tell fire nothing — it is an edge, not a level');

  r.apply({});                       // the tell ends
  eq(r.em._windupT, 0, 'the falling edge disarms the mirror');
  eq(r.fired.length, 1, '...silently');

  r.apply({ tg: 3, tgd: 700 });
  eq(r.fired[1], 'lungeWind', 'a charger tell fires its own cue');
  eq(r.em._lungeWind, 1700, '...armed with the AUTHORED duration, so build 1449\'s tuning reaches the client');
  eq(r.em.lungeWind, 700, '...and the mirror knows the window, so the pulse is measured correctly');
  assert(r.em._lungePending === true, '...with the flag _telegraphFrac requires');

  r.apply({});
  r.apply({ tg: 2, tgd: 500 });
  eq(r.fired[2], 'rangedWind', 'and a ranged tell fires its own');
  eq(r.em.aimMs, 500, '...carrying its window too');

  // a kind the client does not know must be inert, never a throw in the packet handler
  r.apply({});
  r.apply({ tg: 9 });
  eq(r.fired.length, 3, 'an unknown kind fires nothing rather than throwing mid-snapshot');
}

// ---------------------------------------------------------------- 5. the mirror gets the HOST'S pulse
{
  assert(/_telegraphTick\(em, _teleNow\);/.test(src), 'netInterpolate ticks the same function the host uses');
  const tick = extractFunction('_telegraphTick');
  // it is capsule-gated at both ends: a model shows its attack CLIP instead, which is 1367's own rule
  assert(/!ud\.hasModel/.test(tick), 'and it is still capsule-only, so a model still shows its attack clip');
  // one clock read per frame, not one per mirror (build 1168)
  assert(/const _teleNow = performance\.now\(\);\s*\n\s*for\(const id in NET\.enemyMeshes\)/.test(src),
    'the clock is read once for the whole loop');
  eq((src.match(/_telegraphTick\(/g) || []).length, 3,
    'exactly two callers besides the declaration — the host loop and the client mirror');
}

// ---------------------------------------------------------------- 6. what this build does NOT replicate
// Stated rather than implied. Footsteps and the sapper fuse are CONTINUOUS, driven by distance
// accumulation on the host — build 1315 deferred their density question once already and it has not been
// answered. Replicating them per step would be chatty and would need that answer first.
{
  assert(!/o\.fs=/.test(src) && !/o\.fuse=/.test(src),
    'footsteps and the fuse deliberately do not ride the snapshot — they are continuous, not events');
  assert(/_enemyFootstep/.test(src), '...while still existing for the host');
}

done('build 1458 (audio audit CRITICAL): the whole enemy-AI block is `if(!isClient && !duelMode)`, so a co-op JOINER received no melee wind-up, no charger lunge tell, no ranged wind-up — neither the sounds of builds 1283/1448 nor build 1367\'s visual pulse and squash — and was hit with zero warning of any kind, in the one mode where three separate builds exist to give the player counterplay. `tg` (the kind) and `tgd` (its full duration) now ride the enemy snapshot, both CONSTANT while the tell is live so build 1197\'s delta key re-sends the enemy twice per attack rather than every frame, and both absent entirely when nothing is pending so a quiet wave costs no bytes. The client arms its mirror with the same timer fields the host sets and runs the host\'s own `_telegraphTick` on it — no second visual language — with the end time computed from the CLIENT\'s clock, so clock skew is impossible and the tell begins when that player learns about it. `_teleLive` is the one place that decides WHICH telegraph is live, read by the visual and the wire, because two copies could disagree about which tell a player is seeing; it allocates nothing (build 1168) and the refactor is proven arithmetically identical to build 1367\'s pulse across all three windows including build 1449\'s authored tunings. Executed: the cue fires once on the rising edge and not on the next two identical packets, the falling edge disarms silently, an unknown kind is inert rather than a throw mid-snapshot, and a corpse never telegraphs. Footsteps and the sapper fuse are deliberately NOT replicated — they are continuous rather than event-shaped, and build 1315 deferred their density question, which is still unanswered');
