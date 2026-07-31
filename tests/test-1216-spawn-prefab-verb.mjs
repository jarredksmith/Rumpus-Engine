// build 1216: the logic graph can finally CREATE a prop at runtime — 1170's deferred other half.
//
// The feature-surface critic's HIGH: show/hide/move/destroy existed (1170) but nothing could CREATE — so a
// tycoon's "buy → building appears", a wave-defense buildable turret, a farming drop were all inexpressible;
// every quantity was fixed at author time. `spawnprop <prefab> @place` uses the ready _pfSpawnEntry spawner
// (three consumers already), host-only (updateLogic returns for clients), and needs NO new net code: the
// spawned props carry nids, so the existing prop reconciler pAdds them to every client. A LIVE cap stops a
// spawnprop-on-an-interval from filling the world, and spawned props are marked so they never edit the level.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- _lgSpawnPrefab, executed
function build(over) {
  const propModels = [];
  const spawned = [];
  const failures = [];
  const env = Object.assign({
    NET: { mode: 'host' }, prefabLib: { house: { props: [{ src: 'box', t: [0, 0, 0] }, { src: 'box', t: [1, 0, 0] }] } },
  }, over);
  const body =
    'const LG_SPAWN_CAP = ' + (over.cap != null ? over.cap : 200) + ';\n' +
    'let NET = env.NET, prefabLib = env.prefabLib, propModels = env.propModels;\n' +
    'function _pfNewInst(){ return "i1"; } function _newGroupId(){ return "g1"; }\n' +
    'function _noteLogicFailure(m){ env.failures.push(m); }\n' +
    'function _pfSpawnEntry(p, at, mark, gid, cb){ const o = { userData: {} }; propModels.push(o); env.spawned.push({ p, at, mark, gid }); if(cb) cb(o); }\n' +
    extractFunction('_lgSpawnedCount') + '\n' + extractFunction('_lgSpawnPrefab') + '\n' +
    'return _lgSpawnPrefab;';
  const fn = new Function('env', body)(Object.assign(env, { propModels, spawned, failures }));
  return { fn, propModels, spawned, failures, env };
}

{ // the happy path: a prefab spawns all its props at the place, marked so they never touch the level
  const h = build({});
  h.fn('house', { x: 5, y: 0, z: 5 });
  eq(h.spawned.length, 2, 'both props of the prefab are spawned');
  eq(h.spawned[0].at.x, 5, '...at the requested place');
  assert(h.propModels.every(o => o.userData._lgSpawned), 'every spawned prop is MARKED _lgSpawned so it is never saved into the level (1170\'s rule)');
  eq(h.spawned[0].gid, h.spawned[1].gid, 'the prefab\'s props share one fresh group id');
  eq(h.failures.length, 0, 'no failure on a valid spawn');
}
{ // a missing prefab is reported, not silently ignored (1214's lesson)
  const h = build({});
  h.fn('mansion', { x: 0, y: 0, z: 0 });
  eq(h.spawned.length, 0, 'nothing spawns for an unknown prefab');
  assert(h.failures.length === 1 && /mansion/.test(h.failures[0]), '...and the miss is reported by name');
}
{ // the live cap: it counts props still in the scene, so destroyed ones free budget
  const h = build({ cap: 3 });
  h.fn('house', { x: 0, y: 0, z: 0 });   // 2 props, under the cap of 3
  eq(h.spawned.length, 2, 'the first spawn (2 props) fits under the cap');
  h.fn('house', { x: 1, y: 0, z: 0 });   // would make 4 > 3
  eq(h.spawned.length, 2, 'the second is refused — 2 live + 2 more would exceed the cap of 3');
  assert(h.failures.some(f => /cap/.test(f)), '...and the cap is reported');
  h.propModels.length = 0;               // everything destroyed -> budget frees
  h.fn('house', { x: 2, y: 0, z: 0 });
  eq(h.spawned.length, 4, 'once props are destroyed, the budget frees and spawning resumes (a LIVE cap, not cumulative)');
}
{ // a CLIENT never spawns — the host authors the world, the reconciler syncs
  const h = build({ NET: { mode: 'client' } });
  h.fn('house', { x: 0, y: 0, z: 0 });
  eq(h.spawned.length, 0, 'a client does not spawn (updateLogic already returns for clients; this is belt-and-braces)');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/\['spawnprop','Spawn prefab'\]/.test(src), 'the verb is in the Do-action dropdown');
  assert(/\{k:'prefab',l:'prefab',w:96,listId:'lgPrefabList',ifv:\['verb','spawnprop'\]\}/.test(src),
    'a prefab field appears for the spawnprop verb, with an autocomplete datalist');
  assert(/const pfl=mk\('lgPrefabList'\);/.test(src) && /for\(const nm in prefabLib\)/.test(src),
    'the datalist is populated from the prefab library');
  const wa = extractFunction('_applyWorldAction');
  assert(/if\(s\.do==='spawnprop'\)\{/.test(wa) && /_lgSpawnPrefab\(String\(s\.prefab\|\|''\)\.trim\(\), at\)/.test(wa),
    'the world-action handler dispatches spawnprop through the place resolver');
  assert(/NO _wactSend: the spawned props carry nids, so reconcileProps pAdds them/.test(wa),
    'no wact message — the prop reconciler already syncs nid-bearing props, which is the net-id story 1170 deferred');
  assert(/const at=_lgPlaceAt\(s\.at\); if\(!at\)\{[^}]*_noteLogicFailure/.test(wa),
    'a place that answers nothing is reported, not a spawn at (0,0)');
}

done('build 1216: spawnprop — _lgSpawnPrefab executed proving a prefab spawns all its props at a place (marked so they never edit the level, sharing one group), a missing prefab is reported, the LIVE cap refuses over-budget spawns but frees as props are destroyed, and a client never spawns; the verb + prefab field + datalist are wired and the handler routes through the place resolver with no wact (the reconciler owns the net sync)');
