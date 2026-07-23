// (build 1059) MELEE IS EDGE-TRIGGERED — author: "when I use melee, it just rapidly loops the
// animation... can melee, both keyboard input and mouse button, require a full lift and
// reclick to fire again?" Three level-triggered paths were re-firing the swing:
//  1) the V key had no e.repeat guard, so OS key auto-repeat machine-gunned meleeAttack;
//  2) melee WEAPONS (crowbar, fists) ship auto:true, so the held-fire loop bypassed the
//     semi-auto latch and re-swung at fireRate — restarting the clip every swing;
//  3) the out-of-ammo fallback punch never latched (or even set lastShot).
// All three now demand a full release: the latch re-arms only on mouseup (22380-era),
// pad release, or touch release — exactly the semi-auto contract guns already honour.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

assert(/if\(e\.code===BINDS\.melee && !e\.repeat\) meleeAttack\(\);/.test(src),
  'the melee KEY ignores auto-repeat — holding V is one swing, a full release re-arms');
{
  const sh = extractFunction('shoot', src);
  assert(/if\(w\.melee\)\{ if\(firingLatch\) return; firingLatch=true;/.test(sh),
    'an equipped melee weapon latches UNCONDITIONALLY — its auto:true flag no longer lets held fire loop the swing');
  assert(!/if\(w\.melee\)\{ if\(!w\.auto && firingLatch\)/.test(sh), 'the old auto-flag bypass is gone');
  assert(/if\(w\.reserve<=0\)\{ if\(firingLatch\) return; firingLatch=true; meleeAttack\(\); return; \}/.test(sh),
    'the dry-fire fallback punch latches too (it used to spam every frame)');
  assert(/if\(!w\.auto && firingLatch\) return;     \/\/ semi-auto: one shot per click/.test(sh),
    'real guns keep their semi-auto/auto behavior untouched');
}
// the latch re-arms ONLY on a genuine release — all four input paths
assert(/if\(e\.button===0\)\{ firing=false; firingLatch=false; \}/.test(src), 'mouseup re-arms');
assert(/if\(padFiringPrev && !padFiring\) firingLatch = false;/.test(src), 'gamepad trigger release re-arms');
assert(/fid=null; touchFiring=false; firingLatch=false;/.test(src), 'touch release re-arms');
assert(/if\(edge\(14\) && typeof meleeAttack==='function'\) meleeAttack\(\);/.test(src),
  'the gamepad melee button was already edge-triggered — unchanged');

done('build 1059: melee swings once per press on every input — full lift and re-click to swing again');
