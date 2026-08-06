// build 1422 — can a STATIC shootable target be a Destroy-mission objective?
//
// `_setupDestroyTargets` walks `dynamicProps`. Build 1390 made a target static and bolted down, build 1398
// taught the loader to restore its `objective` flag, and the editor offers the checkbox on it — so the flag
// is authored, saved and restored, and the mission that consumes it never sees the prop.
//
// That is build 1392's defect for the FIFTH time (the bullet walk, the turret walk, the melee block, then
// 1395's flash decay). The control is a DYNAMIC objective crate beside the static one: a run where neither
// is counted is the instrument, and a run where only the static one is missed is the defect.
import { withGame } from './driver.mjs';

const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });

await withGame(async (P) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    const cands = propModels.filter(p => p && p.userData && !p.userData.runtime && !p.userData.phys);
    // a STATIC bolted-down plate, marked as an objective — exactly what the editor lets you author
    const plate = cands.shift();
    plate.userData._role = 'plate';
    plate.scale.set(1,1,1); plate.position.set(0, 1, 32);
    plate.userData.shootable = true; plate.userData.breakable = true;
    plate.userData.objective = true;
    plate.userData.maxHp = 30; plate.userData.hp = 30;
    delete plate.userData._shattered; delete plate.userData._destroyed;

    // ...and a DYNAMIC objective crate as the control, which has always worked
    const crate = cands.shift();
    crate.userData._role = 'crate';
    crate.scale.set(1,1,1); crate.position.set(6, 1, 32);
    setPropDynamic(crate, true);
    crate.userData.objective = true; crate.userData.breakable = true;
    crate.userData.maxHp = 30; crate.userData.hp = 30;
    delete crate.userData._shattered; delete crate.userData._destroyed;

    // and a third: an objective that CANNOT be destroyed. Counting it makes the mission unwinnable.
    const wall = cands.shift();
    wall.userData._role = 'wall';
    wall.scale.set(1,1,1); wall.position.set(-6, 1, 32);
    wall.userData.shootable = true; wall.userData.breakable = false;
    wall.userData.objective = true;
    delete wall.userData._shattered; delete wall.userData._destroyed;

    gameCfg.objective = 'destroy';
    return { plateStatic: !plate.userData.phys, crateDynamic: !!crate.userData.phys,
             inDynamicProps: { plate: dynamicProps.indexOf(plate)>=0, crate: dynamicProps.indexOf(crate)>=0 } };
  })()`)));

  const setup = () => P(`(function(){
    _setupDestroyTargets();
    const roles = _destroyMarkers.map(m => m.userData.prop.userData._role).sort();
    return { total: _destroyTotal, remain: _destroyRemain, tracked: roles.join(',') };
  })()`);

  const r = await setup();
  console.log('\n_setupDestroyTargets  ', JSON.stringify(r));

  P_(r.tracked.split(',').indexOf('crate') >= 0, 'CONTROL: the dynamic objective crate is tracked', r.tracked);
  P_(r.tracked.split(',').indexOf('plate') >= 0,
    'the STATIC objective target is tracked too — it is authored, saved and restored, so the mission must see it',
    r.tracked);
  // NOTE, because this row was GREEN BEFORE THE FIX and meant nothing: the wall is static, so the old
  // `dynamicProps` walk excluded it for a reason that had nothing to do with `breakable`. A green check on
  // a fixture the code rejects for an unrelated reason is not evidence — only the control moving beside it
  // distinguished them. After the fix it passes for the intended reason.
  P_(r.tracked.split(',').indexOf('wall') < 0,
    'an UNBREAKABLE objective is NOT tracked: it can never be destroyed, so counting it makes the mission unwinnable',
    r.tracked);
  P_(r.total === 2, 'so the mission counts exactly the two that can actually be finished', r.total);

  // ...and destroying them really does complete it
  const done = await P(`(function(){
    for(const role of ['plate','crate']){
      const o = propModels.find(x=>x&&x.userData&&x.userData._role===role);
      damageProp(o, 999, o.position.clone(), new THREE.Vector3(0,0,-1), 1, null);
    }
    objectiveTick(0.016);
    return { total: _destroyTotal, remain: _destroyRemain, markers: _destroyMarkers.length };
  })()`);
  console.log('both destroyed        ', JSON.stringify(done));
  P_(done.remain === 0, 'destroying both finishes the mission', done.remain);

  // the HUD line a creator reads when they get this wrong
  const hud = await P(`(function(){
    const only = propModels.filter(o=>o&&o.userData&&o.userData.objective);
    return { objectives: only.length, total: _destroyTotal }; })()`);
  console.log('objective props       ', JSON.stringify(hud));
}, { settleMs: 4000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
