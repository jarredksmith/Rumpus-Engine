// (build 1030) PREFABS — a configured selection becomes a reusable component: pivot-relative
// entries carrying EVERYTHING propEntry knows (signals, animations, joints, vehicle tuning,
// locks, dialogue, materials, physics). Instances are pf-marked {id,inst,slot} (serialized) and
// grouped so they move as one. The library persists in localStorage; the defs a level actually
// uses are embedded in the level file, so shared levels bring their prefabs along.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: capture normalization + placement marks, on a stubbed prop world ----
function makeEnv(){
  const world = { props:[], spawned:[], undo:0, store:{} };
  const fakeProp = (id, entry) => ({ userData:{ __id:id }, __entry:entry });
  const glue = `
    let prefabLib={}; let _pfInstSeq=1; let selProps=[]; let propModels=[]; let _levelDirty=false; let _gidSeq=0;
    const pushUndoSnapshot=()=>{ HOOK.undo++; };
    const _newGroupId=()=>('g'+(++_gidSeq));
    const propEntry=(o)=>JSON.parse(JSON.stringify(o.__entry));
    const localStorage={ setItem:(k,v)=>{ HOOK.store[k]=v; }, getItem:(k)=>HOOK.store[k]||null };
    const spawnProp=(src2, t, cb, slot, anim, mat, err, nid, clip)=>{ const obj={ userData:{} , __src:src2, __t:t.slice() }; propModels.push(obj); HOOK.spawned.push(obj); cb(obj); };
    const applyPropDynState=()=>{}, xaApply=()=>{}, jointApply=()=>{}, vehicleApply=()=>{}, trackApply=()=>{};
    const camera={ position:{x:0,y:1.7,z:0}, getWorldDirection:(v)=>{ v.x=0; v.y=0; v.z=-1; return v; } };
    const THREE={ Vector3:function(){ this.x=0; this.y=0; this.z=0; } };
    const flashToast=()=>{};
  `;
  const fns = extractFunction('_pfSaveLib', src) + '\n' + extractFunction('_pfNewInst', src) + '\n'
    + extractFunction('_pfEntryOf', src) + '\n' + extractFunction('_pfPivotOf', src) + '\n'
    + extractFunction('_pfCapture', src) + '\n' + extractFunction('_pfSpawnEntry', src) + '\n'
    + extractFunction('_pfPlace', src) + '\n' + extractFunction('_pfInstances', src) + '\n'
    + extractFunction('_pfUsedDefs', src) + '\n' + extractFunction('_pfMergeDefs', src) + '\n';
  const env = new Function('HOOK', glue + fns + `
    return {
      lib:()=>prefabLib,
      setSel:(l)=>{ selProps=l; propModels=l.slice(); },
      addProp:(o)=>{ propModels.push(o); },
      capture:_pfCapture, place:_pfPlace, instances:_pfInstances, used:_pfUsedDefs, merge:_pfMergeDefs,
      props:()=>propModels,
    };`)(world);
  return { env, world, fakeProp };
}
const E = (x,y,z,extra)=>Object.assign({ src:'box', t:[x,y,z, 0,0,0, 1,1,1] }, extra||{});

