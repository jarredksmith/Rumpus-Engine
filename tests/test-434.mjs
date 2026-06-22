import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 571: AI scene builder. Claude returns a per-room manifest; _aiNormalizePlan validates + clamps it into the
// SAME item shape the rule parser emits, so the planner/executor are reused. The fetch is glue; the normaliser is pure.

const norm = new Function('return ('+extractFunction('_aiNormalizePlan')+')')();

// a realistic (and slightly messy) model response
const resp = { rooms:[
  { role:'reception', items:[ {term:'reception desk',size:2.2,zone:'wall',count:1}, {term:'office chair',size:0.9,zone:'center',count:2}, {term:'sofa',size:2,zone:'wall',count:1}, {term:'television',size:1.2,zone:'wall',count:1} ] },
  { role:'break room', items:[ {term:'table',size:1.4,zone:'center',count:2}, {term:'vending machine',size:1.9,zone:'wall',count:2}, {name:'coffee maker',size:0.4,zone:'wall',count:1} ] },
  // junk to be sanitised:
  { role:'bad', items:[ {term:'',size:1,zone:'wall',count:1}, {term:'crate',size:99,zone:'floor',count:50}, null, {term:'a really really really long furniture name that should be truncated hard',size:1,zone:'corner',count:1} ] }
]};

const plan = norm(resp, 3);
eq(plan.length, 3, 'three rooms kept');
eq(plan[0].role, 'reception', 'room role preserved');
eq(plan[1].items.find(it=>/coffee/.test(it.term)).term, 'coffee maker', 'accepts {name} as well as {term}');

// item shape matches the rule-parser items ({term,q2,size,zone,n})
const desk = plan[0].items[0];
eq(desk.term, 'reception desk', 'term kept'); eq(desk.q2, 'desk', 'q2 = head noun'); eq(desk.zone, 'wall', 'zone kept'); eq(desk.n, 1, 'count -> n');

// sanitising the junk room
const bad = plan[2].items;
assert(!bad.some(it=>it.term===''), 'empty term dropped');
const crate = bad.find(it=>it.term==='crate');
eq(crate.size, 6, 'oversize size clamped to 6'); eq(crate.n, 8, 'huge count clamped to 8'); eq(crate.zone, 'any', 'unknown zone -> any');
assert(bad.every(it=>it.term.length<=40), 'long term truncated to 40 chars');

// tolerant of a bare array (no {rooms} wrapper) and caps to numRooms
const plan2 = norm([ {role:'a',items:[{term:'lamp',size:1,zone:'corner',count:1}]}, {role:'b',items:[]}, {role:'c',items:[]} ], 2);
eq(plan2.length, 2, 'capped to numRooms even from a bare array');

// every emitted item is well-formed (so the planner can consume it)
for(const room of plan) for(const it of room.items){ assert(it.term && it.q2 && it.size>=0.2 && it.size<=6 && it.n>=1 && it.n<=8 && /^(wall|corner|center|any)$/.test(it.zone), 'well-formed item'); }

// --- source pins: key storage, API call, per-room wiring, panel field ---
assert(/const AI_KEY_LS='breach_anthropic_key'/.test(src) && /function aiGetKey\(\)/.test(src) && /function aiSetKey\(k\)/.test(src), 'Anthropic key stored like the other source keys');
const ap = extractFunction('_aiPlanScene');
assert(/api\.anthropic\.com\/v1\/messages/.test(ap), 'calls the Anthropic messages endpoint');
assert(/'anthropic-dangerous-direct-browser-access':'true'/.test(ap), 'sends the direct-browser-access header');
assert(/'x-api-key':key/.test(ap) && /'anthropic-version':'2023-06-01'/.test(ap), 'sends key + version headers');
assert(/_aiNormalizePlan\(parsed, roomInfos\.length\)/.test(src), 'normalises the parsed response');

const go = extractFunction('generateOffice');
assert(/const rooms=\[\], roomRects=\[\];/.test(go) && /roomRects\.push\(\[r0\+1, c0\+1, r1-1, c1-1\]\)/.test(go), 'office records each room rect');
assert(/const roomPools=\[\];/.test(go) && /roomPools\.push\(rp\)/.test(go), 'office builds per-room zone pools');
assert(/if\(opts\.desc && typeof aiGetKey==='function' && aiGetKey\(\) && typeof _aiPlanScene==='function'\)\{/.test(go), 'AI path gated on key + description');
assert(/_aiPlanScene\(opts\.desc, roomInfos,/.test(go) && /_planFurnish\(plan\[i\]\.items, rp, rnd, 10\)/.test(go), 'furnishes each room from its own pool');
assert(/\} else \{ _furnishDet\(\); \}/.test(go) && /err\)=>\{[^}]*_furnishDet\(\)/.test(go.replace(/\n/g,' ')), 'falls back to keyword placement with no key or on error');
const rp = extractFunction('renderGeneratePanel');
assert(/aiSetKey\(ak\.value\)/.test(rp) && /Anthropic API key/.test(rp), 'panel exposes an Anthropic key field');

// build 573: vision model picker wiring
const vp = extractFunction('_aiPickModel');
assert(/api\.anthropic\.com\/v1\/messages/.test(vp) && /'anthropic-dangerous-direct-browser-access':'true'/.test(vp), 'vision picker calls the messages endpoint with the browser header');
assert(/type:'image', source:\{ type:'url', url:c\.thumb \}/.test(vp), 'sends candidate thumbnails as image URL blocks');
assert(/_aiParsePick\(txt, withThumbs\.length\)/.test(vp), 'parses the vision response into indices');
assert(/c\.thumb/.test(vp) && /no thumbnails/.test(vp), 'requires thumbnails (falls back to title pick otherwise)');
const go2 = extractFunction('generateOffice');
assert(/_furnishExecute\(all, cell, \{ vision:/.test(go2) && /context:opts\.desc/.test(go2), 'office enables vision + passes scene context on the AI path');

done('AI scene builder: per-room manifest validated/clamped into reusable items; key + endpoint + fallback wired (build 571)');
