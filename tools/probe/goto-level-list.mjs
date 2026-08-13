// build 1496 — the Go to level field offers the levels
//
// Reported from play with four screenshots: a trigger firing `newLevel`, an On event node catching it, a
// Go to level node wired to it, a two-level campaign in the panel — and the level# dropdown offering
// `#hp #hpf #pid #team #x #z`. "There aren't different levels in the Go to level dropdowns."
//
// The field takes a 1-BASED NUMBER and it carried the VARIABLE datalist, so the one question a creator
// opens it to ask was the one thing it could not answer.
//
// Read as the creator sees it: the real datalist element in the real DOM, after the real editor built it.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  /* THE CONTROL: with no campaign the list is variables only, exactly as it was — a creator who is not
     building a campaign must not see phantom levels. */
  const none = await P(`(function(){
    campaign = { levels: [] };
    _lgRefreshDatalists();
    const el = document.getElementById('lgLevelList');
    const opts = el ? Array.from(el.options).map(o=>({ v:o.value, l:o.label })) : null;
    return { exists: !!el, count: opts ? opts.length : 0,
             anyNumbered: opts ? opts.some(o=>/^[0-9]+$/.test(o.v)) : null };
  })()`);
  console.log('no campaign ', JSON.stringify(none), ' <- no phantom levels');

  /* THE REPORT: the reporter's own campaign — two levels, named Intro and Level 2. */
  const two = await P(`(function(){
    campaign = { levels: [ { name:'Intro' }, { name:'Level 2' } ] };
    _lgRefreshDatalists();
    const el = document.getElementById('lgLevelList');
    const opts = Array.from(el.options).map(o=>({ v:o.value, l:o.label }));
    return { first: opts.slice(0, 2),
             levelsComeFirst: opts[0].v === '1' && opts[1].v === '2',
             variablesStillThere: opts.some(o=>o.l === 'variable'),
             total: opts.length };
  })()`);
  console.log('two levels  ', JSON.stringify(two), ' <- 1 -> Intro, 2 -> Level 2, and variables after them');

  /* an unnamed level still gets a usable label rather than an empty row */
  const unnamed = await P(`(function(){
    campaign = { levels: [ {}, { name:'' }, { name:'Vault' } ] };
    _lgRefreshDatalists();
    const el = document.getElementById('lgLevelList');
    return Array.from(el.options).filter(o=>/^[0-9]+$/.test(o.value)).map(o=>o.value + ' -> ' + o.label);
  })()`);
  console.log('unnamed     ', JSON.stringify(unnamed));

  /* THE NODE ITSELF, built by the real renderer: does the field the creator clicks point at the new list,
     and does it say what it wants? */
  const node = await P(`(function(){
    campaign = { levels: [ { name:'Intro' }, { name:'Level 2' } ] };
    if(!editorOpen) toggleEditor();
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    const ev = { id:'n1', type:'event', x:40,  y:40, p:{ name:'newLevel' } };
    const go = { id:'n2', type:'goto',  x:300, y:40, p:{} };
    logicGraph.nodes.push(ev, go);
    logicGraph.wires.push({ from:'n1', fo:0, to:'n2', ti:0 });
    _lgOpen(); _lgRender();
    const el = document.querySelector('[data-node="n2"]');
    const ins = el ? Array.from(el.querySelectorAll('input[type=text]')) : [];
    const labels = el ? Array.from(el.querySelectorAll('label')) : [];
    return {
      built: !!el,
      levelField: ins[0] ? { list: ins[0].getAttribute('list'), placeholder: ins[0].placeholder } : null,
      tagField:   ins[1] ? { list: ins[1].getAttribute('list'), placeholder: ins[1].placeholder } : null,
      /* build 1337 moves title -> data-tip, so read both */
      explains: labels.map(l => (l.title || l.getAttribute('data-tip') || '').slice(0, 42)).filter(Boolean),
    };
  })()`);
  console.log('node        ', JSON.stringify(node), ' <- the field a creator clicks points at lgLevelList');

  /* AND IT STILL WORKS THE WAY IT DID: a typed number loads, and a BLANK one now says it is blank rather
     than reporting "level 0". Driven through the real dispatch, never by calling the handler. */
  const fired = await P(`(function(){
    if(editorOpen) toggleEditor();
    const out = {};
    const grab = ()=>{ const r = (typeof levelIssues==='function') ? levelIssues() : []; return r.filter(t=>/Go to level/.test(t)); };

    /* not in a campaign at all — build 1352's first guard, unchanged */
    campaignActive = false;
    logicFailures.clear();   /* the real name — see build 1214; my first draft invented an _lgClearFailures */
    logicGraph.nodes.length = 0; logicGraph.wires.length = 0;
    logicGraph.nodes.push({ id:'g1', type:'goto', x:0, y:0, p:{ n:'2' } });
    _lgPulse('g1', 0);
    out.notInCampaign = grab();

    /* in a campaign, blank field */
    campaignActive = true; campaignIdx = 0;
    campaign = { levels: [ { name:'Intro' }, { name:'Level 2' } ] };
    logicFailures.clear(); logicGraph.nodes[0].p = {};
    _lgPulse('g1', 0);
    out.blank = grab();

    /* in a campaign, out of range */
    logicFailures.clear(); logicGraph.nodes[0].p = { n:'9' };
    _lgPulse('g1', 0);
    out.outOfRange = grab();
    return out;
  })()`);
  console.log('reports     ', JSON.stringify(fired, null, 0));

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