{ // capture: pivot-relative, config carried, source becomes instance #1
  const { env, world, fakeProp } = makeEnv();
  const a=fakeProp('a', E(10,0,10, { tg:'doorFrame', nid:'n1', gid:'g9' }));
  const b=fakeProp('b', E(12,2,10, { sg:[{w:'interacted',d:'open',t:'doorFrame'}], nid:'n2' }));
  env.setSel([a,b]);
  const r=env.capture('Door');
  eq(r.ok, true, 'capture succeeds');
  const def=env.lib().Door;
  eq(def.props.length, 2, 'two entries');
  eq(def.props[0].t.slice(0,3).join(','), '-1,0,0', 'x/z pivot at the centroid (11,10), y at the LOWEST prop');
  eq(def.props[1].t.slice(0,3).join(','), '1,2,0', 'the raised part keeps its height above the base');
  assert(!def.props[0].nid && !def.props[0].gid, 'nid/gid stripped — instances get fresh ones');
  eq(def.props[0].tg, 'doorFrame', 'tags survive');
  eq(def.props[1].sg[0].d, 'open', 'signals survive — a configured door stays a DOOR');
  assert(a.userData.pf && a.userData.pf.id==='Door' && a.userData.pf.slot===0, 'the source selection became instance #1');
  eq(a.userData.pf.inst, b.userData.pf.inst, 'one shared instance id');
  assert(world.store['breach_prefabs_v1'], 'library persisted');
  eq(world.undo, 1, 'capture is undoable');
}
{ // place: fresh instance, marks + shared group, pivot lands where asked
  const { env, world, fakeProp } = makeEnv();
  env.setSel([ fakeProp('a', E(0,0,0)), fakeProp('b', E(2,1,0)) ]);
  env.capture('Kit');
  const inst=env.place('Kit', { x:100, y:0, z:50 });
  assert(inst, 'placement returns the new instance id');
  eq(world.spawned.length, 2, 'both parts spawned');
  eq(world.spawned[0].__t.slice(0,3).join(','), '99,0,50', 'entry 0 lands pivot-relative at the target');
  eq(world.spawned[1].__t.slice(0,3).join(','), '101,1,50', 'entry 1 keeps its offset');
  eq(world.spawned[0].userData.pf.slot, 0, 'slot marks');
  eq(world.spawned[0].userData.pf.inst, inst, 'instance mark');
  assert(world.spawned[0].userData.groupId && world.spawned[0].userData.groupId===world.spawned[1].userData.groupId, 'an instance arrives as ONE group');
  const m=env.instances('Kit');
  eq(Object.keys(m).length, 2, 'source + placed = two instances tracked');
}
{ // level embed: only USED defs ride the file; merge never clobbers your own names
  const { env, fakeProp } = makeEnv();
  env.setSel([ fakeProp('a', E(0,0,0)) ]);
  env.capture('Used');
  env.lib().Unused={ name:'Unused', props:[E(0,0,0)], rev:0 };
  const used=env.used();
  assert(used && used.Used && !used.Unused, 'only instantiated prefabs are embedded');
  env.merge({ Used:{ name:'Used', props:[E(9,9,9), E(1,1,1)], rev:5 }, Fresh:{ name:'Fresh', props:[E(0,0,0)], rev:0 } });
  eq(env.lib().Used.props.length, 1, 'a level def never clobbers your library’s name');
  assert(env.lib().Fresh, 'unknown defs join the library');
  eq(env.merge('junk'), undefined, 'garbage merges are ignored');
}

// ---- serialization + wiring pins ----
assert(/if\(o\.userData\.pf && o\.userData\.pf\.id\) e\.pf=\{ id:String\(o\.userData\.pf\.id\), inst:String\(o\.userData\.pf\.inst\|\|'i0'\), slot:o\.userData\.pf\.slot\|0 \};/.test(src),
  'pf marks ride propEntry (level saves, share codes, lobby transfers)');
eq(src.split("if(p.pf && p.pf.id){ obj.userData.pf={ id:String(p.pf.id), inst:String(p.pf.inst||'i0'), slot:p.pf.slot|0 }; }").length - 1, 3,
  'all three level loaders restore the marks');
assert(/prefabDefs: _pfUsedDefs\(\),/.test(src), 'used defs are embedded in the level file');
eq(src.split('if(level.prefabDefs && typeof _pfMergeDefs===\'function\') _pfMergeDefs(level.prefabDefs);').length - 1, 2,
  'both level-load sites merge the embedded defs');
assert(/if\(savedLevel && savedLevel\.prefabDefs\)\{ try\{ _pfMergeDefs\(savedLevel\.prefabDefs\); \}catch\(e\)\{\} \}/.test(src), 'boot merges too');
assert(/\+ sec\('Prefabs', 'prefabs', '<div id="edPrefabs"><\/div>'\)/.test(src) && /build:\s*\['gizmo','object','material','transform','prefabs'\]/.test(src),
  'the Prefabs section lives on the Build tab');
assert(/renderPrefabsPanel==='function'\) renderPrefabsPanel\(\);/.test(src), 'the panel renders with the editor');

done('build 1030: prefabs — full-config capture, pivot-relative placement, marks + library + level embed');
