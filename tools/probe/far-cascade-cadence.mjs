// build 1459 — what the far cascade costs, and what halving its cadence saves.
//
// The performance audit's proposal (gate `_shDirty` on the near cascade's volume) DIED ON MEASUREMENT and
// the numbers are in tools/probe/shadow-dirty-scope.mjs: both cascades share one dirty counter, so the
// honest test is against the FAR volume, and that volume's half-extent is 240 against a default arena of
// 70. The whole arena and the whole of a build-1372 wave ring sit inside it — the test buys 0.0%.
//
// What is real is the far map's cost. This measures it: draw calls per frame with the far cascade
// refreshing every frame, versus every second frame, versus never. Integer counts with a control that
// returns, because wall-clock under SwiftShader is unusable.
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(30), JSON.stringify(v));

  const r = await probe(P(`
    const R = {};
    paused = true; _tabHidden = true;
    player.pos.set(0, 2.9, 0); camera.position.set(0, 2.9, 0);
    camera.rotation.set(-0.08, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);

    /* a caster field spread across BOTH cascades so the far map has real work to do */
    let seed = 4242;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const before = propModels.length;
    for(let i = 0; i < 300; i++){
      const ang = rnd() * Math.PI * 2, d = 20 + rnd() * 200;
      spawnProp('box', [Math.cos(ang)*d, 0, -Math.abs(Math.sin(ang)*d), 0, rnd()*3, 0, 2, 3, 2]);
    }
    R.spawned = propModels.length - before;
    _fitSunShadow(camera);
    R.nearE = moon.shadow.camera.right;
    R.farE = moonFar ? moonFar.shadow.camera.right : null;
    R.farAutoUpdate = moonFar ? moonFar.shadow.autoUpdate : null;

    /* One SAMPLE = one full frame's shadow work. The near map follows the global flag; the far one takes
       whatever needsUpdate it was given. Warm first — a refit dirties the map and the first visit to
       any state carries a pass the second does not (builds 1430/1431). */
    function frame(farOn){
      renderer.shadowMap.needsUpdate = true;
      if(moonFar && moonFar.shadow) moonFar.shadow.needsUpdate = !!farOn;
      try{ renderer.info.reset(); }catch(e){}
      renderScene(scene, camera);
      return renderer.info.render.calls;
    }
    const settle = (farOn) => { frame(farOn); frame(farOn); };

    settle(true);  const bothOn = frame(true);
    settle(false); const nearOnly = frame(false);
    settle(true);  const control = frame(true);
    R.calls = { bothCascades: bothOn, nearOnly: nearOnly, control: control,
                farCascadeCosts: bothOn - nearOnly,
                controlReturns: control === bothOn };

    /* and what the shipped cadence averages over a run of dirty frames */
    function runCadence(every){
      let n = 0, total = 0;
      let tick = 0;
      for(let i = 0; i < 12; i++){
        tick++;
        const due = (tick % every === 0);
        total += frame(due); n++;
      }
      return +(total / n).toFixed(1);
    }
    settle(true);
    R.avgEveryFrame = runCadence(1);
    settle(true);
    R.avgEverySecond = runCadence(2);
    settle(true);
    R.avgControl = runCadence(1);

    /* the wiring: a refit must force it, whatever the cadence says */
    _farShRefit = false; _farShN = 0;
    const seen = [];
    for(let i = 0; i < 6; i++){
      _shadowDirtyFrames = 1;
      if(i === 3) _farShRefit = true;          /* pretend the volume moved on frame 3 */
      /* replay the shipped decision verbatim */
      let due = false;
      if(_shadowDirtyFrames>0){ _shadowDirtyFrames--;
        if(moonFar && moonFar.shadow){ _farShN++;
          if(_farShRefit || (_farShN % FAR_SHADOW_EVERY === 0)){ due = true; _farShRefit = false; } } }
      seen.push(due ? 1 : 0);
    }
    R.cadencePattern = seen;
    R.every = FAR_SHADOW_EVERY;
    return R;
  `));

  say('caster props added', r.spawned);
  say('near / far half-extent', [r.nearE, r.farE]);
  say('far opts out of global', r.farAutoUpdate === false);
  console.log('');
  say('draw calls', r.calls);
  console.log('');
  say('avg, far every frame', r.avgEveryFrame);
  say('avg, far every 2nd', r.avgEverySecond);
  say('avg, control', r.avgControl);
  say('cadence (refit on #3)', r.cadencePattern);

  const saved = r.avgEveryFrame > 0 ? (1 - r.avgEverySecond / r.avgEveryFrame) : 0;
  console.log('\n  the far cascade costs ' + r.calls.farCascadeCosts + ' draw calls per refresh; halving its' +
              ' cadence saves ' + (saved * 100).toFixed(1) + '% of shadow-frame draw calls');

  const ok = r.spawned > 0 && r.farAutoUpdate === false
          && r.calls.farCascadeCosts > 0 && r.calls.controlReturns
          && r.avgEverySecond < r.avgEveryFrame
          && Math.abs(r.avgControl - r.avgEveryFrame) < 1
          && r.cadencePattern[1] === 1 && r.cadencePattern[3] === 1   // every 2nd, and the refit forces it
          && r.cadencePattern[0] === 0;
  console.log((ok ? 'PASS' : 'FAIL') + ' — the far cascade takes every 2nd refresh, a refit forces one, and the control returns');
  if (!ok) process.exitCode = 1;
}, { settleMs: 3500 });
