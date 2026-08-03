// build 1322 — editor audit 4.11, the two remaining structural bullets:
//   "The outliner renders one DOM row per object with no virtualisation, rebuilt on a 160 ms coalesce
//    during edits."
//   "Transform fields show 5 decimal places for a position in metres."
//
// The outliner claim is a PERFORMANCE claim, so it needs a number before it needs a fix. This builds N real
// props, opens the outliner, and times the real _outRefresh() at several scales — with a control pass at
// N=0 so the fixed cost is separated from the per-row cost.
import { withGame } from './driver.mjs';

/* ADD to the scene rather than rebuilding it — a teardown/rebuild per step made the first run of this
   probe take minutes and produce no measurement at all. */
const ADD = (n) => `(function(){
  const base = propModels.length;
  for(let i=0;i<${n};i++){
    spawnProp('box', [ (i%20)*2-20, 0, Math.floor(i/20)*2-20, 0,0,0, 1 ], null);
  }
  return { props: propModels.length, added: propModels.length - base };
})()`;

const TIME = `(function(){
  if(!_outOn) _outToggle();
  _outRefresh();                                  /* warm: first paint builds the panel shell */
  const t0 = performance.now();
  for(let i=0;i<5;i++) _outRefresh();
  const ms = (performance.now() - t0) / 5;
  const body = document.getElementById('outBody');
  return { msPerRefresh: +ms.toFixed(2),
           domNodes: body ? body.getElementsByTagName('*').length : 0,
           rows: body ? body.querySelectorAll('.outRow').length : 0 };
})()`;

await withGame(async (P, page) => {
  console.log('open editor:', JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor(); return { editorOpen }; })()`)));
  await page.waitForTimeout(800);

  console.log('\nprops = 0 (control: the fixed cost)', JSON.stringify(await P(`({ props: propModels.length })`)));
  console.log('  refresh:', JSON.stringify(await P(TIME)));
  for (const step of [50, 150, 200]) {
    console.log('\n+' + step + ' ->', JSON.stringify(await P(ADD(step))));
    console.log('  refresh:', JSON.stringify(await P(TIME)));
  }

  console.log('\n--- THE HONEST PAIR: an unchanged refresh vs a genuinely changed one ---');
  console.log('unchanged x5 :', JSON.stringify(await P(`(function(){
    _outRefresh();
    const t0 = performance.now(); for(let i=0;i<5;i++) _outRefresh();
    return { msPerRefresh: +((performance.now()-t0)/5).toFixed(3) };
  })()`)));
  console.log('changed   x5 :', JSON.stringify(await P(`(function(){
    /* rename a prop each time, so the signature really differs and the DOM really IS rebuilt */
    const t0 = performance.now();
    const o = propModels.filter(Boolean)[0];   /* propModels can carry holes — _outItems skips them */
    for(let i=0;i<5;i++){ o.userData.name = 'r'+i; _outRefresh(); }
    return { msPerRefresh: +((performance.now()-t0)/5).toFixed(3) };
  })()`)));
  console.log('a gizmo drag :', JSON.stringify(await P(`(function(){
    /* what the 160ms coalesce actually fires on while dragging: a TRANSFORM changes and nothing the
       outliner displays does. This is the case that was costing 19.64 ms a time. */
    const o = propModels.filter(Boolean)[0];
    const t0 = performance.now();
    for(let i=0;i<5;i++){ o.position.x += 0.1; _outRefresh(); }
    return { msPerRefresh: +((performance.now()-t0)/5).toFixed(3) };
  })()`)));
  console.log('rows still there:', JSON.stringify(await P(`({ rows: document.querySelectorAll('#outBody .outRow').length })`)));


  console.log('\\n--- the coalesce window it is rebuilt on ---');
  console.log(JSON.stringify(await P(`(function(){
    const s = String(_outQueueRefresh);
    return { coalesceMs: (s.match(/\\}, (\\d+)\\);/)||[])[1], guardsOnEditorOpen: /!_outOn \\|\\| typeof editorOpen==='undefined' \\|\\| !editorOpen/.test(s) };
  })()`)));

  console.log('\\n--- 5 DECIMAL PLACES ON A POSITION IN METRES ---');
  console.log(JSON.stringify(await P(`(function(){
    editorActive='props'; selProps=[propModels[0]]; editorTargets.props.idx=0;
    setEditorMode('build'); renderEditorFields();
    const out = [];
    editorEl.querySelectorAll('#edFields .field').forEach(f=>{
      const lb=f.querySelector('label span'), n=f.querySelector('input.valnum');
      if(lb && n) out.push({ label: lb.textContent, shown: n.value, step: n.step });
    });
    return out;
  })()`)));
}, { settleMs: 9000 });
