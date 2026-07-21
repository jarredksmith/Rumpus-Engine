// (build 1027) LOGIC GRAPH RUNTIME — a node-based logic layer above the signal system:
// variables, branches, timers, counters, comparisons, randomization, loops, and reusable
// functions (named event + emit), all without code. Bridges: signals IN via the new do:'emit'
// verb; actions OUT via a 'do' node speaking _applySignalAction's whole verb vocabulary (the
// existing per-action MP broadcasts ride along). Host/solo authoritative; a per-frame pulse
// budget means a mis-wired loop can never lock the game. Serialized as level.logic.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the whole interpreter, with stubbed world hooks ----
const fns = extractFunction('_sanitizeLogic', src) + '\n'
  + extractFunction('_lgNode', src) + '\n'
  + extractFunction('_lgNum', src) + '\n'
  + extractFunction('_lgFollow', src) + '\n'
  + extractFunction('_lgFireEvents', src) + '\n'
  + extractFunction('logicEvent', src) + '\n'
  + extractFunction('logicStart', src) + '\n'
  + extractFunction('_lgPulse', src) + '\n'
  + extractFunction('updateLogic', src) + '\n';
function makeEnv(graph){
  const calls = { actions:[], toasts:[], won:0, lost:0 };
  const glue = 'let logicGraph=_sanitizeLogic(GRAPH); let logicVars={}; let _lgTimers=[]; let _lgState={}; let _lgBudget=0, _lgWarned=false;\n';
  const env = new Function('GRAPH','NET','gameOn','editorOpen','_applySignalAction','flashToast','gameWon','applyEnemyDamageToSelf','toast','console',
    glue + fns + '\nreturn { start:logicStart, event:logicEvent, tick:updateLogic, vars:()=>logicVars, graph:()=>logicGraph, sanitize:_sanitizeLogic };')(
    graph, { mode:'off' }, true, false,
    (s)=>calls.actions.push(s), (t)=>calls.toasts.push(t), ()=>calls.won++, ()=>calls.lost++, ()=>{}, { warn:()=>{} });
  return { env, calls };
}
const N = (id,type,p)=>({ id, type, x:0, y:0, p:p||{} });
const W = (a,o,b,i)=>({ a, o, b, i:i||'in' });

