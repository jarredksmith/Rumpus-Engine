import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 627: melee enemies TELEGRAPH their swing. On reaching you they wind up (~0.32s) and the hit only lands at
// the end of the wind-up, and only if you're still in reach — so backing out during the tell dodges it. Replaces
// the old instant-on-contact hit, which gave the player no reaction window.

// the wind-up window constant
assert(/const ENEMY_MELEE_WINDUP_MS = 320;/.test(src), 'wind-up window defined');

// the melee decision now WINDS UP (sets _windupT) instead of hitting immediately, and won't re-trigger mid-wind-up
assert(/en\.cooldown = 0\.8; en\._attackT = nowMs \+ 550; en\._windupT = nowMs \+ ENEMY_MELEE_WINDUP_MS;/.test(src), 'reaching the target starts a wind-up, not an instant hit');
assert(/&& en\.cooldown<=0 && !editorOpen && !en\._windupT\)\{/.test(src), 'no new swing is started while one is already winding up');

// the strike resolves at the end of the wind-up, gated on still-in-reach (1.3x leniency) + same height
assert(/if\(en\._windupT && nowMs >= en\._windupT\)\{/.test(src), 'the strike resolves when the wind-up completes');
assert(/en\._dist < \(en\._reach \|\| 2\.4\) \* 1\.3/.test(src), 'the hit only lands if the target is still in reach (with a little leniency)');
assert(/_tn\.hurt\(en\.dmg \|\| 9, en\.mesh\.position\.x, en\.mesh\.position\.z\);/.test(src), 'a connecting strike deals the enemy damage to the target');

// --- executable: the dodge predicate (still-in-reach test with the 1.3x leniency) ---
function lands(dist, reach){ return dist < (reach || 2.4) * 1.3; }
assert(lands(2.0, 2.4) === true, 'a target still well within reach is hit');
assert(lands(3.0, 2.4) === true, 'within the 1.3x leniency band -> still hit (feels fair, not pixel-perfect)');
assert(lands(3.2, 2.4) === false, 'backed out past reach*1.3 -> the swing whiffs');
assert(lands(2.4 * 1.3 + 0.01, 2.4) === false, 'just outside the leniency -> dodged');

done('telegraphed melee: enemies wind up, strike lands only if you stay in reach (build 627)');
