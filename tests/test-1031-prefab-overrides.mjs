// (build 1031) PREFAB UPDATES + LOCAL OVERRIDES — edit any instance, press Update, every other
// copy in the level follows EXCEPT the parts an author deliberately changed on a given copy.
// The override diff runs in pivot-relative space, and each instance's pivot is recovered by
// majority VOTE (every unmoved prop votes for where the pivot must be) — so moving a WHOLE
// instance never reads as overriding all of its parts.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

function makeEnv(){
  const world = { undo:0, spawned:[], removed:0 };
  const glue = `
    let prefabLib={}; let _pfInstSeq=1; let propModels=[]; let _levelDirty=false; let _gidSeq=0;
    const pushUndoSnapshot=()=>{ HOOK.undo++; };
    const _newGroupId=()=>('g'+(++_gidSeq));
    const propEntry=(o)=>JSON.parse(JSON.stringify(o.__entry));
    const localStorage={ setItem:()=>{}, getItem:()=>null };
    const removeProp=(i)=>{ HOOK.removed++; propModels.splice(i,1); };
    const spawnProp=(src2, t, cb)=>{ const obj={ userData:{}, __src:src2, __entry:{ src:src2, t:t.slice() }, __t:t.slice() }; propModels.push(obj); HOOK.spawned.push(obj); cb(obj); };
    const applyPropDynState=()=>{}, xaApply=()=>{}, jointApply=()=>{}, vehicleApply=()=>{}, trackApply=()=>{};
    const flashToast=()=>{};
  `;
  const fns = ['_pfSaveLib','_pfNewInst','_pfEntryOf','_pfPivotOf','_pfSpawnEntry','_pfInstances',
               '_pfInstancePivot','_pfIsOverridden','_pfApplyDefToInstance','_pfUpdateFrom','_pfDetach']
    .map(f=>extractFunction(f, src)).join('\n');
  const env = new Function('HOOK', glue + fns + `
    return {
      lib:()=>prefabLib, setLib:(l)=>{ prefabLib=l; }, props:()=>propModels,
      addProp:(entry, pf, gid)=>{ const o={ userData:{ pf:pf?Object.assign({},pf):undefined, groupId:gid }, __entry:entry }; propModels.push(o); return o; },
      instances:_pfInstances, pivotOf:_pfInstancePivot, update:_pfUpdateFrom, apply:_pfApplyDefToInstance, detach:_pfDetach,
    };`)(world);
  return { env, world };
}
const E = (x,y,z,extra)=>Object.assign({ src:'box', t:[x,y,z, 0,0,0, 1,1,1] }, extra||{});
const DEF = (entries)=>({ name:'Door', props:entries, rev:0 });
const D0 = [ E(0,0,0,{ tg:'frame' }), E(2,0,0,{ tg:'panel' }) ];   // definition: frame at pivot, panel +2x