// ---- variables + toast interpolation ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('s','start'), N('v','setvar',{ name:'score', value:'10' }), N('a','addvar',{ name:'score', value:'-3' }),
    N('t','toast',{ text:'SCORE {score}' })],
    wires:[ W('s',0,'v'), W('v',0,'a'), W('a',0,'t') ] });
  env.start();
  eq(env.vars().score, 7, 'set 10 then add -3 = 7');
  eq(calls.toasts[0], 'SCORE 7', 'toasts interpolate {var} live');
}
// ---- branch: compares numbers OR variable names on either side ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('s','start'), N('v','setvar',{ name:'hp', value:'25' }),
    N('b','branch',{ a:'hp', op:'<', b:'50' }),
    N('lo','toast',{ text:'LOW' }), N('hi','toast',{ text:'HIGH' })],
    wires:[ W('s',0,'v'), W('v',0,'b'), W('b',0,'lo'), W('b',1,'hi') ] });
  env.start();
  eq(calls.toasts.join(','), 'LOW', 'true path only');
}
// ---- counter: every count + target-reached with auto-reset ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('e','event',{ name:'hit' }), N('c','counter',{ target:'3' }),
    N('each','addvar',{ name:'n', value:'1' }), N('done','toast',{ text:'THREE!' })],
    wires:[ W('e',0,'c'), W('c',1,'each'), W('c',0,'done') ] });
  env.start();
  for(let i=0;i<7;i++) env.event('hit');
  eq(env.vars().n, 7, 'the every-count output fired 7 times');
  eq(calls.toasts.length, 2, 'target=3 auto-resets: reached at 3 and 6');
}
// ---- reusable functions: emit -> named event, from two call sites ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('s','start'), N('c1','emit',{ name:'fx' }), N('c2','emit',{ name:'fx' }),
    N('fn','event',{ name:'fx' }), N('t','toast',{ text:'RAN' })],
    wires:[ W('s',0,'c1'), W('c1',0,'c2'), W('fn',0,'t') ] });
  env.start();
  eq(calls.toasts.length, 2, 'one function body, two call sites, two runs');
}
// ---- delay + interval: timers tick on the game loop ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('s','start'), N('d','delay',{ sec:'1' }), N('t','toast',{ text:'LATER' }),
    N('iv','interval',{ sec:'0.5', times:'3' }), N('n','addvar',{ name:'ticks', value:'1' })],
    wires:[ W('s',0,'d'), W('d',0,'t'), W('iv',0,'n') ] });
  env.start();
  eq(calls.toasts.length, 0, 'a delay does not fire instantly');
  for(let i=0;i<20;i++) env.tick(0.1);   // 2.0s total
  eq(calls.toasts.join(','), 'LATER', 'the delay fired once after ~1s');
  eq(env.vars().ticks, 3, 'a limited interval fires exactly its 3 times then stops');
}
// ---- repeat: instant N with #i, and paced with a gap ----
{
  const { env } = makeEnv({ nodes:[
    N('s','start'), N('r','repeat',{ times:'4' }), N('a','addvar',{ name:'sum', value:'#i' }), N('dn','setvar',{ name:'done', value:'1' })],
    wires:[ W('s',0,'r'), W('r',1,'a'), W('r',0,'dn') ] });
  env.start();
  eq(env.vars().sum, 6, 'repeat 4x summing #i = 0+1+2+3');
  eq(env.vars().done, 1, 'the done output fired after the last pass');
}
{
  const { env } = makeEnv({ nodes:[
    N('s','start'), N('r','repeat',{ times:'3', gap:'0.5' }), N('a','addvar',{ name:'n', value:'1' })],
    wires:[ W('s',0,'r'), W('r',1,'a') ] });
  env.start();
  env.tick(0.1); eq(env.vars().n, 1, 'a paced repeat runs its first pass right away');
  for(let i=0;i<12;i++) env.tick(0.1);
  eq(env.vars().n, 3, '...and finishes on the clock');
}
// ---- random: weighted picks land on the enabled outputs only ----
{
  const { env } = makeEnv({ nodes:[
    N('e','event',{ name:'roll' }), N('r','random',{ w0:'1', w1:'1', w2:'0', w3:'0' }),
    N('a','addvar',{ name:'a', value:'1' }), N('b','addvar',{ name:'b', value:'1' }), N('c','addvar',{ name:'c', value:'1' })],
    wires:[ W('e',0,'r'), W('r',0,'a'), W('r',1,'b'), W('r',2,'c') ] });
  env.start();
  for(let i=0;i<60;i++) env.event('roll');
  const v = env.vars();
  eq((v.a||0)+(v.b||0), 60, 'every roll picked an output');
  eq(v.c||0, 0, 'a zero-weight output never fires');
  assert((v.a||0)>5 && (v.b||0)>5, 'both live outputs get picked (60 rolls)');
}
// ---- once + reset pin ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('e','event',{ name:'go' }), N('o','once'), N('t','toast',{ text:'FIRST' }),
    N('rs','event',{ name:'rearm' })],
    wires:[ W('e',0,'o'), W('o',0,'t'), W('rs',0,'o','reset') ] });
  env.start();
  env.event('go'); env.event('go'); env.event('go');
  eq(calls.toasts.length, 1, 'once fires exactly once');
  env.event('rearm'); env.event('go');
  eq(calls.toasts.length, 2, 'the reset pin re-arms it');
}
// ---- the action bridge OUT + win ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('s','start'), N('d','do',{ verb:'open', target:'vaultDoor' }), N('w','win')],
    wires:[ W('s',0,'d'), W('d',0,'w') ] });
  env.start();
  eq(calls.actions.length, 1, 'the do node speaks the signal-action vocabulary');
  eq(calls.actions[0].do+'>'+calls.actions[0].target, 'open>vaultDoor', 'verb + target pass through untouched');
  eq(calls.won, 1, 'win ends the level');
}
// ---- safety: a wire loop with no delay stalls the GRAPH, not the game ----
{
  const { env, calls } = makeEnv({ nodes:[
    N('s','start'), N('a','addvar',{ name:'n', value:'1' }), N('b','addvar',{ name:'n', value:'1' })],
    wires:[ W('s',0,'a'), W('a',0,'b'), W('b',0,'a') ] });
  env.start();   // would loop forever without the budget
  assert(env.vars().n >= 100 && env.vars().n <= 500, 'the pulse budget cut the runaway loop');
  eq(calls.toasts.length, 0, 'no user toast from the stub (console warning only)');
}
// ---- sanitizer: caps, orphan wires, junk ----
{
  const { env } = makeEnv({ nodes:'junk', wires:[] });
  eq(env.graph().nodes.length, 0, 'garbage graphs come back empty');
  const g2 = makeEnv({ nodes:[ N('a','start') ], wires:[ W('a',0,'ghost'), W('a',0,'a') ] }).env.graph();
  eq(g2.wires.length, 1, 'wires to missing nodes are dropped, valid ones survive');
}

// ---- wiring into the game ----
assert(/if\(s\.do==='emit'\)\{ if\(typeof logicEvent==='function'/.test(src), "any prop signal can pulse the graph (do:'emit')");
assert(/\['emit','\\u2192 Logic event'\]/.test(src), 'the signal editor offers the new verb');
assert(/logic event name \(e\.g\. platePressed\)/.test(src), '...with a name field');
assert(/if\(typeof logicStart==='function'\) logicStart\(\);/.test(src), 'every match start resets vars/timers and fires On-start chains');
assert(/updateLogic\(dt\);\s+\/\/ logic graph timers/.test(src), 'timers tick on the main loop');
assert(/_lgFireEvents\('onkill',''\)/.test(src) && /_lgFireEvents\('onwave',''\)/.test(src), 'kill + wave entries are hooked');
assert(/logic: \(logicGraph\.nodes\.length \? _sanitizeLogic\(logicGraph\) : undefined\),/.test(src), 'the graph serializes with the level (absent when empty)');
eq((src.match(/logicGraph = _sanitizeLogic\(level\.logic\);/g)||[]).length, 2, 'restored (sanitized) at both level-load sites');
assert(/let logicGraph = _sanitizeLogic\(savedLevel && savedLevel\.logic\);/.test(src), 'boot restores it too');

done('build 1027: logic graph runtime — vars, branches, counters, timers, loops, random, functions, budget-guarded');
