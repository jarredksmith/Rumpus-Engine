// build 1154: enemies stop getting stuck on level geometry, and stop sinking into each other.
//
// Reported from play with a screenshot: enemies could not get up the default level's ramps or around its
// boxes, and were clipping into one another — "this was happening with the default capsule enemies as well",
// using an imported model scaled to 0.38409.
//
// Two numbers, and the "default capsules too" detail is what proves neither is about the model:
//
// 1. THE MOVEMENT RADIUS. The obstacle pass holds an enemy `footprint` away from every collider box. The
//    capsule's real radius is 0.7 (`CapsuleGeometry(0.7, 1.4, ...)`) but its footprint was 0.9; an imported
//    model's was `Math.max(0.9, realHalfWidth)`, so the reported model — true half-width 0.365 — was held
//    off obstacles by 2.5x its own width. Both were wider than the PLAYER's 0.8, so an enemy could not
//    follow you through a gap you had just walked through. That is what reads as "stuck".
//
// 2. THE SEPARATION CAP. Build 995 capped the anti-overlap push at `3.5*dt` because a packed huddle applying
//    full corrections every frame visibly vibrated. But 3.5 is 0.058 per frame at 60fps, while a grunt
//    chases at 6-9 u/s = 0.10-0.15 per frame EACH — two enemies converging on the player close at up to 0.2
//    per frame. Steering out-ran separation by 3.4x, so they sank into each other and stayed there.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const num = (re, what) => { const m = src.match(re); assert(m, what + ' is declared in one place'); return +m[1]; };
const CAP_R    = num(/const ENEMY_CAP_R = ([\d.]+);/, 'ENEMY_CAP_R');
const MIN_R    = num(/const ENEMY_MIN_R = ([\d.]+);/, 'ENEMY_MIN_R');
const PLAYER_R = num(/radius: ([\d.]+),/, "the player's radius");
const STEP     = num(/const STEP = ([\d.]+);/, 'STEP');

// ---------------------------------------------------------------- 1. the movement radius
{
  // the capsule is held off by what it actually IS
  const geo = src.match(/const enemyGeo = new THREE\.CapsuleGeometry\(([\d.]+),/);
  assert(geo, 'the enemy capsule geometry is readable');
  eq(CAP_R, +geo[1], 'the default enemy is held off obstacles by the capsule\'s own radius, not a bigger number');
  assert(/body\.userData\.footprint = ENEMY_CAP_R\*ty\.scale;/.test(src), '...and it scales with the enemy type');
}
{
  // THE regression that matters: an enemy must fit wherever the player fits, or it cannot follow you
  assert(CAP_R < PLAYER_R,
    'a default enemy is no wider than the player (' + CAP_R + ' vs ' + PLAYER_R + ') — it can follow you through any gap you walked through');
  assert(MIN_R < PLAYER_R, '...and so is the smallest possible model enemy (' + MIN_R + ')');
  assert(MIN_R > 0, '...but never zero, or a degenerate model would stack with everything');
}
{
  // an imported model derives from its own size, with the floor only as a backstop
  assert(/body\.userData\.footprint = Math\.max\(ENEMY_MIN_R, Math\.min\(3\.5, Math\.max\(\(lbox\.max\.x-lbox\.min\.x\)\/2, \(lbox\.max\.z-lbox\.min\.z\)\/2\)\)\);/.test(src),
    'a model enemy is held off by its REAL half-width');
  assert(!/Math\.max\(0\.9, Math\.min\(3\.5/.test(src), '...the 0.9 floor is gone');
  // executable: the reported model, and the cases either side of it
  const fp = (halfWidth) => Math.max(MIN_R, Math.min(3.5, halfWidth));
  const reported = 0.95 * 0.38409;                      // a ~1.9u-wide character at the reported scale
  assert(Math.abs(fp(reported) - reported) < 1e-9,
    'the reported model (half-width ' + reported.toFixed(3) + ') is held off by its own width, not 0.9');
  assert(fp(reported) < PLAYER_R, '...so it fits where the player fits');
  eq(fp(0.01), MIN_R, 'a degenerate model falls back to the floor');
  eq(fp(9), 3.5, 'and a huge one is still capped, so a boss cannot be held off half the arena');
  assert(fp(1.2) > PLAYER_R, 'a genuinely WIDE model is still wider than the player — the fix is per-size, not a blanket shrink');
}

// ---------------------------------------------------------------- 2. separation vs closing speed
{
  const sep = src.match(/const sepCap = Math\.max\(3\.5, \(enemies\[i\]\.speed\|\|0\) \+ \(enemies\[j\]\.speed\|\|0\)\);/);
  assert(sep, 'the separation cap tracks the pair\'s own speed');
  assert(/const push=Math\.min\(\(minD-d\)\*0\.5, sepCap\*dt\)/.test(src),
    '...and the overshoot guard (minD-d)*0.5 is still what actually prevents the build-995 vibration');
  // executable: separation must out-run the speed enemies converge at, or they interpenetrate forever
  const speeds = [...src.matchAll(/speedMin:(\d+),\s*speedMax:(\d+)/g)].map(m => [+m[1], +m[2]]);
  assert(speeds.length >= 4, 'enemy speeds are readable (' + speeds.length + ' types)');
  const dt = 1 / 60;
  for (const [lo, hi] of speeds) {
    const closing = 2 * hi * dt;                        // two of them converging on the same target
    const sepCap = Math.max(3.5, hi + hi) * dt;         // what the pass can now apply per frame
    assert(sepCap >= closing,
      'separation (' + sepCap.toFixed(3) + '/frame) keeps up with two enemies closing at ' + closing.toFixed(3) + '/frame');
  }
  // and the old constant provably could NOT, which is the bug
  const worst = Math.max(...speeds.map(s => s[1]));
  assert(3.5 * dt < 2 * worst * dt,
    'the old fixed 3.5 could not: ' + (3.5*dt).toFixed(3) + '/frame against ' + (2*worst*dt).toFixed(3) + '/frame of closing');
}
{
  // separation still runs BEFORE the obstacle pass, or crowding could shove someone through a wall
  const upd = src.slice(src.indexOf('// Phase 2 — separation'), src.indexOf('// Phase 3 — obstacle resolution'));
  assert(upd.length > 100, 'the separation phase is readable');
  assert(src.indexOf('// Phase 2 — separation') < src.indexOf('// Phase 3 — obstacle resolution'),
    'separation runs before obstacle resolution');
  assert(/Runs before obstacle resolve\s*\/\/ so crowding can't push anyone through a wall|so crowding can't push anyone through a wall/.test(src),
    '...and the source still says why');
}

// ---------------------------------------------------------------- the obstacle pass is otherwise untouched
{
  // build 1089's body band and build 1094's step exemption are what let enemies climb at all — this build
  // changes the RADIUS, not the vertical rules, and a regression in either would look identical from play.
  assert(/const eFeetY = en\.mesh\.position\.y - 1\.4 \+ STEP, eHeadY = en\.mesh\.position\.y \+ 0\.55;/.test(src),
    'the body band still starts a STEP above the feet (build 1089)');
  assert(/if\(st > -Infinity && b\.max\.y - st < 0\.85\) continue;/.test(src),
    'and the ramp exemption still lets a bot climb the slope it is standing on (build 1094)');
  assert(STEP === 0.6, 'STEP is unchanged at ' + STEP);
}

done('build 1154: an enemy is held off obstacles by its OWN width and no longer by 0.9 — it now fits wherever the player fits — and separation can out-run the speed enemies chase at, so they stop sinking into each other');
