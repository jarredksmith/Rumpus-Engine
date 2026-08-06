// build 1410 — the camera bank, in the live game.
//
// test-1410 drives the functions in isolation; this drives the WIRING: a real signal firing the real
// `view` verb at three real props, and the real frame loop moving the real camera between them.
//
// TWO INSTRUMENT NOTES, both of which produced a confident wrong reading first:
//
// 1. The dwell runs on `performance.now()` — the same clock tpCameraPushback's damping uses, because a
//    security camera cuts on seconds and not on frames. `__drive` VIRTUALISES that clock (drive.mjs
//    installs a pure counter and restores the real one on the way out), so sleeping in Node advances a
//    clock the engine is not reading, and the sampling has to be drive FRAMES. The sleep version of this
//    probe saw exactly ONE camera and read like a bank that never cuts.
// 2. And the drives must be ONE eval. Between `probe()` calls the real clock is back, ~1e5 ms behind the
//    virtual one, so the next drive's first frame looks like a 100-second gap and trips the pause re-base
//    — which is the re-base working, and it throws away the whole cycle's progress every sample.
//
// The sample stride is deliberately NOT a divisor of the dwell: the first version sampled every 500 ms on
// a 2 s dwell, so every cut landed on the exact boundary frame and float drift in `__vnow += (1/60)*1000`
// decided whether the last one fired. It measured 2 cameras out of 3 and looked like a wrapping bug.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(DRIVE_RIG + `
  (function(){
    const R = {};
    __ungate();
    gameCfg.objective = 'puzzle';   // waves stand down (build 1372's own probe rule)
    __wavesOff();
    __clearEnemies();

    // three camera props, well away from the stock level's own geometry
    const made = [];
    function cam(tag, x, z){
      let o = null; spawnProp('box',[x, 6, z, 0,0,0, 0.4,0.4,0.8],(b)=>{o=b;});
      if(!o) throw new Error('spawnProp did not build synchronously');
      o.userData.tag = tag; made.push(o); return o;
    }
    const c1 = cam('seccam', 30, -30), c2 = cam('seccam', -30, -30), c3 = cam('seccam', 0, 40);
    const decoy = cam('door', 55, 55);

    R.mounts   = _viewMountsFor('seccam').length;
    R.decoyOut = _viewMountsFor('seccam').indexOf(decoy) < 0;

    // arm through the REAL verb, not through _setViewOverride
    _applySignalAction({ do:'view', vmode:'fixed', vtag:'seccam', vtrack:1, vdwell:'1' }, null);
    R.armed = !!(_viewOv && _viewOv.m === 'fixed');
    R.dwell = _viewOv && _viewOv.dwell;
    R.view  = _viewNow();
    R.vcam  = _vcamMode();       // the orbit framing must decline it (build 1404)

    // --- 20 samples x 20 frames = ~6.7 s of engine time at a 1 s dwell: two full cycles ---
    const seen = [];
    __drive(2, 1/60);
    for(let i=0;i<20;i++){ __drive(20, 1/60); seen.push([Math.round(camera.position.x), Math.round(camera.position.z)]); }
    R.seen = seen.map(p=>p.join(','));
    R.distinct = [...new Set(R.seen)];
    R.everyOnAMount = seen.every(p =>
      made.some(m => Math.round(m.position.x)===p[0] && Math.round(m.position.z)===p[1]));
    // a cut is a CUT: consecutive samples are either identical or a whole camera apart
    R.noInBetween = seen.every(p => made.some(m =>
      Math.abs(m.position.x-p[0])<1 && Math.abs(m.position.z-p[1])<1));
    // and the order is the bank's order, wrapping
    R.order = R.distinct.join(' | ');

    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    const toP = new THREE.Vector3(player.pos.x - camera.position.x, 0, player.pos.z - camera.position.z).normalize();
    R.aimDot = +(d.x*toP.x + d.z*toP.z).toFixed(3);

    // --- a destroyed camera leaves the bank ------------------------------------------
    const i1 = propModels.indexOf(c1); if(i1>=0) removeProp(i1);
    __drive(2, 1/60);
    R.afterKill = _viewMountsFor('seccam').length;
    const seen2 = [];
    for(let i=0;i<12;i++){ __drive(20, 1/60); seen2.push([Math.round(camera.position.x), Math.round(camera.position.z)].join(',')); }
    R.deadNeverShown = seen2.indexOf('30,-30') < 0;
    R.stillCycles = new Set(seen2).size === 2;

    // --- back to normal ---------------------------------------------------------------
    _applySignalAction({ do:'view', vmode:'normal' }, null);
    __drive(2, 1/60);
    R.cleared  = _viewOv === null;
    R.viewBack = _viewNow();

    for(const o of made){ const i = propModels.indexOf(o); if(i>=0) removeProp(i); }
    R.leftOver = _viewMountsFor('seccam').length + _viewMountsFor('door').length;
    __release();
    return R;
  })()`);

  P(r.mounts === 3, 'three props under one tag are three cameras', r.mounts);
  P(r.decoyOut, 'a prop carrying another tag is not in the bank');
  P(r.armed, 'the real signal verb arms the bank');
  P(r.dwell === 1, 'the authored dwell reaches the override', r.dwell);
  P(r.view === 'fixed', 'the engine asks for the fixed camera', r.view);
  P(r.vcam === '', 'the orbit framing declines it, so the mount is the only thing placing the camera', r.vcam);
  P(r.everyOnAMount, 'every sampled frame has the camera EXACTLY on a mount — it cuts, never slides');
  P(r.noInBetween, '...with no sample anywhere between two mounts');
  P(r.distinct.length === 3, 'over ~6.7 s at a 1 s dwell it visits all three and wraps', r.order);
  P(r.aimDot > 0.98, 'it looks at the player from wherever it is standing', r.aimDot);
  P(r.afterKill === 2, 'a destroyed camera leaves the bank', r.afterKill);
  P(r.deadNeverShown, '...and the cycle never returns to it');
  P(r.stillCycles, '...while the surviving two keep cutting');
  P(r.cleared, '"back to normal" drops the override');
  P(r.viewBack === 'fps', '...and the level plays its own view again', r.viewBack);
  P(r.leftOver === 0, 'teardown removed every fixture', r.leftOver);
}, { settleMs: 2500 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
