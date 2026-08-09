// (build 1367) THE STOCK CAPSULE ENEMY HAD ZERO VISUAL TELEGRAPH.
//
// Both telegraphs exist and are well timed — ENEMY_MELEE_WINDUP_MS = 320 and the charger 520 ms
// _lungeWind — but their only consumer was the anim state machine, gated on hasModel && stateActions,
// which the procedural capsule has neither of. So on the default path (every random wave, the stock
// level) an enemy stood still for a third of a second and you lost 9 HP, with only build 1283 audio as
// the tell. Build 1367 pulses the capsule emissive (0.6 -> 2.2, accelerating toward the strike, the
// sapper-fuse pattern) and applies an anticipation squash to the VISUAL only, restoring the authored
// look byte-exactly when the wind-up ends OR is interrupted (build 1209 zeroes the timers, so the
// restore keys off the STATE, never a timer).
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const pulseSrc = extractFunction('_telegraphPulse', src);
// build 1458: `_telegraphFrac` now asks `_teleLive` WHICH telegraph is live, because the network wire
//    needs the same answer and two copies could disagree about which tell a player is seeing. Lifted from
//    source, never restated — the arithmetic is proven unchanged in test-1458.
const liveSrc  = (src.match(/const _TL = \{ kind:0, end:0, dur:1 \};/) || [''])[0] + '\n' + extractFunction('_teleLive', src);
const fracSrc  = liveSrc + '\n' + extractFunction('_telegraphFrac', src);
const tickSrc  = extractFunction('_telegraphTick', src);
const endSrc   = extractFunction('_telegraphEnd', src);
const LO   = Number(extractConst('TELE_EMI_LO', src));
const HI   = Number(extractConst('TELE_EMI_HI', src));
const CYC  = Number(extractConst('TELE_CYC', src));
const SQY  = Number(extractConst('TELE_SQ_Y', src));
const SQXZ = Number(extractConst('TELE_SQ_XZ', src));
const WIND = Number(extractConst('ENEMY_MELEE_WINDUP_MS', src));

const rig = new Function('ENEMY_MELEE_WINDUP_MS',
  'const TELE_EMI_LO=' + LO + ', TELE_EMI_HI=' + HI + ', TELE_CYC=' + CYC +
  ', TELE_SQ_Y=' + SQY + ', TELE_SQ_XZ=' + SQXZ + ';\n' +
  pulseSrc + '\n' + fracSrc + '\n' + tickSrc + '\n' + endSrc + '\n' +
  'return { pulse:_telegraphPulse, frac:_telegraphFrac, tick:_telegraphTick, end:_telegraphEnd };'
)(WIND);

function mkCapsule(scale){
  const v = {
    material: { emissive: {}, emissiveIntensity: LO },
    scale: { x: scale, y: scale, z: scale, sets: 0,
      set(x, y, z){ this.x = x; this.y = y; this.z = z; this.sets++; } },
    userData: {}
  };
  return { en: { mesh: { userData: { visual: v, hasModel: false } } }, v };
}

// ---- the pulse maths, executed across the whole window ----
{
  eq(rig.pulse(0), LO, 'the pulse starts exactly at the authored base');
  near(rig.pulse(1), HI, 1e-9, 'and lands exactly on the ceiling AT the strike (integer TELE_CYC parks the cosine at its trough, the ramp owns the peak)');
  eq(CYC % 1, 0, 'TELE_CYC must stay an integer or the strike-frame peak property above breaks');
  assert(HI < 2.4, 'the pulse ceiling sits UNDER flashEnemy 2.4, so a landed hit still reads brighter than the tell');

  // rises: the ramp floor means the pulse can never fall below the linear climb
  let floorOk = true, ceilOk = true;
  for(let i = 0; i <= 400; i++){
    const t = i / 400, p = rig.pulse(t);
    if(p < LO + (HI - LO) * t - 1e-9) floorOk = false;
    if(p > HI + 1e-9) ceilOk = false;
  }
  assert(floorOk, 'the pulse never falls below the rising ramp floor — the level climbs the whole wind-up');
  assert(ceilOk, 'and never exceeds TELE_EMI_HI');

  // accelerates: local maxima of the pulse land at t = sqrt((k+0.5)/CYC), so successive gaps SHRINK
  const N = 8000, peaks = [];
  let prev = rig.pulse(0), cur = rig.pulse(1 / N);
  for(let i = 2; i <= N; i++){
    const next = rig.pulse(i / N);
    if(cur > prev && cur > next && cur > HI - 0.05) peaks.push((i - 1) / N);
    prev = cur; cur = next;
  }
  eq(peaks.length, CYC, 'one full-height pulse peak per cycle inside the window (got ' + JSON.stringify(peaks) + ')');
  for(let i = 2; i < peaks.length; i++)
    assert((peaks[i] - peaks[i-1]) < (peaks[i-1] - peaks[i-2]) - 1e-6,
      'the gap between pulses SHRINKS toward the strike — the tell accelerates, the sapper-fuse pattern');
  assert(peaks.length >= 2 && (peaks[1] - peaks[0]) < peaks[0],
    'and the second peak arrives faster than the first did');
}

