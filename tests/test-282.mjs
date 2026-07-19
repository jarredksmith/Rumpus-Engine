import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 387: bot AI upgraded from "run straight at you" to a behavior FSM with last-known-position tracking
// and per-bot personality. States: engage / retreat / hunt / flank / search.

const ub = extractFunction('updateBots');

// FSM states all exist
for(const st of ['engage','retreat','hunt','search']) assert(new RegExp("aiState='"+st+"'").test(ub) || new RegExp("aiState==='"+st+"'").test(ub), `bot has a '${st}' state`);
assert(/Math\.random\(\)<b\.aggr\?'flank':'hunt'/.test(ub), "lost-sight branches to flank (aggressive) or hunt");

// perception: LOS each frame, and a last-known position that refreshes only while visible
assert(/const hasLOS = b\._los && !!tgt;/.test(ub), 'bot reads its (cached) line-of-sight to target');
assert(/if\(hasLOS && tgt\)\{ b\.lkp = b\.lkp\|\|\{x:0,z:0\}; b\.lkp\.x=tgt\.pos\.x; b\.lkp\.z=tgt\.pos\.z; b\.lkpFresh=2\.5;/.test(ub), 'last-known position refreshes only while the target is visible');

// retreat is health-gated by per-bot bravery; recovers when safe/healed
assert(/hpFrac < b\.bravery && hasLOS/.test(ub), 'low health + exposed triggers retreat');

// no x-ray: bots only FIRE with LOS (wantFire), and only FACE the target when seen
assert(/let destX, destZ, wantFire = hasLOS;/.test(ub), 'firing intent starts from actual line-of-sight');
assert(/wantFire=false;/.test(ub), 'hunting/searching bots do not fire blind');
assert(/if\(tgt && wantFire && b\.fireCd<=0 && !\(b\._reactT>0\)\)\{/.test(ub), 'fire gate honors wantFire + the build-1003 human reaction beat');
assert(/b\.yaw = \(tgt && hasLOS\) \?/.test(ub), 'bot faces target only when visible (no x-ray facing)');

// preferred-range engagement (holds distance instead of always rushing to <9m)
assert(/dist < b\.prefRange-1 \? -0\.5 : \(dist > b\.prefRange\+1 \? 0\.5 : 0\)/.test(ub), 'bot keeps its preferred engagement distance');

// personality seeded at spawn
assert(/aggr:0\.4\+Math\.random\(\)\*0\.6, bravery:0\.18\+Math\.random\(\)\*0\.22, prefRange:6\+Math\.random\(\)\*9/.test(src), 'each bot gets aggression / bravery / preferred-range personality');

// objective play still overrides personal combat (KOTH capture)
assert(/if\(!\(koth && !cpOwnedBy\(b\.team\)\)\)\{/.test(ub), 'capturing an unowned point overrides the combat FSM');
done();
