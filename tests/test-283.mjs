import { extractFunction, gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 388: campaign enemies (the placeable spawn-marker AI) upgraded to match the smarter bots —
// line-of-sight-gated detection, last-known-position hunting, and search instead of x-ray tracking.

// build the decision fn in isolation (segmentBlocked absent -> LOS defaults to visible)
const enemyDesiredTarget = new Function('Math',
  '"use strict"; ' + extractFunction('enemyDesiredTarget') + '; return enemyDesiredTarget;')(Math);
const mk = (o)=>Object.assign({ mesh:{ position:{x:0,z:0,y:1.4} }, aware:false, lostAt:0, lkp:null, wp:null, wpUntil:0 }, o);

// the function now reports whether the enemy actually SEES the player (drives facing + firing)
let en = mk({ mode:'hunt' });
let r = enemyDesiredTarget(en, 10, 0, 10, 0);
assert(r.see === true, 'hunt with clear LOS reports see=true');
assert(r.chase && r.tx === 10, 'hunt still chases a visible player');
assert(en.lkp && en.lkp.x === 10, 'last-known position is recorded while visible');

// source-level: detection requires BOTH range and line-of-sight (no more pure-distance x-ray)
const fn = extractFunction('enemyDesiredTarget');
assert(/en\._seesC = \(Math\.abs\(pEyeY - eY\) < 3\.0\) &&/.test(fn), 'detection has a line-of-sight test (cached/throttled, build 546)');
assert(/if\(dist <= detect && sees && !en\.friendly\)\{ en\.aware = true;/.test(fn), 'patrol/hold engage requires range AND sight');   // build 1226: and not-friendly — the range+sight intent is unchanged for hostiles
assert(/if\(en\.lkp\) return \{ tx:en\.lkp\.x, tz:en\.lkp\.z, ty:en\.lkp\.y, chase:true, see:false \};/.test(fn), 'lost sight -> head to last-known position (with its height since 1202 — the memory includes WHICH storey)');

// the per-frame caller faces the player only when seen, and passes eye height for the level check
assert(/en\._chase = td\.chase; en\._see = !!td\.see;/.test(src), 'caller records whether the enemy sees the target');
assert(/if\(td\.see\)\{ en\._faceX = td\.tx; en\._faceZ = td\.tz; \}/.test(src), 'face the player only when seen');
assert(/en\._nearEyeY = \(near\.eyeY!=null \? near\.eyeY/.test(src), 'player eye height passed for the LOS height test');

// firing (ranged + melee) now requires actual sight, not just chase intent
assert(/else if\(en\._chase && en\._see && en\.shootCd<=0/.test(src), 'ranged fire requires line-of-sight');
assert(/\} else if\(en\._chase && en\._dist < \(en\._reach/.test(src), 'melee attack triggers on proximity (build 539: no LOS gate at melee range)');

// hunt that has NEVER seen the player still advances toward it (preserves the relentless-hunter feel)
let en2 = mk({ mode:'hunt' });
// force "blind" by giving it a far target and no lkp, but LOS defaults visible in sandbox, so simulate via lkp path:
en2.aware = false; en2.lkp = null;
let r2 = enemyDesiredTarget(en2, 30, 30, 42, 0);
assert(r2.chase === true, 'hunt advances toward the player even before first contact');
done();
