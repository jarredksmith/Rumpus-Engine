// build 1318 (editor audit 4.9) — "logicFailures surfaced through levelIssues is good. There is still no
// live pulse, no wire highlight, no variable watch, no breakpoint. The graph is 22 node types, 26 verbs and
// an expression language — expressive enough that 'why didn't that fire' is now a real question with no
// instrument."
//
// Builds a real graph, runs real pulses through it, and reads the real DOM back.
import { withGame } from './driver.mjs';

const BUILD = `(function(){
  /* a small real graph: an interval that adds to a counter, wired on to a second node */
  logicGraph.nodes = [
    { id:'n1', type:'setvar', x:100, y:100, p:{ name:'score', value:'0' } },
    { id:'n2', type:'addvar', x:320, y:100, p:{ name:'score', value:'5' } },
    { id:'n3', type:'addvar', x:540, y:100, p:{ name:'combo', value:'1' } },
    { id:'n4', type:'addvar', x:540, y:220, p:{ name:'never', value:'1' } },
  ];
  logicGraph.wires = [ { a:'n1', o:0, b:'n2', i:'in' }, { a:'n2', o:0, b:'n3', i:'in' } ];
  logicVars = {};
  if(typeof _lgOpen==='function') _lgOpen();
  return { nodes:logicGraph.nodes.length, wires:logicGraph.wires.length, traceOn:_lgTraceOn,
           board: !!document.getElementById('lgBoard'), watch: !!document.getElementById('lgWatch') };
})()`;

await withGame(async (P, page) => {
  console.log('setup   :', JSON.stringify(await P(BUILD)));
  await page.waitForTimeout(600);

  console.log('\\n--- FIRE THE CHAIN ---');
  console.log('one pulse:', JSON.stringify(await P(`(function(){
    _lgTraceClear(); _lgBudget = 0; _lgPulse('n1', 'in');
    const n = {}; _lgHitN.forEach((v,k)=>{ n[k]=v.n; });
    const w = {}; _lgHitW.forEach((v,k)=>{ w['wire'+k]=v.n; });
    return { nodesFired:n, wiresFired:w, vars:JSON.parse(JSON.stringify(logicVars)) };
  })()`)));
  console.log('  (n4 is wired to nothing — it must be ABSENT, which is the "why did that not fire" answer)');

  console.log('ten pulses:', JSON.stringify(await P(`(function(){
    _lgTraceClear();
    for(let i=0;i<10;i++){ _lgBudget = 0; _lgPulse('n1','in'); }
    const n = {}; _lgHitN.forEach((v,k)=>{ n[k]=v.n; });
    return { counts:n, score:logicVars.score, combo:logicVars.combo };
  })()`)));

  console.log('\\n--- THE DOM THE CREATOR ACTUALLY SEES ---');
  await page.waitForTimeout(200);
  console.log('badges  :', JSON.stringify(await P(`(function(){
    const out = {};
    document.querySelectorAll('#lgBoard [data-node]').forEach(el=>{
      const b = el.querySelector('[data-lgn]');
      out[el.dataset.node] = b ? b.textContent : null;
    });
    return out;
  })()`)));
  console.log('glow    :', JSON.stringify(await P(`(function(){
    _lgTraceClear(); _lgBudget = 0; _lgPulse('n1','in'); _lgTracePaint();
    const lit = document.querySelector('#lgBoard [data-node="n1"]').style.boxShadow;
    const cold = document.querySelector('#lgBoard [data-node="n4"]').style.boxShadow;
    return { firedNode: /rgba\\(122, ?255, ?209/.test(lit), unfiredNode: /rgba\\(122, ?255, ?209/.test(cold) };
  })()`)));
  console.log('wires   :', JSON.stringify(await P(`(function(){
    _lgTracePaint();
    const ws = [...document.querySelectorAll('#lgWires [data-wire]')].map(p=>+p.getAttribute('stroke-width'));
    return { strokeWidths: ws, base: 2.5 };
  })()`)));

  console.log('\\n--- THE FLASH DECAYS, THE COUNT DOES NOT ---');
  console.log(JSON.stringify(await P(`(function(){
    const el = document.querySelector('#lgBoard [data-node="n1"]');
    const hot = el.style.boxShadow;
    _lgHitN.get('n1').t = performance.now() - (LG_TRACE_MS + 100);   /* pretend it fired a while ago */
    _lgTracePaint();
    return { wasGlowing: /rgba\\(122/.test(hot), stillGlowing: /rgba\\(122/.test(el.style.boxShadow),
             badgeStillThere: !!el.querySelector('[data-lgn]'), badge: el.querySelector('[data-lgn]').textContent };
  })()`)));

  console.log('\\n--- THE VARIABLE WATCH ---');
  console.log(JSON.stringify(await P(`(function(){
    logicVars = { score: 45, combo: 3, 'a<b': '<script>' };
    _lgWatchPaint();
    const h = document.getElementById('lgWatch');
    return { text: h.textContent.replace(/\\s+/g,' ').trim().slice(0,60),
             escaped: h.innerHTML.indexOf('<script>') < 0 && h.innerHTML.indexOf('&lt;script&gt;') >= 0 };
  })()`)));
  console.log('empty   :', JSON.stringify(await P(`(function(){
    logicVars = {}; _lgWatchPaint();
    return { says: document.getElementById('lgWatch').textContent.slice(0, 48) };
  })()`)));

  console.log('\\n--- IT COSTS NOTHING WHEN CLOSED ---');
  console.log(JSON.stringify(await P(`(function(){
    _lgClose();
    const rafBefore = _lgTraceRaf;
    _lgTraceClear(); _lgBudget = 0; _lgPulse('n1','in');
    let recorded = 0; _lgHitN.forEach(()=>recorded++);
    const r = { traceOn:_lgTraceOn, rafCancelled: rafBefore === 0 && _lgTraceRaf === 0, recordedWhileClosed: recorded };
    _lgOpen(); return r;
  })()`)));
  await page.waitForTimeout(300);
  console.log('reopen keeps counts:', JSON.stringify(await P(`(function(){
    _lgBudget = 0; _lgPulse('n1','in');
    const e = _lgHitN.get('n1');
    return { traceOn:_lgTraceOn, n1: e ? e.n : 0 };
  })()`)));
}, { settleMs: 9000 });
