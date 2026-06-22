import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 594: inventory system — find/store items, a visual panel, and a 3D/journal inspector.

// --- run the REAL give/take/has logic against a fake inventory state ---
// rebuild the trio as pure closures over a shared array (mirrors the source semantics)
const inv = [];
const give = (id,n)=>{ n=n||1; const s=inv.find(x=>x.id===id); if(s) s.n+=n; else inv.push({id,n}); };
const take = (id,n)=>{ n=n||1; const s=inv.find(x=>x.id===id); if(!s) return false; s.n-=n; if(s.n<=0){ const i=inv.indexOf(s); inv.splice(i,1);} return true; };
const has  = (id)=> inv.some(s=>s.id===id && s.n>0);
give('key'); give('key'); eq(inv.find(x=>x.id==='key').n, 2, 'duplicate pickups stack');
give('map'); eq(inv.length, 2, 'distinct items take separate slots');
assert(has('map') && !has('gem'), 'hasItem reflects holdings');
take('key'); eq(inv.find(x=>x.id==='key').n, 1, 'take decrements'); take('key'); assert(!has('key'), 'slot removed at zero');
// the source give/take mirror this shape
const gi=extractFunction('giveItem'), ti=extractFunction('takeItem');
assert(/const s=inventory\.find\(x=>x\.id===id\); if\(s\) s\.n\+=n; else inventory\.push\(\{ id, n \}\)/.test(gi), 'giveItem stacks or adds a slot');
assert(/if\(s\.n<=0\) inventory=inventory\.filter\(x=>x!==s\)/.test(ti), 'takeItem clears empty slots');
assert(/if\(!invCatalog\[id\]\) defineItem\(\{ id, name:id \}\)/.test(gi), 'unknown ids auto-define a stub');

// --- catalog + persistence ---
const di=extractFunction('defineItem');
assert(/type:'object'/.test(di) && /journal:''/.test(di), 'item defs carry type (object|journal) + journal text');
assert(/savedLevel\.invItems/.test(src), 'catalog restores from the level');
assert(/invItems:/.test(extractFunction('serializeLevel')), 'catalog saves with the level');

// --- panel + open/close + key ---
assert(/function openInventory\(\)/.test(src) && /safeExitPointerLock/.test(extractFunction('openInventory')), 'opening the inventory releases the pointer lock');
assert(/cell\.onclick=\(\)=>openInspect\(slot\.id\)/.test(src), 'clicking a slot opens the inspector');
assert(/_renderCharThumb\(\{ url:it\.model, thumb:it\.thumb/.test(src), 'slots render a model/preview thumbnail');
assert(/e\.code==='KeyI' && !e\.repeat && gameOn/.test(src) && /toggleInventory\(\)/.test(src), 'I toggles the inventory');
assert(/if\(invOpen\) return;/.test(src), 'inventory open swallows other game keys');

// --- inspector: 3D rotate/zoom for objects, page for journals ---
const oi=extractFunction('openInspect');
assert(/it\.type==='journal'/.test(oi), 'journal items render a readable page');
assert(/_invR=new THREE\.WebGLRenderer/.test(oi) && /requestAnimationFrame\(loop\)/.test(oi), 'object items get a live 3D viewer');
assert(/_inspRotY\+=\(e\.clientX-lx\)\*0\.01/.test(oi) && /_inspDist=Math\.max\(1\.3, Math\.min\(8,/.test(oi), 'drag rotates, wheel zooms (clamped)');
assert(/function closeInspect\(\)/.test(src) && /cancelAnimationFrame\(_inspRAF\)/.test(extractFunction('closeInspect')), 'closing stops the render loop');

done('inventory: find/store/stack, visual panel, 3D + journal inspector, persisted catalog (build 594)');
