import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 317: no capsule->model pop in multiplayer

// (a) in-flight dedup on the GLB loader
assert(/const _glbWaiters = \{\}/.test(src), 'in-flight waiter map exists');
const lg = extractFunction('loadGLTFCached');
assert(/if\(_glbWaiters\[url\]\)\{ _glbWaiters\[url\]\.push/.test(lg), 'duplicate requests ride the in-flight load');
assert(/const waiters=\[\{cb:cb,errcb:errcb\}\]; _glbWaiters\[url\]=waiters/.test(lg), 'first caller registers the waiter list');
assert(/delete _glbWaiters\[url\]/.test(lg), 'waiter list cleared when the load settles');
assert(/for\(const w of waiters\)\{[^}]*w\.cb && w\.cb\(g\)/.test(lg), 'success fans out to every waiter');
assert(/for\(const w of waiters\)\{ try\{ w\.errcb && w\.errcb\(e\)/.test(lg), 'error fans out to every waiter');
// pending counter still drives the loader, decremented once per url (not per waiter)
assert((lg.match(/_glbPending\+\+/g)||[]).length===1, '_glbPending incremented once per url');

// (b) prewarm known players' models at the start gate
const pw = extractFunction('_prewarmMatchModels');
assert(/\(NET\.mode==='host'\|\|NET\.mode==='client'\) && NET\.charById/.test(pw), 'remote characters gated to multiplayer (build 330: local char now prewarms in solo too)');
assert(/for\(const id in NET\.charById\)/.test(pw), 'prewarms every known player character');
assert(/loadGLTFCached\(u, \(\)=>\{\}, \(\)=>\{\}\)/.test(pw), 'kicks off the model load (counts toward the loader)');

// (c) startGame calls the prewarm BEFORE the asset gate
const sg = extractFunction('startGame');
const pi = sg.indexOf('_prewarmMatchModels()');
const gi = sg.indexOf('_levelAssetsPending()){ showLevelLoader()');
assert(pi>=0 && gi>=0 && pi<gi, 'prewarm runs before the loader gate');
// build 576: model cache eviction by reference count + LRU. Model the policy and check it frees only safe entries.
{
  const gltfCache={}, _modelRefs={}, _modelUsedAt={}; let _modelClock=0; const CAP=3; const disposed=[];
  const touch=u=>{ _modelRefs[u]=(_modelRefs[u]||0)+1; _modelUsedAt[u]=++_modelClock; };
  const release=u=>{ if(_modelRefs[u]!=null) _modelRefs[u]=Math.max(0,_modelRefs[u]-1); };
  const enforce=()=>{ const urls=Object.keys(gltfCache); if(urls.length<=CAP) return; let over=urls.length-CAP;
    const ev=urls.filter(u=>(_modelRefs[u]||0)<=0).sort((a,b)=>(_modelUsedAt[a]||0)-(_modelUsedAt[b]||0));
    for(const u of ev){ if(over<=0) break; disposed.push(u); delete gltfCache[u]; delete _modelRefs[u]; delete _modelUsedAt[u]; over--; } };
  const load=u=>{ if(!gltfCache[u]) gltfCache[u]={scene:{traverse(){}}}; touch(u); enforce(); };

  load('weapon');                 // persistent: loaded once, never released -> pinned
  load('A'); load('B'); load('C');// three props
  release('A'); release('B'); release('C');   // their instances removed (e.g. wipe)
  enforce();                                    // wipeScene enforces the cap after removing props
  assert(disposed.length>=1, 'cache over cap evicts something');
  assert(disposed.indexOf('weapon')<0, 'the pinned persistent model is never evicted (still referenced)');
  assert(!!gltfCache['weapon'], 'weapon model stays cached');
  // re-loading a still-cached prop bumps its recency so it survives the next squeeze
  if(gltfCache['C']) touch('C');
  load('D'); load('E');
  assert(_modelRefs['weapon']>=1, 'weapon keeps a positive refcount across churn');
  assert(Object.keys(gltfCache).length<=CAP+1, 'cache size stays bounded near the cap');
}
// wiring
assert(/_modelTouch\(url\)/.test(gameSource()), 'every cache resolve touches the refcount');
assert(/function _disposeGLTF\(gltf\)/.test(gameSource()) && /geos\.forEach\(g=>\{ if\(g\.dispose\)/.test(gameSource()), 'eviction disposes geometry/material/textures');
assert(/_modelRelease\(obj\.userData\.src\)/.test(gameSource()), 'removeProp releases the model reference');
assert(/_enforceModelCacheCap\(\)/.test(extractFunction('_wipeSceneCore')), 'wipe frees unreferenced model VRAM');   // build 879: body moved to _wipeSceneCore (wipeScene = snapshot + core)
done();
