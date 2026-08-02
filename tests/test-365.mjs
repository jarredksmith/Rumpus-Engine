import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 486: third-person animation taxonomy. The character system maps a clip to any of ~50 named slots
// (idle fidgets, turn-in-place, directional walk/run/strafe, sprint, crouch directional + transitions,
// jump start/land/hard-land/fall, melee light/heavy/combo, block/parry/dodge, equip/holster/throw,
// directional hit reactions, stagger, knockdown/getup, directional death). Slots resolve by explicit
// override or name-regex; one-shots clamp; unmapped slots fall back along a chain that always terminates.

// ---- taxonomy shape ----
const slotBlock = src.match(/const ANIM_SLOTS = \[([\s\S]*?)\n\];/)[1];
const keys = [...slotBlock.matchAll(/\bk:'([a-zA-Z0-9]+)'/g)].map(m=>m[1]);
assert(keys.length >= 45, `taxonomy is comprehensive (${keys.length} slots)`);
assert(new Set(keys).size === keys.length, 'no duplicate slot keys');
// the user's full wishlist is represented
const want = ['idle','idleFidget','idleToCombat','turnL','turnR','turn180','aim',
  'walk','walkBack','strafeL','strafeR','run','runBack','runStrafeL','runStrafeR','sprint','moveStart','moveStop','pivot180',
  'crouch','crouchWalk','crouchBack','crouchStrafeL','crouchStrafeR','standToCrouch','crouchToStand',
  'jumpStart','jump','jumpLand','hardLand','fall','slide',
  'attack','reload','meleeLight','meleeHeavy','meleeCombo','block','parry','dodge','equip','holster','throw',
  'hitFront','hitBack','hitLeft','hitRight','stagger','knockdown','getup','die','dieFront','dieBack'];
for(const k of want) assert(keys.includes(k), `taxonomy includes '${k}'`);
// every slot carries group + label + regex
assert((slotBlock.match(/\bg:'/g)||[]).length === keys.length, 'every slot has a group');
assert((slotBlock.match(/\bl:'/g)||[]).length === keys.length, 'every slot has a label');
assert((slotBlock.match(/\bre:\//g)||[]).length === keys.length, 'every slot has a name-pattern');

// ---- one-shot classification ----
const oneShotBlock = src.match(/const _ANIM_ONESHOT = new Set\(\[([^\]]+)\]\)/)[1];
const oneShots = [...oneShotBlock.matchAll(/'([a-zA-Z0-9]+)'/g)].map(m=>m[1]);
for(const k of ['die','dieFront','dieBack','reload','meleeLight','throw','hitFront','stagger','knockdown','getup','jumpStart','jumpLand','standToCrouch','turn180'])
  assert(oneShots.includes(k), `'${k}' is a one-shot (plays once + clamps)`);
for(const k of ['idle','walk','run','aim','crouch','sprint','jump','fall','block'])
  assert(!oneShots.includes(k), `'${k}' loops (not a one-shot)`);

// ---- fallback chain: parse the map, prove every slot resolves + no cycles ----
const fbBlock = src.match(/const _ANIM_FALLBACK = \{([\s\S]*?)\};/)[1];
const FB = {};
for(const m of fbBlock.matchAll(/(\w+):'(\w+)'/g)) FB[m[1]] = m[2];
// replicate _stateActionKey's resolution against a given action set
function resolve(acts, state){
  let s = state, guard = 0;
  while(s && guard++ < 12){ if(acts[s]) return s; s = FB[s]; }
  return acts.idle ? 'idle' : Object.keys(acts)[0];
}
// with only idle mapped, EVERY slot must collapse to idle (proves no chain dead-ends or loops before idle)
const onlyIdle = { idle:1 };
for(const k of keys) assert(resolve(onlyIdle, k) === 'idle', `'${k}' falls back to idle when nothing else is mapped`);
// chains never cycle: walking FB from any key reaches a terminal (no entry / idle) without revisiting
for(const k of keys){
  let s = k, seen = new Set(), steps = 0;
  while(s && FB[s] && steps++ < 20){ assert(!seen.has(s), `no cycle through '${k}'`); seen.add(s); s = FB[s]; }
  assert(steps < 20, `'${k}' chain terminates`);
}
// realistic partial set resolves to the nearest sensible mapped clip
const partial = { idle:1, walk:1, run:1, attack:1, die:1 };
assert(resolve(partial,'sprint') === 'run',   'sprint -> run');
assert(resolve(partial,'walkBack') === 'walk', 'walkBack -> walk');
assert(resolve(partial,'runStrafeL') === 'run','runStrafeL -> run');
assert(resolve(partial,'reload') === 'attack', 'reload -> attack');
assert(resolve(partial,'meleeCombo') === 'attack', 'meleeCombo -> meleeLight -> attack');
assert(resolve(partial,'crouchWalk') === 'idle','crouchWalk -> crouch(missing) -> idle');
assert(resolve(partial,'hitFront') === 'idle', 'hitFront -> stagger(missing) -> idle');
assert(resolve(partial,'dieBack') === 'die',   'dieBack -> die');
assert(resolve(partial,'jumpStart') === 'idle','jumpStart -> jump(missing) -> idle');

// ---- wiring: one resolver, derived _STATE_RE, one-shot drives loop+hold ----
const pes = extractFunction('playEnemyStates');
assert(/_ANIM_ONESHOT\.has\(st\)/.test(pes), 'build loop uses the one-shot set for loop mode');
const sa = extractFunction('setEnemyAnimState');
// build 1304: the loop mode belongs to the RESOLVED slot, not the requested name — a one-shot request
// falling back to a looping slot was stamping LoopOnce onto it (idle froze; see test-1304). An authored
// override is still honoured, looked up under the requested name first and the resolved slot second.
assert(/_holdDefault = _ANIM_ONESHOT\.has\(key\)/.test(sa), 'crossfade uses the one-shot set for hold default');
done();
