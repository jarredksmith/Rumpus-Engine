import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 518: combined locomotion+firing animation slots — walk/run/crouch/sprint while shooting. Four new
// slots, each falling back to its plain locomotion if a model lacks the combined clip, plus a _fireSlot
// helper and resolver wiring for the local avatar, bots, and remote players.

// ---- the four slots exist with a dedicated group ----
for(const k of ['walkFire','runFire','crouchFire','sprintFire'])
  assert(new RegExp("k:'"+k+"', +g:'Movement \\+ firing'").test(src), 'slot '+k+' exists in the Movement + firing group');

// ---- they fall back to plain locomotion (legs still animate without a combined clip) ----
assert(/walkFire:'walk', runFire:'run', crouchFire:'crouchWalk', sprintFire:'sprint',/.test(src), 'combined slots fall back to locomotion');

// ---- they loop (not one-shots) ----
assert(!/_ANIM_ONESHOT = new Set\(\[[^\]]*walkFire/.test(src), 'move+fire slots are looping, not one-shots');

// ---- _fireSlot maps a loco family to its combined slot ----
const fs = new Function('return ('+extractFunction('_fireSlot')+')')();
eq(fs('walk'),'walkFire','walk -> walkFire'); eq(fs('run'),'runFire','run -> runFire');
eq(fs('crouch'),'crouchFire','crouch -> crouchFire'); eq(fs('sprint'),'sprintFire','sprint -> sprintFire');
eq(fs('idle'),null,'idle (standing) -> null, caller uses plain attack');

// ---- resolvers choose the combined slot when moving + firing ----
assert(/firing: combined move\+fire when moving, else the standing attack pose/.test(src) && /_fireSlot\(_ff\)\|\|'attack'/.test(src), 'local avatar uses move+fire');
// build 1294: the same choice, now qualified by the weapon in hand — _wepAnimSlot appends `@<weapon>`
// and an unmapped variant falls straight back to the slot chosen here, so the selection is unchanged.
assert(/const _bt=md>0\.06\?'run':\(md>0\.015\?'walk':null\); st=_wepAnimSlot\(\(_bt\?\(_fireSlot\(_bt\)\|\|'attack'\):'attack'\), b\.wep\);/.test(src), 'bots use move+fire while advancing');
assert(/const _rf = rp\.crouch \? 'crouch' : \(tier==='run'\?'run':\(tier==='walk'\?'walk':null\)\); _st=_wepAnimSlot\(\(_rf\?\(_fireSlot\(_rf\)\|\|'attack'\):'attack'\), rp\.wep\);/.test(src), 'remote players use move+fire after a networked shot');

done();