// ---- the progress resolver: melee window, lunge window, and every exit reads -1 ----
{
  const en = { _windupT: WIND };
  near(rig.frac(en, 0), 0, 1e-9, 'wind-up just started -> t 0');
  near(rig.frac(en, WIND / 2), 0.5, 1e-9, 'halfway -> t 0.5');
  eq(rig.frac(en, WIND), -1, 'at the strike instant the window is over');
  en._windupT = 0;
  eq(rig.frac(en, 10), -1, 'build 1209 interrupt (zeroed _windupT) reads as no telegraph — the restore key');

  const ch = { _lungePending: true, _lungeWind: 520 };
  near(rig.frac(ch, 260), 0.5, 1e-9, 'the charger telegraph uses its own 520 ms default');
  const ch2 = { _lungePending: true, _lungeWind: 700, lungeWind: 700 };
  near(rig.frac(ch2, 350), 0.5, 1e-9, 'and an authored lungeWind duration is honoured');
  ch._lungePending = false;
  eq(rig.frac(ch, 260), -1, 'the dash consuming _lungePending ends the telegraph even while _lungeWind is still in the future');
  eq(rig.frac({}, 100), -1, 'no telegraph pending -> -1');
}

// ---- the tick: squash on, pulse on, and a BYTE-EXACT restore at the natural end ----
{
  const { en, v } = mkCapsule(1.35);
  en._windupT = WIND;
  rig.tick(en, WIND * 0.05);              // just started: squash easing in
  assert(v.scale.y < 1.35 && v.scale.y > 1.35 * (1 - SQY) - 1e-9, 'the squash eases in rather than popping');
  rig.tick(en, WIND * 0.5);               // mid wind-up: full squash held
  near(v.scale.y, 1.35 * (1 - SQY), 1e-12, 'mid wind-up the capsule crouches to exactly 1-TELE_SQ_Y of its authored scale');
  near(v.scale.x, 1.35 * (1 + SQXZ), 1e-12, 'and widens to exactly 1+TELE_SQ_XZ');
  near(v.scale.z, 1.35 * (1 + SQXZ), 1e-12, 'on both horizontal axes');
  near((1 - SQY) * (1 + SQXZ) * (1 + SQXZ), 1, 0.01, 'the squash is near volume-preserving');
  assert(v.material.emissiveIntensity >= LO && v.material.emissiveIntensity <= HI + 1e-9, 'the emissive is pulsing inside the band');
  eq(en._emi0, LO, 'the base was seeded into _emi0, so a later flashEnemy capture cannot record a pulsed value');
  en._windupT = 0;                        // the strike resolved (the game zeroes the timer)
  rig.tick(en, WIND + 1);
  eq(v.scale.x, 1.35, 'restore is BYTE-EXACT: x'); eq(v.scale.y, 1.35, 'y'); eq(v.scale.z, 1.35, 'z');
  eq(v.material.emissiveIntensity, LO, 'and the emissive returns exactly to the authored base');
  eq(en._teleOn, 0, 'the latch is down');
  const setsAfter = v.scale.sets;
  rig.tick(en, WIND + 20);
  eq(v.scale.sets, setsAfter, 'an idle enemy costs no scale write per frame — the restore ran ONCE');
}

// ---- the 1209 interrupt: restore keys off the state, not a timer ----
{
  const { en, v } = mkCapsule(0.8);
  en._windupT = WIND;
  rig.tick(en, WIND * 0.4);
  assert(v.scale.y < 0.8, 'squashed mid wind-up');
  en._windupT = 0;                        // enemyHurt heavy-hit interrupt zeroes it (build 1209)
  rig.tick(en, WIND * 0.45);              // the very next frame, well before the old strike time
  eq(v.scale.y, 0.8, 'an INTERRUPTED wind-up restores immediately and byte-exactly');
  eq(v.material.emissiveIntensity, LO, 'emissive too');
}

// ---- the charger lunge telegraph drives the same visuals ----
{
  const { en, v } = mkCapsule(1.15);
  en._lungePending = true; en._lungeWind = 520;
  rig.tick(en, 260);
  near(v.scale.y, 1.15 * (1 - SQY), 1e-12, 'the lunge telegraph squashes too');
  en._lungePending = false;               // the dash fired
  rig.tick(en, 300);
  eq(v.scale.y, 1.15, 'and consuming _lungePending restores exactly');
}

