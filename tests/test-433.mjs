import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 567-570: "office complex with office chairs, trashcans, computers..." -> themed textures + light mood +
// curated, sized, wall-hugged props. build 570 makes search OPEN-VOCABULARY: the user's own words are the query
// (with a broad fallback), unknown nouns are kept (not dropped), plurals are stemmed.

// --- brace-slice the real engine out of the source and run the actual parser ---
function slice(marker, open, close){ const i=src.indexOf(marker); let j=src.indexOf(open,i), d=0; for(;j<src.length;j++){ if(src[j]===open)d++; else if(src[j]===close){ d--; if(!d){ j++; break; } } } return src.slice(i,j); }
const env = [
  slice('const SCENE_CATALOG','{','}'), slice('const SCENE_SYN','{','}'), slice('const SCENE_THEMES','[',']'),
  slice('const _SCENE_STOP','{','}'), slice('const _SCENE_NUMW','{','}'),
  slice('function _stemWord','{','}'), slice('function _parseSceneSpec','{','}'),
  'return { _parseSceneSpec, _stemWord };'
].join(';\n');
const { _parseSceneSpec, _stemWord } = new Function(env)();

// the reported failure case: a rich list must yield many items, including ones not in the catalog
const r = _parseSceneSpec('office complex with office chairs, trashcans, reception, desk, tables, computers, vending machine');
const terms = r.items.map(it=>it.term);
assert(terms.includes('office chairs'), 'keeps the user phrase "office chairs" as the query');
assert(terms.includes('trashcans'), 'plural "trashcans" is kept (not dropped)');
assert(terms.includes('computers'), 'unknown noun "computers" is kept and searched');
assert(terms.includes('vending machine'), 'multi-word "vending machine" kept');
assert(r.items.length>=6, 'six+ distinct items parsed from the list (got '+r.items.length+')');
eq(r.floor, 'carpet', 'office theme -> carpet floor');
for(const it of r.items){ assert(it.q2 && it.size>0 && it.zone, 'item '+it.term+' has fallback/size/zone'); }
const comp = r.items.find(it=>it.term==='computers'); eq(comp.q2, 'computer', 'unknown noun falls back to its singular');
const chair = r.items.find(it=>it.term==='office chairs'); eq(chair.q2, 'chair', 'recognised chair -> catalog fallback term'); eq(chair.zone, 'center', 'chairs zoned to center');

// counts: number words + digits
const r2 = _parseSceneSpec('a lobby with two couches, several plants and 3 lamps');
eq(r2.items.find(it=>/couch/.test(it.term)).n, 2, '"two couches" -> n=2');
eq(r2.items.find(it=>/plant/.test(it.term)).n, 4, '"several plants" -> n=4');
eq(r2.items.find(it=>/lamp/.test(it.term)).n, 3, '"3 lamps" -> n=3');

// stemmer
eq(_stemWord('trashcans'), 'trashcan', 'strip plural s'); eq(_stemWord('shelves'), 'shelf', 'shelves -> shelf'); eq(_stemWord('boxes'), 'box', 'boxes -> box');

