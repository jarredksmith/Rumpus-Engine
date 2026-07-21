// (build 1028) LOGIC GRAPH EDITOR — the node canvas for the 1027 runtime: full-screen board
// (pan/zoom), draggable nodes with inline params, drag-a-port-to-a-port wiring (click a wire
// to remove it), an Add-node palette grouped EVENTS / FLOW / STATE / ACTIONS. Lives on the
// editor's Rules tab. Verified live in the browser too (smoke: author a graph through the UI
// helpers, run a match, watch the variables move).
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- every runtime node type has an editor definition, and vice versa ----
const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
const runtimeTypes = ['start','event','interval','onkill','onwave','branch','counter','delay','repeat','random','once','setvar','addvar','do','toast','emit','win','lose'];
for(const t of runtimeTypes) assert(defs[t], 'palette covers runtime type: '+t);
eq(Object.keys(defs).length, runtimeTypes.length, 'no orphan editor types the runtime would ignore');
// pin the pieces the interpreter dispatches on
const pulse = extractFunction('_lgPulse', src);
for(const t of runtimeTypes){ if(['start','event','interval','onkill','onwave'].includes(t)) continue;
  assert(new RegExp("case '"+t+"':").test(pulse), 'the interpreter handles '+t); }
// entry nodes have no input pin; terminal actions have no outputs
for(const t of ['start','event','interval','onkill','onwave']) assert(!defs[t].ins, t+' is an entry — nothing wires INTO it');
for(const t of ['win','lose']) eq(defs[t].outs.length, 0, t+' is terminal — nothing continues after it');
// branch/counter/repeat expose the outputs the runtime fires
eq(defs.branch.outs.join(','), 'true,false', 'branch outs match _lgFollow(0/1)');
eq(defs.counter.outs.join(','), 'reached,each', 'counter outs match (0=reached, 1=each)');
eq(defs.counter.ins.join(','), 'in,reset', 'counter has the reset pin');
eq(defs.once.ins.join(','), 'in,reset', 'once has the reset pin');

// ---- executable: the graph-mutation helpers the canvas drives ----
const glue = 'let logicGraph={nodes:[],wires:[]}; let _lgState={}; let _lgSeq=1; let _lgPan={x:0,y:0}, _lgZoom=1;\n'
  + 'const _lgDirty=()=>{}, _lgRender=()=>{}, _lgRenderWires=()=>{};\n'
  + 'const LG_DEFS=' + extractConst('LG_DEFS', src) + ';\n'
  + extractFunction('_lgNode', src) + '\n'
  + extractFunction('_lgNewId', src) + '\n'
  + extractFunction('_lgAddNode', src) + '\n'
  + extractFunction('_lgDelNode', src) + '\n'
  + extractFunction('_lgAddWire', src) + '\n';
const env = new Function(glue + 'return { add:_lgAddNode, del:_lgDelNode, wire:_lgAddWire, g:()=>logicGraph };')();
const a = env.add('start'), b = env.add('toast');
assert(a && b && a.id !== b.id, 'nodes get unique ids');
eq(env.add('nonsense'), null, 'unknown types are refused');
assert(env.add('do').p.verb === 'toggle', 'new nodes carry sensible default params');
env.wire(a.id, 0, b.id, 'in');
env.wire(a.id, 0, b.id, 'in');
eq(env.g().wires.length, 1, 'duplicate wires are refused');
env.wire(b.id, 0, b.id, 'in');
eq(env.g().wires.length, 1, 'self-wires are refused');
env.del(b.id);
eq(env.g().wires.length, 0, 'deleting a node deletes its wires');
eq(env.g().nodes.some(n=>n.id===b.id), false, '...and the node itself');

// ---- the canvas + panel wiring ----
assert(/_lgEl\.id='lgModal'/.test(src) && /LOGIC GRAPH<\/div>/.test(src), 'the full-screen canvas exists');
assert(/drag board = pan \\u00b7 wheel = zoom \\u00b7 drag a port onto a port = wire \\u00b7 click a wire = remove/.test(src),
  'the toolbar teaches the whole interaction model');
const open_ = extractFunction('_lgOpen', src);
assert(/view\.addEventListener\('wheel'/.test(open_) && /_lgZoom=Math\.max\(0\.4, Math\.min\(1\.6/.test(open_), 'wheel zoom, clamped');
assert(/_lgDragWire=\{ a:n\.id, o:idx, to:_lgBoardXY\(e\) \}/.test(src), 'dragging an OUT port starts a wire');
assert(/_lgAddWire\(_lgDragWire\.a, _lgDragWire\.o, n\.id, kind==='reset'\?'reset':'in'\)/.test(src), 'dropping on an IN (or reset) port lands it');
assert(/logicGraph\.wires\.splice\(\+pth\.dataset\.wire,1\)/.test(src), 'clicking a wire removes it');
assert(/pushUndoSnapshot\(\); _lgDelNode\(n\.id\);/.test(src), 'node deletes are undoable');
assert(/\+ sec\('Logic graph', 'logic', '<div id="edLogic"><\/div>'\)/.test(src), 'the Logic graph section exists');
assert(/rules:\s*\['game','pickups','loot','invitems','buildmenu','logic','cutscenes'\]/.test(src), '...on the Gameplay tab');
assert(/renderLogicPanel==='function'\) renderLogicPanel\(\);/.test(src), 'the panel renders with the editor');
assert(/b\.onclick=_lgOpen;/.test(extractFunction('renderLogicPanel', src)), 'Open logic graph launches the canvas');

done('build 1028: logic graph editor — palette/runtime parity, safe graph mutations, canvas wiring');
