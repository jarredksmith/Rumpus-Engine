// build 1164: the host bounds what a client may CLAIM — movement and damage rate.
//
// Build 1130 established the philosophy (clamp the damage magnitude, credit the CONNECTION not the claim)
// and never extended it. The panel verified the two holes: (1) setRemoteState wrote a client's reported
// position verbatim — teleport/speedhack were one console line, propagated to every peer as truth; (2)
// _netDmg caps one packet, so 50 capped pvpHits per frame was an instakill through walls. Full server
// authority is impossible P2P; bounding the claims is the honest ceiling, and this build reaches it.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const MOVE_CAP = +src.match(/const _MOVE_CAP = (\d+)/)[1];
const CAR_CAP  = +src.match(/_MOVE_CAP_CAR = (\d+)/)[1];
const TP_MS    = +src.match(/_TP_ALLOW_MS = (\d+)/)[1];
const PVP_RATE = +src.match(/_DMG_RATE_PVP = (\d+)/)[1];
const PVE_RATE = +src.match(/_DMG_RATE_PVE = (\d+)/)[1];

// ---------------------------------------------------------------- movement: executed
{
  let NOW = 10000;
  const fn = new Function('performance',
    'const _MOVE_CAP=' + MOVE_CAP + ', _MOVE_CAP_CAR=' + CAR_CAP + ', _TP_ALLOW_MS=' + TP_MS + ';\n' +
    extractFunction('_plausibleMove') + '\nreturn _plausibleMove;')({ now: () => NOW });
  const rp = () => ({ posEye: { x: 0, y: 1.7, z: 0 }, _mvT: null, _tpT: 0 });
  const step = (r, x, y, z, ms, car) => { NOW += ms; const cl = fn(r, x, y, z, !!car); const p = cl || { x, y, z }; r.posEye.x = p.x; r.posEye.y = p.y; r.posEye.z = p.z; return cl; };

  { // normal running is untouched
    const r = rp(); step(r, 0, 1.7, 0, 0);
    eq(step(r, 0.6, 1.7, 0, 50), null, 'a 12 u/s runner at 20Hz is accepted verbatim');
    eq(step(r, 1.2, 1.7, 0, 50), null, '...continuously');
  }
  { // the speedhack: continuous huge deltas — first one rides the teleport allowance, then rubber-band
    const r = rp(); step(r, 0, 1.7, 0, 0);
    eq(step(r, 999, 1.7, 0, 50), null, 'the FIRST huge jump is allowed (it could be a respawn/teleport)');
    const cl = step(r, 1998, 1.7, 0, 50);
    assert(cl, 'the second huge jump inside the window is clamped — a speedhack is continuous, a respawn is not');
    near(Math.hypot(cl.x - 999, cl.z - 0), MOVE_CAP * 0.05, 0.01, '...to the cap along its own direction (' + (MOVE_CAP * 0.05).toFixed(1) + 'u per 50ms tick)');
  }
  { // a legit teleport after the window passes untouched
    const r = rp(); step(r, 0, 1.7, 0, 0);
    step(r, 500, 1.7, 0, 50);                    // spends the allowance
    NOW += TP_MS + 100;
    eq(fn(r, -500, 1.7, 0, false), null, 'a discontinuity after the allowance window is a teleport, accepted');
  }
  { // cars go faster
    const r = rp(); step(r, 0, 1.7, 0, 0); step(r, 1, 1.7, 0, 50, true); r._tpT = NOW;   // burn allowance
    eq(step(r, 1 + CAR_CAP * 0.05 - 0.1, 1.7, 0, 50, true), null, 'a car at its cap is accepted');
    assert(step(r, 999, 1.7, 0, 50, true), '...but a warping car is still clamped');
  }
}
{
  assert(/if\(NET\.mode==='host'\)\{ const cl=_plausibleMove\(rp, \+msg\.p\[0\], \+msg\.p\[1\], \+msg\.p\[2\], !!msg\.c\); if\(cl\)\{ msg\.p=\[cl\.x, cl\.y, cl\.z\]; \} \}/.test(src),
    'setRemoteState clamps on the HOST only — clients keep trusting the host\'s relays');
}

// ---------------------------------------------------------------- damage rate: executed
{
  let NOW = 50000;
  const fn = new Function('performance',
    'const _dmgAcc={}; const _DMG_RATE_PVP=' + PVP_RATE + ', _DMG_RATE_PVE=' + PVE_RATE + ';\n' +
    extractFunction('_netDmgBudget') + '\nreturn _netDmgBudget;')({ now: () => NOW });

  { // THE exploit: 50 max-damage packets in one frame
    let landed = 0;
    for (let i = 0; i < 50; i++) landed += fn(3, 'pvp', 95);
    eq(landed, PVP_RATE, '50 sniper-cap packets in one frame land exactly the 1s budget (' + PVP_RATE + '), not 4750');
    eq(fn(3, 'pvp', 95), 0, '...and the next one lands nothing');
    NOW += 1000;
    assert(fn(3, 'pvp', 95) === 95, 'a second later the bucket has drained and real damage flows again');
  }
  { // a real player never feels it: SMG headshot spray ≈ 290/s
    let landed = 0, total = 0;
    for (let i = 0; i < 18; i++) { NOW += 55; const d = fn(4, 'pvp', 16); landed += d; total += 16; }
    eq(landed, total, 'a full second of the fastest legitimate PvP output passes 100% intact');
  }
  { // per-kind isolation: melting a wave doesn't starve PvP and vice versa
    fn(5, 'pve', PVE_RATE);
    eq(fn(5, 'pvp', 100), 100, 'a maxed PvE bucket leaves the PvP bucket untouched');
  }
  { // per-source isolation
    fn(6, 'pvp', PVP_RATE);
    eq(fn(7, 'pvp', 100), 100, 'one cheater\'s bucket does not tax an innocent player');
  }
  eq(fn(8, 'pvp', -50), 0, 'negative claims grant nothing (belt to 1130\'s braces)');
}
{
  assert(/enemyHurt\(en, _netDmgBudget\(id,'pve',_netDmg\(msg\.d\)\)/.test(src), "the host's enemy-hit ingest is budgeted");
  assert(/applyPvpDamage\(_netDmgBudget\(id,'pvp',_netDmg\(msg\.d\)\), id\)/.test(src), '...and pvpHit');
  assert(/botHurt\(b, _netDmgBudget\(id,'pvp',_netDmg\(msg\.d\)\)/.test(src), '...and botHit');
  assert(PVP_RATE >= 400, 'the PvP cap clears the best legitimate single-target output with margin (' + PVP_RATE + '/s)');
  assert(PVE_RATE >= 3 * PVP_RATE - 100, 'and the PvE cap covers splash across a crowd (' + PVE_RATE + '/s)');
}

done('build 1164: the host bounds movement claims (per-tick displacement cap, one teleport allowance per window, cars faster, clamped along the claim\'s own direction) and damage-rate claims (leaky bucket per source per kind) — 50 capped packets in a frame now land the 1-second budget instead of an instakill, and every legitimate play pattern passes untouched');
