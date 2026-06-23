import { gameSource, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 644: climbing animation slots + a hang/pull-up/drop ledge mechanic that drives them in 3rd person, with a
// network code so co-op peers see the climb. Ledge: hang -> (Space/forward) pull up OR (Ctrl/back) drop down.

// --- animation slots exist for ledge + ladder, in a Climbing group ---
const slots = (new Function('return ('+extractConst('ANIM_SLOTS')+')'))();
const byKey = Object.fromEntries(slots.map(s=>[s.k, s]));
for(const k of ['ledgeHang','ledgeUp','ledgeDrop','ladderIdle','ladderUp','ladderDown']){
  assert(byKey[k], `slot "${k}" exists`);
  eq(byKey[k].g, 'Climbing', `${k} is in the Climbing group`);
  assert(byKey[k].re instanceof RegExp, `${k} has an auto-match regex`);
}
// the pull-up and drop are one-shots; hang + ladder climbs loop
const oneshot = (new Function('return ('+extractConst('_ANIM_ONESHOT').replace(/^new Set\(/,'').replace(/\)$/,'')+')'))();
assert(oneshot.includes('ledgeUp') && oneshot.includes('ledgeDrop'), 'pull-up + drop are one-shots (play once, clamp)');
assert(!oneshot.includes('ledgeHang') && !oneshot.includes('ladderUp'), 'hang + ladder climbs loop');

// --- graceful fallbacks when a model ships no climb clips ---
const fb = (new Function('return ('+extractConst('_ANIM_FALLBACK')+')'))();
eq(fb.ledgeHang, 'jump'); eq(fb.ladderUp, 'ladderIdle'); eq(fb.ladderIdle, 'idle');

// --- the climb anim is driven locally + carried over the network as a small code ---
assert(/else if\(_climbAnim\) st=_climbAnim;/.test(src), '3rd-person body plays the climb anim (high priority, below death)');
assert(/cl:_climbCode\(\)/.test(src), 'own state broadcasts a climb code (host + client senders)');
assert(/rp\.cl=pl\.cl\|\|0;/.test(src) && /rp\.cl = msg\.cl\|\|0;/.test(src), 'remote climb code is applied on both peers');
assert(/if\(rp\.cl\) _st = _CLIMB_BY_CODE\[rp\.cl\] \|\| _st;/.test(src), 'remote avatars play the synced climb anim');

// --- executable: the code <-> slot mapping round-trips ---
const CODES = (new Function('return ('+extractConst('_CLIMB_CODES')+')'))();
const BY = (new Function('return ('+extractConst('_CLIMB_BY_CODE')+')'))();
for(const k of Object.keys(CODES)){ eq(BY[CODES[k]], k, `code ${CODES[k]} maps back to ${k}`); }
eq(BY[0], '', 'code 0 = not climbing');

done('climbing anim slots (ledge hang/up/drop + ladder up/down/idle) + hang-and-choose ledge, synced (build 644)');
