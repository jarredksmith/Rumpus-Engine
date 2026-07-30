// build 1174: two enemy-navigation faults reported from play, each verified to a mechanism before fixing.
//
// 1. CLIP-THROUGH. Build 1158's edge exemption samples the collider's surface just inside the box edge — on
//    a CURVED prop (sphere, cylinder, the centre-arena dome) the flank near the silhouette reads LOW, so the
//    enemy was exempted INTO the footprint. Once its centre crossed the box, `d > 1e-4` failed and the
//    resolver never pushed again: enemies walked straight through. 1158's probe tested wedges and boxes,
//    never a curved prop. Fix: a centre-inside-box enemy that is NOT standing on the collider's surface is
//    expelled along the shortest horizontal exit, capped per frame (a shove, not a teleport). Mid-ramp is
//    protected: there the surface IS at its feet.
// 2. STUCK BEHIND PROPS. The nav grid marks a slab-top walkable when it is within JUMP reach (NAV_UP derives
//    from the jump apex) — semantics the BOTS execute (wp.jump since build 620) but PvE enemies ignored. The
//    path said "hop the slab", the enemy couldn't jump, and it ground against the very obstacle its route
//    crossed. Fix: enemies honour the jump hint with the launch-arc machinery the traps already use.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const STEP = +src.match(/const STEP = ([\d.]+);/)[1];

// ---------------------------------------------------------------- 1. the expulsion, replayed
{
  // lift the Phase-3 contact logic's new head: centre-inside handling with a surface stub
  const resolve = (px, pz, standY, box, surfAt, eR) => {
    // replica of the build-1174 branch, driven directly
    const pos = { x: px, z: pz, y: standY + 1.4 };
    const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x)), cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
    const d = Math.hypot(pos.x - cx, pos.z - cz);
    if (!(d < eR && d <= 1e-4)) return { moved: false, pos };
    const feetB = pos.y - 1.4;
    const own = surfAt(pos.x, pos.z);
    if (own > -Infinity && own <= feetB + STEP + 1e-4) return { moved: false, pos, standing: true };
    const exL = pos.x - (box.min.x - eR), exR = (box.max.x + eR) - pos.x;
    const ezL = pos.z - (box.min.z - eR), ezR = (box.max.z + eR) - pos.z;
    const mm = Math.min(exL, exR, ezL, ezR), st = Math.min(mm, 0.3);
    if (mm === exL) pos.x -= st; else if (mm === exR) pos.x += st;
    else if (mm === ezL) pos.z -= st; else pos.z += st;
    return { moved: true, pos };
  };
  const sphereBox = { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 4, z: 2 } };
  const sphereSurf = (x, z) => { const r = 2, d2 = x * x + z * z; return d2 >= r * r ? -Infinity : 2 + Math.sqrt(r * r - d2); };

  { // THE bug: an enemy whose centre entered the sphere's box gets pushed out, not ignored
    const r = resolve(-1.2, 0, 0, sphereBox, sphereSurf, 0.7);
    assert(r.moved, 'a buried enemy is expelled — the old code did nothing at d=0');
    assert(r.pos.x < -1.2, '...along the shortest exit (left, toward the near face)');
  }
  { // walked through frame-by-frame: it can never cross any more
    let x = -1.2; let frames = 0;
    while (frames++ < 200) {
      const r = resolve(x, 0, 0, sphereBox, sphereSurf, 0.7);
      if (!r.moved) break;
      x = r.pos.x;
    }
    assert(x <= -2, 'repeated frames push it clear of the box FOOTPRINT (x ' + x.toFixed(2) + ') — outside it, the ordinary d>1e-4 push and the enemy\'s own steering own the rim, so through-traffic is dead');
  }
  { // the protection: mid-ramp, the surface is at the feet — no expulsion
    const rampBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2.4, z: 8 } };
    const rampSurf = (x, z) => (z / 8) * 2.4;
    const r = resolve(2, 4, rampSurf(2, 4), rampBox, rampSurf, 0.7);
    assert(!r.moved && r.standing, 'an enemy mid-climb, standing ON the surface, is left alone');
  }
  { // and the cap: one frame moves at most 0.3 — a shove, not a teleport
    const r = resolve(0, 0, 0, sphereBox, sphereSurf, 0.7);   // dead centre
    const moved = Math.abs(r.pos.x - 0) + Math.abs(r.pos.z - 0);
    assert(moved <= 0.3 + 1e-9, 'one frame expels at most 0.3 (' + moved.toFixed(2) + ')');
  }
}
{
  const upd = src.slice(src.indexOf('// Phase 3 — obstacle resolution'));
  assert(/if\(d < eR && d <= 1e-4\)\{/.test(upd), 'the centre-inside case is handled, not skipped');
  assert(/const own = \(typeof propSurfaceAt==='function'\) \? propSurfaceAt\(c, en\.mesh\.position\.x, en\.mesh\.position\.z\) : -Infinity;/.test(upd),
    'standing-on-the-surface is the exception — asked of THIS collider at the enemy\'s own column');
  assert(/const mm=Math\.min\(exL,exR,ezL,ezR\), st=Math\.min\(mm, 0\.3\);/.test(upd),
    'expulsion takes the shortest horizontal exit, capped per frame');
}

// ---------------------------------------------------------------- 2. the jump hint
{
  assert(/return \{ x:wp\.x, z:wp\.z, y:wp\.y, jump:\(wp\.y - b\.pos\.y\) > \(STEP\+0\.1\) \};/.test(src),
    'the path follower has always emitted the jump hint');
  const upd = src.slice(src.indexOf('// Phase 1'), src.indexOf('// Phase 3'));
  assert(/if\(_wp\.jump && en\.grounded!==false && \(en\._jmpCd\|\|0\)<=0 && \(en\.launchY\|\|0\)<=0\)\{/.test(src),
    'PvE enemies now honour it — grounded, off cooldown, not already airborne');
  assert(/en\.vy=JUMP; en\.launchY=0\.001; en\.grounded=false; en\._jmpCd=0\.9;/.test(src),
    '...via the launch-arc machinery the traps already use, with the bots\' cooldown shape');
  assert(/if\(en\._jmpCd>0\) en\._jmpCd-=dt;/.test(src), 'and the cooldown ticks down');
  // the arc integrator this rides is unchanged and pre-existing
  assert(/if\(\(en\.launchY\|\|0\)>0 \|\| \(en\.vy\|\|0\)>0\)\{ en\.vy=\(en\.vy\|\|0\)-GRAV\*dt;/.test(src),
    'the existing launch integrator carries the hop (gravity, landing, grounded restore)');
}

done('build 1174: a centre-inside-box enemy is expelled along the shortest exit unless it is standing on the collider\'s own surface (mid-ramp protected, sphere clip-through dead, walked frame-by-frame to full clearance), and PvE enemies finally execute the nav grid\'s jump hints — the slab the path crosses gets hopped instead of ground against');
