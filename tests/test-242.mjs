import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 341: tags + signals — props can trigger actions on other tagged props.

// --- executable: fireSignals across the action matrix ---
const fn = new Function('propModels','xaToggle','broadcastXAnim','broadcastAnim','broadcastUnlock','playPropAnimationOnce','NET','lightModels','setLightOn','broadcastLight',
  extractFunction('_applySignalAction') + '\n' + extractFunction('fireSignals') + '\nreturn fireSignals;');
const mk = () => {
  const calls = { toggle:[], xbc:[], abc:[], ubc:[], anim:[] };
  const props = [
    { userData:{ tag:'door', xa:{ on:true, dest:0 } } },           // 0
    { userData:{ tag:'door', xa:{ on:true, dest:1 } } },           // 1 (same tag — multi-target)
    { userData:{ tag:'vault', lockId:'red' } },                    // 2
    { userData:{ tag:'fx' } },                                     // 3 (plain — anim target)
    { userData:{} },                                               // 4 untagged
  ];
  const f = fn(props,
    o=>{ calls.toggle.push(o); o.userData.xa.dest = o.userData.xa.dest?0:1; },
    i=>calls.xbc.push(i), i=>calls.abc.push(i), i=>calls.ubc.push(i),
    o=>calls.anim.push(o), { mode:'off' }, [], ()=>{}, ()=>{});   // build 699: lightModels/setLightOn/broadcastLight stubs (no lights in this matrix)
  return { f, props, calls };
};
{ const { f, props, calls } = mk();
  f({ userData:{ signals:[{ when:'destroyed', do:'toggle', target:'door' }] } }, 'destroyed');
  assert(calls.toggle.length === 2 && calls.xbc.join(',') === '0,1', 'toggle hits every prop with the tag + broadcasts each'); }
{ const { f, props, calls } = mk();
  f({ userData:{ signals:[{ when:'interacted', do:'open', target:'door' }] } }, 'interacted');
  assert(props[0].userData.xa.dest === 1 && calls.xbc.length === 1 && calls.xbc[0] === 0, 'open only moves (and broadcasts) the closed one — already-open is left alone'); }
{ const { f, props, calls } = mk();
  f({ userData:{ signals:[{ when:'interacted', do:'unlock', target:'vault' }] } }, 'interacted');
  assert(props[2].userData.unlocked === true && calls.ubc.join(',') === '2', 'unlock marks + broadcasts');
  f({ userData:{ signals:[{ when:'interacted', do:'unlock', target:'vault' }] } }, 'interacted');
  assert(calls.ubc.length === 1, 'second unlock is a no-op'); }
{ const { f, calls } = mk();
  f({ userData:{ signals:[{ when:'destroyed', do:'anim', target:'fx' }] } }, 'interacted');
  assert(calls.anim.length === 0, 'wrong event -> nothing fires'); }
{ const { f, calls } = mk();
  f({ userData:{ signals:[{ when:'destroyed', do:'anim', target:'fx' }] } }, 'destroyed');
  assert(calls.anim.length === 1 && calls.abc.join(',') === '3', 'anim action plays + broadcasts'); }

// --- emitters wired ---
assert(/obj\.userData\._shattered = true;[\s\S]*?if\(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\{ try\{ fireSignals\(obj, 'destroyed'\); \}catch\(e\)\{\} \}/.test(extractFunction('shatterProp')), 'destroyed fires authoritative-side only');
const it = extractFunction('interact');
assert((it.match(/fireSignals\(o, 'interacted'\);/g)||[]).length === 2, 'both interact branches emit');
const xI = it.indexOf("xaToggle(o)");
assert(it.indexOf("fireSignals(o, 'interacted')", xI) > it.indexOf('broadcastXAnim(i)', xI), 'emit comes after the activation broadcast');

// --- persistence: serialize + 3-site restore ---
assert(/if\(o\.userData\.tag\) e\.tg=o\.userData\.tag;/.test(extractFunction('propEntry')), 'tag serialized');
assert(/e\.sg=o\.userData\.signals\.map\(s=>\{ const x=\{ w:s\.when, d:s\.do, t:s\.target \}; if\(s\.clip\) x\.c=s\.clip; if\(s\.cs\) x\.n=s\.cs; if\(s\.from\) x\.f=s\.from; if\(s\.contain\) x\.ci=1; if\(s\.text\) x\.tx=s\.text; if\(s\.needItem\) x\.ni=s\.needItem; if\(s\.needConsume\) x\.nc=1; if\(s\.consume\) x\.cn=1; return x; \}\);/.test(extractFunction('propEntry')), 'signals serialized compactly (clip 349, cutscene 356, contact 682, objective 692, needItem 706, consume 740)');
assert(src.split('if(Array.isArray(p.sg)) obj.userData.signals=p.sg.map(s=>{ const x={ when:s.w, do:s.d, target:s.t }; if(s.c) x.clip=s.c; if(s.n) x.cs=s.n; if(s.f) x.from=s.f; if(s.ci) x.contain=true; if(s.tx) x.text=s.tx; if(s.ni) x.needItem=s.ni; if(s.nc) x.needConsume=true; if(s.cn) x.consume=true; return x; });').length - 1 === 3, 'restored at all three prop-load sites (clip + cutscene + contact + objective + needItem + consume)');

// --- editor + level check ---
assert(/edFold\(animHost, 'signals', 'Signals', false, 'Tag this prop/.test(src), 'Signals fold in the inspector (title + subtitle, build 362)');
assert(/\[\['destroyed','On destroyed'\],\['interacted','On E'\],\['contact','On object placed'\]\]/.test(src) && /\[\['toggle','Toggle'\],\['open','Open'\],\['close','Close'\],\['anim','Play anim'\],\['unlock','Unlock'\],\['win','Win level'\],\['cutscene','Play cutscene'\],\['objective','Set objective'\],\['checkpoint','Set checkpoint'\]\]/.test(src), 'when/do dropdowns');
assert(/A signal targets tag '"\+s\.target\+"', but no prop carries that tag\./.test(extractFunction('levelIssues')), 'Level check flags dangling signal targets');
done();