// ---- capsule-only: the model path is untouched (build 1226 gate shape) ----
{
  const { en, v } = mkCapsule(1);
  en.mesh.userData.hasModel = true; en._windupT = WIND;
  rig.tick(en, WIND * 0.5);
  eq(v.scale.sets, 0, 'a model-bearing enemy never gets its scale touched');
  eq(v.material.emissiveIntensity, LO, 'nor its emissive');
  assert(!en._teleOn, 'nor the latch');

  const { en: e2, v: v2 } = mkCapsule(1);
  v2.userData.stateActions = {};          // rigged visual without hasModel (mid-load) — the state machine owns it
  e2._windupT = WIND;
  rig.tick(e2, WIND * 0.5);
  eq(v2.scale.sets, 0, 'a stateActions-bearing visual is owned by the anim state machine, not the telegraph');

  const { en: e3, v: v3 } = mkCapsule(1);
  e3.dead = true; e3._windupT = WIND;
  rig.tick(e3, WIND * 0.5);
  eq(v3.scale.sets, 0, 'a dead enemy is never animated');
}

// ---- flashEnemy interplay: the hit flash outranks the pulse, and the base is never polluted ----
{
  const { en, v } = mkCapsule(1);
  en._flash = 0.05; en._emi0 = LO; v.material.emissiveIntensity = 2.4;   // exactly what flashEnemy leaves behind
  en._windupT = WIND;
  rig.tick(en, WIND * 0.5);
  eq(v.material.emissiveIntensity, 2.4, 'a live hit flash keeps the material for its 0.12 s — the pulse yields');
  assert(v.scale.y < 1, 'while the squash still applies');
  eq(en._teleEmi0, LO, 'and the telegraph recorded the TRUE base from _emi0, never the flash 2.4');
}

// ---- wiring + shape pins ----
{
  assert(/_sapperFuse\(en, dt\);[^\n]*\n\s*_telegraphTick\(en, nowMs\);/.test(src),
    'the tick runs in the per-enemy loop beside the sapper fuse — outside the grounded gate, every frame');
  const ke = extractFunction('killEnemy', src);
  assert(/if\(en\._teleOn\) _telegraphEnd\(en\);/.test(ke),
    'killEnemy restores the capsule before the corpse is built — the splice means the tick never runs again');
  assert(ke.indexOf('_telegraphEnd') < ke.indexOf('spawnCorpse'),
    'and the restore sits BEFORE the ragdoll/topple takes the mesh');
  assert(src.includes("en.mesh.userData.hasModel && en.mesh.userData.visual && en.mesh.userData.visual.userData.stateActions"),
    'the MODEL anim path (hasModel && stateActions) is untouched — custom models keep their own telegraph');
  // build 1168: zero per-frame allocation — no new, no clone, no object/array literal in the hot path
  /* build 1458: the FUNCTION BODIES must still allocate nothing. `_teleLive` returns a module-level
     scratch object — build 1168's own approved pattern, declared once and reused — so the declaration is
     excluded here and asserted separately below. Concatenating it in would have failed this pin for the
     opposite of the reason it exists. */
  const all = pulseSrc + extractFunction('_teleLive', src) + extractFunction('_telegraphFrac', src) + tickSrc + endSrc;
  assert(!/\bnew\b/.test(all) && !/\.clone\(/.test(all) && !/=\s*\{/.test(all) && !/=\s*\[/.test(all) && !/\bfunction\s*\(|=>/.test(all),
    'the telegraph allocates nothing per frame: numbers stashed on the enemy, no vectors, no closures');
  assert(/^const _TL = \{ kind:0, end:0, dur:1 \};$/m.test(src),
    '...and the one object it uses is HOISTED to module scope, allocated once for the life of the page');
  assert(/return _TL;/.test(extractFunction('_teleLive', src)),
    '...and handed back by reference, never rebuilt');
  // the per-capsule material fact the gate relies on: useCapsule constructs a fresh material per body
  const bev = extractFunction('buildEnemyVisual', src);
  assert(/const mat = new THREE\.MeshStandardMaterial\(\{ color:0x4a1020/.test(bev),
    'useCapsule creates the capsule material PER CAPSULE — animating it cannot bleed to another enemy (verified, not assumed)');
  // and the ordering that keeps the constants out of TDZ reach of the frame loop (build 1315 lesson)
  assert(src.indexOf('const TELE_EMI_LO') < src.indexOf('_telegraphTick(en, nowMs);'),
    'the TELE_* constants are declared above the frame-loop call site');
  assert(src.indexOf('const ENEMY_MELEE_WINDUP_MS') < src.indexOf('function _teleLive'),
    'and ENEMY_MELEE_WINDUP_MS is declared above the resolver that reads it');
}

done('build 1367: the capsule enemy telegraphs its wind-up — pulse accelerates to the strike, squash restores byte-exactly on end AND interrupt, models untouched');
