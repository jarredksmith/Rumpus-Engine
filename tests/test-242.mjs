import { gameSource, extractFunction, extractConst, assert, done } from './harness.mjs';
const src = gameSource();

// build 1280: the three loaders' byte-identical apply blocks became ONE function, _applyPropEntry,
// which all three call. So a field now appears TWICE in the file: there, and in _pfSpawnEntry's
// deliberate near-copy for prefabs/paste. The intent below is unchanged — the field survives a load
// by every path — and it is now structural rather than a count of duplicated text.
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
/* build 1397: the fire goes through `_lgPropEvent`, which sets the prop's payload around it and unwinds
   it afterwards. The assertion — that it is authoritative-side only — is unchanged. */
assert(/obj\.userData\._shattered = true;[\s\S]*?if\(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\{ try\{ _lgPropEvent\(obj, 'destroyed', _propCtx\(obj\)\); \}catch\(e\)\{\} \}/.test(extractFunction('shatterProp')), 'destroyed fires authoritative-side only');
const it = extractFunction('interact');
assert((it.match(/fireSignals\(o, 'interacted'\);/g)||[]).length === 3, 'all three interact branches emit (anim / mechanism / build-1035 Interactable checkbox)');
const xI = it.indexOf("xaToggle(o)");
assert(it.indexOf("fireSignals(o, 'interacted')", xI) > it.indexOf('broadcastXAnim(i)', xI), 'emit comes after the activation broadcast');

// --- persistence: serialize + 3-site restore ---
assert(/if\(o\.userData\.tag\) e\.tg=o\.userData\.tag;/.test(extractFunction('propEntry')), 'tag serialized');
/* build 1406: this quoted the hand-written short-key mapping, which is the very thing that had drifted —
   fourteen of seventeen world verbs lost every parameter because eight builds added fields to the signal
   editor and none of them to this line. The intent (these seven fields serialize compactly, under these
   exact short keys) is unchanged and is now asserted against the ONE table they come from. */
{ const T = extractConst('SIG_KEYS');
  assert(/e\.sg=o\.userData\.signals\.map\(_sigPack\)/.test(extractFunction('propEntry')), 'signals serialize through the one packer');
  for(const [k,short] of [['clip','c'],['cs','n'],['from','f'],['contain','ci'],['text','tx'],['needItem','ni'],['needConsume','nc'],['consume','cn'],['sound','so']])
    assert(new RegExp('\\b'+k+":'"+short+"'").test(T), 'signals serialized compactly: '+k+' -> '+short+' (clip 349, cutscene 356, contact 682, objective 692, needItem 706, consume 740, sound 750)'); }
/* build 1406: "all three prop-load sites" became build 1280's ONE apply plus the prefab spawner, and both
   now unpack through the same function the serializer packs with — which is what makes "restored" true for
   every field rather than for the nine somebody remembered. */
assert(/obj\.userData\.signals=p\.sg\.map\(_sigUnpack\)/.test(extractFunction('_applyPropEntry')) &&
       (src.match(/obj\.userData\.signals=p\.sg\.map\(_sigUnpack\)/g)||[]).length === 2,
  'restored at every prop-load site (clip + cutscene + contact + objective + needItem + consume + sound)');

// --- editor + level check ---
assert(/edFold\(behaveHost, 'signals', 'Signals', false, 'Tag this prop/.test(src), 'Signals fold in the inspector (title + subtitle, build 362)');
assert(/\[\['destroyed','On destroyed'\],\['damaged','On hit'\],\['interacted','On E'\],\['contact','On object placed'\]\]/.test(src) && /\[\['toggle','Toggle'\],\['open','Open'\],\['close','Close'\],\['anim','Play anim'\],\['unlock','Unlock'\],\['win','Win level'\],\['cutscene','Play cutscene'\],\['objective','Set objective'\],\['checkpoint','Set checkpoint'\],\['sound','Play sound'\],\['emit','\\u2192 Logic event'\],\['spawn','Spawn enemies'\]/.test(src), 'when/do dropdowns (incl. Play sound 750; Logic event 1027; the world verbs 1073)');
assert(/A signal targets tag '"\+s\.target\+"', but no prop carries that tag\./.test(extractFunction('levelIssues')), 'Level check flags dangling signal targets');
// --- build 750: "Play sound" signal action (light switch / button click) ---
assert(/if\(s\.do==='sound'\)\{ if\(s\.sound && typeof playSample==='function'\)\{ if\(!playSample\(s\.sound\) && typeof loadSound==='function'\) loadSound\(s\.sound\); \} return; \}/.test(src), 'a sound signal plays its clip (loads it if not ready), no target needed');
assert(/srow\.appendChild\(_sndRow\('Sound clip', \(\)=>s\.sound\|\|''/.test(src) && /label:'Signal sound'/.test(src), 'the editor exposes a Sound-clip row + Freesound browser for a Play-sound signal');
assert(/function preloadSignalSounds\(\)\{[\s\S]*?if\(s\.do==='sound' && s\.sound\) loadSound\(s\.sound\);/.test(src) && /if\(typeof preloadSignalSounds==='function'\) preloadSignalSounds\(\);/.test(src), 'signal clips are preloaded on deploy (first trigger plays)');
done();
