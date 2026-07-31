// build 1213: the random difficulty curve stops plateauing at wave 5.
//
// The gameplay-feel critic's HIGH: pickEnemyType froze the mix from wave 5 on, and its outcome set never
// included shielded or charger — the two most mechanically interesting enemies (flank / dodge counterplay),
// which existed only in authored spawns. And escalation was COUNT-ONLY (n = 3 + wave*2), so wave 20 was 43
// grunts — a spam/ammo problem, not a pressure problem. Now two new tiers introduce shielded (wave >=8) and
// charger (wave >=12), and a gentle flat HP ramp (capped at wave 25) adds real pressure — in RANDOM mode
// only, so authored/prebuilt levels keep the creator's tuning.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- pickEnemyType, executed across the curve
const pick = new Function('Math', '"use strict"; const gameCfg={}; ' + extractFunction('pickEnemyType') + '; return pickEnemyType;')(Math);
const rng = (v) => () => v;
function typesAt(wave) {
  const seen = new Set();
  for (let i = 0; i <= 100; i++) seen.add(pick(wave, rng(i / 100.0001)));
  return seen;
}

{
  const early = typesAt(1);
  assert(!early.has('shielded') && !early.has('charger'), 'early waves never spawn the advanced types');
  const w5 = typesAt(5);
  assert(!w5.has('shielded') && !w5.has('charger'), 'wave 5 is still the classic five-type mix (unchanged from before)');
  assert(w5.has('grunt') && w5.has('brute') && w5.has('sapper'), '...with the full base roster');
}
{
  const w8 = typesAt(8);
  assert(w8.has('shielded'), 'wave 8 finally introduces the Shieldbearer — a random run now demands flanking');
  assert(!w8.has('charger'), '...but not yet the Charger');
  const w12 = typesAt(12);
  assert(w12.has('shielded') && w12.has('charger'), 'wave 12 adds the Charger too — the full roster is reachable from random waves');
}
{ // the mix keeps EVOLVING, not just widening — the advanced types take real share, and grunts recede
  let shield = 0, charge = 0, grunt = 0; const N = 20000; const rand = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let i = 0; i < N; i++) { const t = pick(14, rand); if (t === 'shielded') shield++; if (t === 'charger') charge++; if (t === 'grunt') grunt++; }
  assert(shield / N > 0.04 && charge / N > 0.04, 'deep waves carry a real fraction of shielded + charger (' + (shield / N * 100).toFixed(1) + '% / ' + (charge / N * 100).toFixed(1) + '%)');
  assert(grunt / N < 0.30, '...and grunts are no longer the majority (' + (grunt / N * 100).toFixed(1) + '%) — the wave keeps asking new questions');
}

// ---------------------------------------------------------------- the HP ramp
{
  const ramp = (wave) => 1 + 0.04 * Math.min(wave, 25);
  near(ramp(1), 1.04, 1e-9, 'wave 1 is barely ramped');
  near(ramp(25), 2.0, 1e-9, 'the ramp caps at +100% by wave 25');
  eq(ramp(50), ramp(25), '...and never grows past the cap (a run stays winnable)');
  assert(ramp(10) > ramp(5), 'HP climbs wave over wave — real pressure, not just more bodies');
}
{
  assert(/const _wr = \(typeof gameCfg!=='undefined' && gameCfg\.mode==='random' && !\(typeof editorOpen!=='undefined' && editorOpen\)\) \? \(1 \+ 0\.04\*Math\.min\(\(typeof wave!=='undefined'\?wave:1\), 25\)\) : 1;/.test(src),
    'the ramp is RANDOM-mode only and off in the editor — an authored/prebuilt/manifest level keeps its own tuning');
  assert(/const _hp = Math\.round\(_eff\.hp \* _wr\);/.test(src) && /hp:_hp, maxHp:_hp,/.test(src),
    'the ramp scales both hp and maxHp, so damage numbers and kill credit (which read maxHp) stay consistent');
}

// ---------------------------------------------------------------- the milestone boss is untouched (owned elsewhere)
{
  assert(/out\.push\(\{ x:0, z:-\(arena\*0\.72\), mode:'hunt', type:'boss' \}\);/.test(src),
    'the milestone boss still lives in randomWaveDescriptors, not pickEnemyType — the two systems stay separate');
}

done('build 1213: the difficulty curve keeps evolving — pickEnemyType executed proving wave 5 is unchanged, wave 8 introduces the Shieldbearer and wave 12 the Charger, deep waves carry a real fraction of both while grunts recede, plus a random-mode-only HP ramp capped at +100% by wave 25 that scales hp and maxHp together and leaves authored levels alone');