{ // an untouched instance follows the update completely
  const { env, world } = makeEnv();
  env.setLib({ Door: DEF(JSON.parse(JSON.stringify(D0))) });
  env.addProp(E(50,0,20,{ tg:'frame' }), { id:'Door', inst:'iA', slot:0 }, 'g1');
  env.addProp(E(52,0,20,{ tg:'panel' }), { id:'Door', inst:'iA', slot:1 }, 'g1');
  const NEW = DEF([ E(0,0,0,{ tg:'frame' }), E(3,0,0,{ tg:'panel' }) ]); NEW.rev=1;   // panel moved out to +3x
  const r = env.apply('Door', 'iA', env.lib().Door, NEW);
  eq(r.updated, 2, 'both slots refreshed');
  eq(r.kept, 0, 'nothing was overridden');
  eq(world.spawned[1].__t.slice(0,3).join(','), '53,0,20', 'the panel landed at the NEW +3x offset, at the instance’s own pivot');
}
{ // a WHOLE-instance move is not an override (the pivot vote)
  const { env } = makeEnv();
  env.setLib({ Door: DEF(JSON.parse(JSON.stringify(D0))) });
  const a=env.addProp(E(-7,0,90,{ tg:'frame' }), { id:'Door', inst:'iB', slot:0 }, 'g1');
  env.addProp(E(-5,0,90,{ tg:'panel' }), { id:'Door', inst:'iB', slot:1 }, 'g1');
  const piv = env.pivotOf([a, env.props()[1]], env.lib().Door);
  eq([piv.x,piv.y,piv.z].join(','), '-7,0,90', 'both props vote the same pivot — the instance was moved as one');
  const r = env.apply('Door', 'iB', env.lib().Door, DEF([ E(0,0,0,{ tg:'frame' }), E(2,1,0,{ tg:'panel' }) ]));
  eq(r.kept, 0, 'a moved instance still updates fully — no false overrides');
}
{ // a locally-moved PART is preserved; its sibling still updates
  const { env, world } = makeEnv();
  env.setLib({ Door: DEF(JSON.parse(JSON.stringify(D0))) });
  env.addProp(E(10,0,0,{ tg:'frame' }), { id:'Door', inst:'iC', slot:0 }, 'g1');
  const panel=env.addProp(E(12,5,0,{ tg:'panel' }), { id:'Door', inst:'iC', slot:1 }, 'g1');   // author raised THIS panel 5m
  const r = env.apply('Door', 'iC', env.lib().Door, DEF([ E(0,0,0,{ tg:'frame', snd:3 }), E(2,0,0,{ tg:'panel' }) ]));
  eq(r.kept, 1, 'the raised panel is a local override — kept');
  eq(r.updated, 1, 'the frame still took the update (its new config arrived)');
  assert(env.props().includes(panel), 'the overridden prop object is untouched');
  eq(world.spawned.length, 1, 'only the frame respawned');
}
{ // a config-only change (a tag) is an override too — transforms are not the only thing authors touch
  const { env } = makeEnv();
  env.setLib({ Door: DEF(JSON.parse(JSON.stringify(D0))) });
  env.addProp(E(0,0,0,{ tg:'frame' }), { id:'Door', inst:'iD', slot:0 }, 'g1');
  env.addProp(E(2,0,0,{ tg:'renamedPanel' }), { id:'Door', inst:'iD', slot:1 }, 'g1');   // retagged locally
  const r = env.apply('Door', 'iD', env.lib().Door, DEF([ E(0,0,0,{ tg:'frame' }), E(2,0,0,{ tg:'panel' }) ]));
  eq(r.kept, 1, 'a retagged part is preserved');
}
{ // update-from-instance: new parts join the definition; other instances gain them; removed overrides detach
  const { env, world } = makeEnv();
  env.setLib({ Door: DEF(JSON.parse(JSON.stringify(D0))) });
  // source instance iS: author added a LAMP to the group (no pf mark yet)
  const s0=env.addProp(E(0,0,0,{ tg:'frame' }), { id:'Door', inst:'iS', slot:0 }, 'gS');
  env.addProp(E(2,0,0,{ tg:'panel' }), { id:'Door', inst:'iS', slot:1 }, 'gS');
  env.addProp(E(1,3,0,{ tg:'lamp' }), null, 'gS');
  // a second, untouched instance
  env.addProp(E(40,0,0,{ tg:'frame' }), { id:'Door', inst:'iT', slot:0 }, 'gT');
  env.addProp(E(42,0,0,{ tg:'panel' }), { id:'Door', inst:'iT', slot:1 }, 'gT');
  const r = env.update(s0);
  eq(r.ok, true, 'update succeeds');
  eq(env.lib().Door.props.length, 3, 'the lamp joined the definition');
  eq(env.lib().Door.rev, 1, 'revision bumped');
  eq(r.others, 1, 'one other instance followed');
  const iT=env.instances('Door').iT;
  eq(iT.length, 3, 'the other instance grew the lamp');
  assert(iT.some(o=>o.__t && o.__t[1]===3), 'at its authored height');
  eq(r.kept, 0, 'nothing to preserve there');
}
{ // detach: the instance becomes plain props, untouched by future updates
  const { env } = makeEnv();
  env.setLib({ Door: DEF(JSON.parse(JSON.stringify(D0))) });
  const a=env.addProp(E(0,0,0,{ tg:'frame' }), { id:'Door', inst:'iE', slot:0 }, 'g1');
  env.addProp(E(2,0,0,{ tg:'panel' }), { id:'Door', inst:'iE', slot:1 }, 'g1');
  eq(env.detach(a), true, 'detach succeeds');
  eq(Object.keys(env.instances('Door')).length, 0, 'no tracked instances remain');
  eq(env.props().length, 2, 'the props themselves stay');
}

// ---- panel wiring ----
assert(/up\.textContent='Update';/.test(src) && /_pfUpdateFrom\(selProps\[0\]\)/.test(src), 'Update-from-selection on the panel');
assert(/dt\.textContent='Detach';/.test(src) && /_pfDetach\(selProps\[0\]\)/.test(src), 'Detach on the panel');
assert(/local override'\+\(r\.kept===1\?'':'s'\)\+' kept'/.test(src), 'the toast reports how many overrides were preserved');
assert(/else delete cur\.userData\.pf;/.test(extractFunction('_pfApplyDefToInstance', src)),
  'an overridden prop whose slot was deleted DETACHES instead of vanishing (author work is never destroyed)');

done('build 1031: prefab updates flow to every instance — local overrides preserved, pivot recovered by vote');
