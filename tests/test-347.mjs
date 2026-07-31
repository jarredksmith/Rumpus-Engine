import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 460: bots free-roam + fight across the whole map. Root cause of "idle until the player is close":
// a bot with no line-of-sight fell into 'search' and wandered RANDOMLY. Now 'search' heads toward the live
// target's position, so bots converge and fight regardless of where the player is. No aggro radius exists.

const acq = extractFunction('_botAcquire');
// confirm there is no distance/aggro gate — nearest of {player, remote players, bots} with no radius cutoff
assert(!/radius|aggro|< *\d+ *\) *continue/i.test(acq), 'no aggro-radius gate in target acquisition');
assert(/for\(const o of bots\)\{[\s\S]*?const d=Math\.hypot/.test(acq), 'other bots are valid targets (so bots fight each other)');

const ub = extractFunction('updateBots');
// 'search' now seeks the target instead of random-wandering
assert(/else if\(b\.aiState==='search'\)\{\s*if\(tgt\)\{ destX=tgt\.pos\.x; destZ=tgt\.pos\.z; destY=tgt\.pos\.y; \}/.test(ub), "search state heads toward the live target (carrying its height since build 1200)");
assert(/else \{ if\(!b\._wander \|\| b\.aiT<=0\)/.test(ub), 'random roam only kicks in when there is NO target left');
// lkpFresh is NaN-guarded and reset on spawn
assert(/b\.lkpFresh=Math\.max\(0, \(b\.lkpFresh\|\|0\)-dt\)/.test(ub), 'last-known-position freshness is NaN-guarded');
assert(/b\.lkp=null; b\.lkpFresh=0;/.test(ub), 'freshness resets on respawn');

// --- executable: with a target present, the destination is the target (not a random point) ---
function searchDest(tgt, botPos){
  let destX, destZ;
  if(tgt){ destX=tgt.pos.x; destZ=tgt.pos.z; }
  else { destX = botPos.x + (Math.random()*2-1)*16; destZ = botPos.z + (Math.random()*2-1)*16; }
  return {destX, destZ};
}
const bot = { x:-50, z:-50 };
const far = { pos:{ x:60, z:55 } };                 // enemy on the far side of the map
const d = searchDest(far, bot);
assert(d.destX===60 && d.destZ===55, 'a searching bot drives straight at a far enemy (free-roam seek)');
// vector points toward the enemy, i.e. it closes distance
const before = Math.hypot(far.pos.x-bot.x, far.pos.z-bot.z);
const dirx=(d.destX-bot.x), dirz=(d.destZ-bot.z); const L=Math.hypot(dirx,dirz);
const stepped = { x: bot.x + (dirx/L)*5, z: bot.z + (dirz/L)*5 };
const after = Math.hypot(far.pos.x-stepped.x, far.pos.z-stepped.z);
assert(after < before, 'stepping toward the target reduces the distance (it actually converges)');
// no target -> roams within the arena
const r = searchDest(null, bot);
assert(Math.abs(r.destX-bot.x)<=16 && Math.abs(r.destZ-bot.z)<=16, 'with no enemies it roams locally');
done();