// --- source pins: catalog + open-vocab parser + wiring ---
assert(/const SCENE_CATALOG = \{/.test(src) && /computer: *\{ *terms:'computer'/.test(src), 'catalog has a computer entry');
assert(/computers:'computer'/.test(src), 'computer synonyms added');
assert(/function _parseSceneSpec\(text\)\{/.test(src) && /return \{ items, floor, wall, mood \};/.test(src), 'parser returns an items list');
const go = extractFunction('generateOffice');
assert(/const spec = _parseSceneSpec\(opts\.desc\|\|''\);/.test(go) && /_furnishExecute\(_planFurnish\(spec\.items, zonePools, rnd\), cell\)/.test(go), 'office furnishes from parsed items');
const fx = extractFunction('_furnishExecute');
assert(/groups\.set\(k,/.test(fx) && /finishGroup/.test(fx), 'executor groups identical items so each is searched/picked once');
assert(/sfSearch\(q/.test(fx) && /ppSearch\(q/.test(fx), 'candidates gathered from Sketchfab then Poly Pizza');
assert(/_aiPickModel\(g\.term/.test(fx) && /_rankByTitle\(cands,g\.term\)/.test(fx), 'vision picks when on; title ranking is the fallback');
assert(/refs\[idx % refs\.length\]/.test(fx), 'multiple instances rotate through the approved models (variety)');
assert(/\(p\.size\|\|1\.2\)\*scale/.test(fx) && /_furnishScale/.test(src), 'every prop fit to real size x furniture-scale multiplier');
assert(/if\(p\.mount\)/.test(fx), 'mounted items hang on the wall at height, not on the floor');

// --- run the REAL _titleScore + _pickModel: prefer the title that matches the query, not the first result ---
const _STOP = new Function('return ('+'{a:1,an:1,the:1,some:1,of:1,and:1,with:1,in:1,on:1,to:1}'+')')();
const _stem = new Function('return ('+extractFunction('_stemWord')+')')();
const titleScore = new Function('_SCENE_STOP','_stemWord','return ('+extractFunction('_titleScore')+')')(_STOP, _stem);
const pick = new Function('_SCENE_STOP','_stemWord','_titleScore','return ('+extractFunction('_pickModel')+')')(_STOP, _stem, titleScore);
const rank = new Function('_titleScore','return ('+extractFunction('_rankByTitle')+')')(titleScore);
const res = [ {uid:'1', title:'Server Rack'}, {uid:'2', title:'Office Computer Desktop'}, {uid:'3', title:'Old Television'} ];
eq(pick(res, 'computer').model.uid, '2', '"computer" picks the computer, not the first-listed server rack');
eq(pick(res, 'television').model.uid, '3', '"television" matches the television');
assert(pick(res, 'computer').score>=1, 'a real title match is a confident score');
eq(pick([], 'desk'), null, 'no results -> null');
eq(rank(res, 'computer')[0].uid, '2', 'ranking puts the best title match first (for variety we take the top few)');

// --- run the REAL _aiParsePick: tolerant parse of the vision response into 0-based indices ---
const parsePick = new Function('return ('+extractFunction('_aiParsePick')+')')();
eq(JSON.stringify(parsePick('{"good":[2,4]}', 5)), JSON.stringify([1,3]), '1-based JSON -> 0-based indices');
eq(JSON.stringify(parsePick('```json\n{"good":[1]}\n```', 5)), JSON.stringify([0]), 'tolerates code fences');
eq(JSON.stringify(parsePick('{"good":[]}', 5)), JSON.stringify([]), 'empty = none acceptable');
eq(JSON.stringify(parsePick('{"good":[9,2]}', 3)), JSON.stringify([1]), 'out-of-range indices dropped');
eq(JSON.stringify(parsePick('I pick number 3', 5)), JSON.stringify([2]), 'falls back to a bare integer');

// --- run the REAL pure zone classifier ---
const zone = new Function('return ('+extractFunction('_sceneCellZone')+')')();
eq(zone(true,true,true,true), 'center', '4 open -> center');
eq(zone(true,true,true,false), 'edge', '3 open -> edge');
eq(zone(true,false,true,false), 'corner', '2 perpendicular -> corner');
eq(zone(true,true,false,false), 'corridor', '2 opposite -> corridor (skipped)');

// --- model the planner: items, zone-aware fallback, skip (not float) ---
const ORDER = { wall:['wall','corner'], corner:['corner','wall'], center:['center','wall','corner'], any:['wall','corner','center'] };
function plan(items, pools, cap){
  cap=cap||40; const out=[];
  const pop=z=>(pools[z]&&pools[z].length?pools[z].pop():null);
  const take=zone=>{ for(const z of (ORDER[zone]||[zone])){ const s=pop(z); if(s) return s; } return null; };
  for(const it of items){ for(let i=0;i<it.n&&out.length<cap;i++){ const sp=take(it.zone); if(!sp) break; out.push({term:it.term,x:sp.x}); } }
  return out;
}
const mk=(n,t)=>Array.from({length:n},(_,i)=>({x:t+i}));
let pools={ wall:mk(3,'W'), corner:mk(2,'C'), center:mk(4,'M') };
let out=plan([{term:'desk',zone:'wall',n:2},{term:'plant',zone:'corner',n:2},{term:'table',zone:'center',n:2}], pools);
eq(out.length, 6, 'all items placed when spots exist');
eq(new Set(out.map(p=>p.x)).size, 6, 'no spot reused');
pools={ wall:[], corner:[], center:mk(6,'M') };
out=plan([{term:'desk',zone:'wall',n:2}], pools);
eq(out.length, 0, 'a wall item with no wall/corner spot is skipped, not floated in the center');
eq(pools.center.length, 6, 'open-center spots untouched');

// --- model _hugWall push ---
function hugPush(room, half, m){ return Math.max(0, room*0.5 - half - (m||0.12)); }
near(hugPush(4.5, 0.4), 1.73, 1e-9, 'thin prop pushes ~1.73 to the wall');
eq(hugPush(4.5, 3.0), 0, 'oversized prop clamped at 0 (not pushed through the wall)');

done('open-vocabulary scene search: user words queried first, unknowns kept, plurals stemmed, counts parsed (build 570)');
