// build 1220: co-op kills stop landing flat — a local shake replaces the solo-only hitstop.
//
// The gameplay-feel critic's MEDIUM: killEnemy gates the 0.07s hitstop on NET.mode==='off' and
// registerLocalKill gates the triple-kill slow-mo the same way, so in co-op a kill produced marker + sound
// only — the crunch that sells a kill was missing in exactly the social mode. Slowing the sim online would
// desync every peer (legitimately unsafe), but a LOCAL cosmetic jolt is not: the killing client now gets a
// camera-shake punch (bigger on a multi-kill). Solo is untouched — it keeps its real hitstop, no double-crunch.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- registerLocalKill, executed in each mode
function run(mode, kills) {
  const body =
    'let shake = 0, hitStop = 0; const _killTimes = []; const _MK_WIN = 3200;\n' +
    'let NET = { mode };\n let _t = 0; const performance = { now: () => (_t += 100) };\n' +
    'function showMultiKill() {}\n' +
    extractFunction('registerLocalKill') +
    '\nfor (let i = 0; i < kills; i++) registerLocalKill();\nreturn { shake, hitStop };';
  return new Function('mode', 'kills', body)(mode, kills);
}

{ // solo: the hitstop path is unchanged, and NO extra shake muddies it
  const solo1 = run('off', 1);
  eq(solo1.shake, 0, 'solo single kill: no shake (the 0.07s hitstop in killEnemy is the crunch, fired elsewhere)');
  const solo3 = run('off', 3);
  eq(solo3.shake, 0, 'solo triple kill: still no shake here — the slow-mo is the payoff');
  eq(solo3.hitStop, 0.2, '...and the solo triple-kill slow-mo is intact');
}
{ // co-op: a kill now JOLTS the camera, harder on a multi-kill, and never slows the sim
  const co1 = run('host', 1);
  assert(co1.shake > 0, 'a co-op single kill now punches the camera (was flat)');
  eq(co1.hitStop, 0, '...without ANY hitstop — the sim is never slowed online (that would desync peers)');
  const co3 = run('host', 3);
  assert(co3.shake > co1.shake, 'a co-op multi-kill jolts harder');
  eq(co3.hitStop, 0, '...still no time-scale change online');
  // a client (via the frag path) gets the same juice
  const client1 = run('client', 1);
  assert(client1.shake > 0, 'a client kill (credited via {t:frag}) gets the jolt too');
}

// ---------------------------------------------------------------- the wiring
{
  const fn = extractFunction('registerLocalKill');
  assert(/if\(NET\.mode!=='off' && typeof shake!=='undefined'\) shake = Math\.max\(shake, n>=3 \? 0\.15 : 0\.06\);/.test(fn),
    'the local jolt fires only in netplay, scaled up for a multi-kill');
  assert(/if\(n>=2\)\{ showMultiKill\(n\); if\(NET\.mode==='off' && n>=3\) hitStop=Math\.max\(hitStop, 0\.2\); \}/.test(fn),
    'the solo-only slow-mo is untouched — the shake substitutes for it online, it does not replace it in solo');
  const ke = extractFunction('killEnemy');
  assert(/if\(NET\.mode==='off'\)\{ hitStop = Math\.max\(hitStop, 0\.07\); registerLocalKill\(\); \}/.test(ke),
    'killEnemy still keeps the solo hitstop exactly — so solo has no double-crunch');
}

done('build 1220: co-op kills get a local camera-shake punch (bigger on a multi-kill) as the substitute for the solo-only hitstop/slow-mo, executed proving solo is byte-unchanged (no shake, real hitstop) while host AND client co-op kills jolt without ever slowing the networked sim');
