// build 1202: the pursuit remembers WHICH storey — the recorded other half of build 1200.
//
// 1200 gave the nav grid two layers and gave BOT goals a height, but PvE enemies still pathed to layer A:
// `enemyDesiredTarget` returned {tx,tz} with no height and en.lkp stored none, so an enemy chasing a
// player on a roof pathed to the floor UNDERNEATH them. Now the target descriptor carries `ty` through
// every chase/contact/search return, the last-known position stores the height it was seen at, and the
// follow-path call hands it to the goal-layer pick. Patrol/wander/hold returns stay height-less by
// design — a post and a wander point are ground concepts, and layer A is the right default there.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the descriptor, executed
{
  const fn = extractFunction('enemyDesiredTarget');
  const mk = (over) => Object.assign({ mesh:{ position:{ x:0, y:1.4, z:0 } }, mode:'hunt', _seesC:true, _losT:1, _losIv:1e9, aware:false, lostAt:0, lkp:null, _nearEyeY:1.4 }, over);
  const run = new Function('en','px','pz','dist','now','py',
    'const _losBudget=99; function segmentBlocked(){ return false; }\n' + fn + '\nreturn enemyDesiredTarget(en,px,pz,dist,now,py);');
  { const en = mk({}); const td = run(en, 5, 5, 7, 1000, 3.2);
    eq(td.ty, 3.2, 'a seen target\'s height rides the descriptor — the chase ends on the ROOF, not under it');
    eq(en.lkp.y, 3.2, '...and the last-known position remembers the storey'); }
  { const en = mk({ _seesC:false, lkp:{ x:2, z:2, y:3.2 }, lostAt:500 }); const td = run(en, 5, 5, 7, 1000, 0);
    eq(td.tx, 2, 'sight lost: the enemy heads to the last-known position');
    eq(td.ty, 3.2, '...at the height it was SEEN at — the memory includes which storey, not where the target is now'); }
  { const en = mk({ _seesC:false }); const td = run(en, 5, 5, 7, 1000, 3.2);
    eq(td.ty, 3.2, 'the never-seen advance (original hunt feel) carries the height too'); }
}

// ---------------------------------------------------------------- the wiring
{
  assert(/enemyDesiredTarget\(en, near\.pos\.x, near\.pos\.z, nd, nowMs, near\.pos\.y\)/.test(src),
    'the caller feeds the nearest player\'s real height');
  assert(/_botFollowPath\(en\._nav\|\|\(en\._nav=\{ pos:en\.mesh\.position \}\), td\.tx, td\.tz, dt, td\.ty\)/.test(src),
    'the follow-path call hands it to the goal-layer pick (1200\'s navNearestWalkable y argument)');
  const fn = extractFunction('enemyDesiredTarget');
  assert(/return \{ tx:t\.x, tz:t\.z, chase:false, see:false \};/.test(fn),
    'patrol route points stay height-less BY DESIGN — a post is a ground concept and layer A is right there');
  eq((fn.match(/ty:/g)||[]).length, 5, 'exactly the five chase/contact/search returns carry ty — no more, no fewer');
}

done('build 1202: the enemy pursuit carries the target\'s storey — descriptor executed through seen/lost-sight/never-seen cases (lkp remembers the height it was SEEN at), the caller feeds the real player height, the goal-layer pick receives it, and patrol stays deliberately grounded');
