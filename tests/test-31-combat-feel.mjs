// (build 47) Combat feel pass 1: kill-aware hit marker, floating damage numbers, enemy hit-flash, and a
// brief hitstop on kills (solo only). Structural wiring + runnable math for the time-scale and fade.
import { extractFunction, gameSource, done, assert, near, eq } from './harness.mjs';
const src = gameSource();

// hit marker has a kill variant
const hm = extractFunction('showHitmarker');
assert(/function showHitmarker\(kind\)/.test(hm), 'showHitmarker takes a kind (build 1212: hit/head/kill, with legacy booleans still accepted)');
assert(/k==='kill' \? '#ff4d6d' : k==='head' \? '#ffd166' : '#fff'/.test(hm), 'kill marker turns red, headshot yellow (build 1212)');

// floating damage numbers
const sdn = extractFunction('spawnDamageNumber');
assert(/kill \? \(dmgNumCfg\.killColor\|\|'#ff6b6b'\) : \(head \? '#ffd166' : \(dmgNumCfg\.hitColor\|\|'#ffe08a'\)\)/.test(sdn), 'kill numbers use kill color, hits use hit color');
assert(/\(kill \|\| head\) \? \(n \+ '!'\) : \('' \+ n\)/.test(sdn), 'kill + headshot numbers get a "!"');
assert(/new THREE\.Sprite\(/.test(sdn) && /scene\.add\(sp\)/.test(sdn), 'numbers are world-space sprites');

// enemy hit-flash (capsule emissive)
const fe = extractFunction('flashEnemy');
assert(/v\.material\.emissiveIntensity = 2\.4; en\._flash = 0\.12/.test(fe), 'hit boosts emissive + sets a flash timer');

// floater + flash upkeep
const uf = extractFunction('updateFloaters');
assert(/age >= 1\)\{ scene\.remove\(f\.sp\)/.test(uf), 'expired numbers are removed + disposed');
assert(/en\._flash -= dt/.test(uf) && /emissiveIntensity = en\._emi0/.test(uf), 'flash decays back to the stored emissive');
assert(/updateFloaters\(dt\);/.test(src), 'updateFloaters ticks each frame');

// hitstop on kill, solo only
const ke = extractFunction('killEnemy');
assert(/if\(NET\.mode==='off'\)\{ hitStop = Math\.max\(hitStop, 0\.07\); registerLocalKill\(\)/.test(ke), 'kill triggers hitstop + multi-kill tracking in solo');
// build 580: multi-kill callouts (pure count + label)
const mkCount = new Function('return ('+extractFunction('_multiKillCount')+')')();
const now=10000;
eq(mkCount([now-100, now-200, now-300], now, 3200), 3, 'counts kills inside the window');
eq(mkCount([now-100, now-5000], now, 3200), 1, 'a kill older than the window does not count');
eq(mkCount([], now, 3200), 0, 'no kills -> 0');
const mkLabel = new Function('_MK_LABELS','return ('+extractFunction('_mkLabel')+')')(['','','DOUBLE KILL','TRIPLE KILL','MULTI KILL','RAMPAGE','UNSTOPPABLE','GODLIKE']);
eq(mkLabel(1), '', 'a single kill is not a callout');
eq(mkLabel(2), 'DOUBLE KILL', '2 -> DOUBLE KILL');
eq(mkLabel(3), 'TRIPLE KILL', '3 -> TRIPLE KILL');
eq(mkLabel(99), 'GODLIKE', 'beyond the table caps at the top tier');
const rlk = extractFunction('registerLocalKill');
assert(/_killTimes\.push\(now\)/.test(rlk) && /now-_killTimes\[0\]>_MK_WIN/.test(rlk), 'tracks + prunes recent kills');
assert(/if\(n>=2\)\{ showMultiKill\(n\)/.test(rlk) && /NET\.mode==='off' && n>=3\) hitStop=Math\.max\(hitStop, 0\.2\)/.test(rlk), 'callout at 2+, solo slow-mo at 3+');
assert(/registerLocalKill\(\)/.test(extractFunction('registerDuelKill')), 'PvP local kills also feed the streak');
assert(!/if\(!NET\.mode\) hitStop/.test(ke), 'no broken !NET.mode gate (NET.mode defaults to the string "off")');

// loop applies the time-scale with a real-time countdown
const loopSrc = extractFunction('loop');   // build 358 grew the loop preamble; extract the whole body
assert(/const rawDt = Math\.min\(clock\.getDelta\(\), 0\.05\);/.test(loopSrc), 'loop reads raw frame time');
assert(/if\(hitStop > 0\)\{ hitStop -= rawDt; const _hs=\(typeof a11y!=='undefined'\)\?a11y\.hitstop:1; if\(_hs>0\) dt = rawDt \* \(0\.12 \+ 0\.88\*\(1-_hs\)\); \}/.test(loopSrc), 'hitstop slows the sim + counts down in real time');   /* build 1313: at the shipped setting of 1 this is exactly rawDt*0.12; the countdown runs regardless, so nothing waiting on hitStop hangs when a player turns it off */

// solo hit path feeds all three
const sh = extractFunction('shoot');
assert(/spawnDamageNumber\(hit\.point, dealt, _ek, isHead\)/.test(sh), 'damage number at the hit point');
assert(/flashEnemy\(en\)/.test(sh) && /showHitmarker\(_ek\?'kill':\(isHead\?'head':'hit'\)\)/.test(sh), 'flash + kill/head/hit-aware marker on hit (build 1212)');

// --- runnable: hitstop time-scale ---
function step(hs, rawDt){ let dt=rawDt; if(hs>0){ hs-=rawDt; dt=rawDt*0.12; } return { hs, dt }; }
let r = step(0.07, 0.016);
near(r.dt, 0.016*0.12, 1e-9, 'sim slowed to 12% during hitstop');
near(r.hs, 0.07-0.016, 1e-9, 'hitstop counts down by real time');
// after ~5 frames it clears and dt is normal again
let hs=0.07; for(let i=0;i<5;i++){ const s=step(hs,0.016); hs=s.hs; }
assert(hs <= 0, 'hitstop clears after a few frames');
assert(step(hs,0.016).dt === 0.016, 'normal time resumes once hitstop is over');

// --- runnable: floater fade curve ---
const fade = age => age < 0.6 ? 1 : (1 - (age-0.6)/0.4);
near(fade(0.3), 1, 1e-9, 'solid for the first 60% of life');
near(fade(0.8), 0.5, 1e-9, 'half-faded at 80%');
near(fade(1.0), 0, 1e-9, 'gone at end of life');
done('combat feel: hit markers + damage numbers + flash + hitstop');
