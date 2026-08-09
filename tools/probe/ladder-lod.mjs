// build 1457 — the adaptive ladder buys back DRAW CALLS.
//
// The unit test drives the threshold. It cannot show what the threshold is worth, and the whole claim of
// this build is a number: build 1270 measured 844 -> 574 draw calls (-32%) with culling at 2 px, and
// until now the ladder could not reach that lever at all.
//
// Traps this rig is built around, all recorded in CLAUDE.md:
//   - the shadow-map dirty flag is a COUNTER, and a refit dirties it, so the FIRST visit to any pose
//     carries a pass the second does not (builds 1430, 1431). Every pose is warmed before it is read.
//   - `renderer.info.autoReset` is false and one frame makes many render() calls (build 1122), so the
//     count is reset once per sample and read once per sample.
//   - `_lodTick` examines LOD_BUDGET (128) props per frame on a rolling cursor, so a 600-prop level
//     needs several ticks to sweep. It is ticked to convergence, not once.
//   - wall-clock is unusable here (SwiftShader), so every figure is an integer count with a control.
import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(26), JSON.stringify(v));

  const r = await probe(`(function(){
    const R = { rows: [] };
    paused = true; _tabHidden = true;
    /* the props go FAR from the player: LOD_NEAR_KEEP is 40 m and nothing inside it may ever be culled,
       which is the point of check 4 below rather than something to engineer around here. */
    player.pos.set(0, 2.9, 0); camera.position.set(0, 2.9, 0);
    camera.rotation.set(-0.05, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);

    const shapes = ['box','cylinder','cone','sphere','wedge','stairs','pillar','torus'];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const made = [];
    R._before = propModels.length;
    for(let i = 0; i < 600; i++){
      const s = shapes[i % shapes.length];
      const ang = rnd() * Math.PI * 2, dist = 60 + rnd() * 380;
      const sc = 0.5 + rnd() * 1.5;
      const o = spawnProp(s, [Math.cos(ang)*dist, 0, -Math.abs(Math.sin(ang)*dist) - 60,
                              0, rnd()*3, 0, sc, sc, sc]);
      if(o) made.push(o);
    }
    /* spawnProp returns nothing (like spawnEnemy — CLAUDE.md records that trap), so count the delta */
    R.spawned = propModels.length - R._before;
    R.props = propModels.length;

    function sweep(){                      /* LOD_BUDGET is 128/frame on a rolling cursor */
      for(let i = 0; i < 12; i++) _lodTick();
    }
    function sample(){
      try{ renderer.info.reset(); }catch(e){}
      renderer.shadowMap.needsUpdate = true;
      renderScene(scene, camera);
      const i = renderer.info.render;
      let culled = 0;
      for(const o of propModels){ if(o && o.userData && o.userData._lodCull) culled++; }
      return { calls: i.calls, tris: i.triangles, culled: culled, px: _lodPxNow() };
    }
    function atRung(n){
      _adaptOn = true; _prStepI = n;
      sweep();
      sample();                            /* WARM: the first render at a new state carries a shadow pass */
      sweep();
      const a = sample();
      return { rung: n, px: a.px, calls: a.calls, tris: a.tris, culled: a.culled };
    }

    for(const n of [0, 1, 2, 3]) R.rows.push(atRung(n));
    R.control = atRung(0);                 /* back to the top: everything must return */

    /* THE ISOLATION. Rung 0 -> 1 already drops draw calls with px 0 and nothing culled, because SSR
       sheds at rung 1 and its G-buffer is a FULL SCENE PASS - that is pre-existing behaviour, not this
       build, and quoting the whole top-to-bottom delta as this build's would be dishonest. So: same rung,
       same post pipeline, same everything, and ONLY the floor changes. _LADDER_LOD_PX is a const binding
       holding a MUTABLE array, which is what makes the A/B possible without a second build. */
    _adaptOn = true; _prStepI = 3;
    const keep3 = _LADDER_LOD_PX[3];
    _LADDER_LOD_PX[3] = 0; sweep(); sample(); sweep();
    const without = sample();
    _LADDER_LOD_PX[3] = keep3; sweep(); sample(); sweep();
    const withFloor = sample();
    _LADDER_LOD_PX[3] = 0; sweep(); sample(); sweep();
    const backAgain = sample();
    _LADDER_LOD_PX[3] = keep3;
    R.isolate = { without: { px: without.px, calls: without.calls, culled: without.culled },
                  withFloor: { px: withFloor.px, calls: withFloor.calls, culled: withFloor.culled },
                  control: { px: backAgain.px, calls: backAgain.calls, culled: backAgain.culled } };

    /* adaptive OFF at the bottom rung: "off" is a promise of full quality (build 1342) */
    _adaptOn = false; _prStepI = 3; sweep(); sample(); sweep();
    const off = sample();
    R.adaptOff = { px: off.px, calls: off.calls, culled: off.culled };

    /* nothing within LOD_NEAR_KEEP may vanish, at the worst rung, ever */
    _adaptOn = true; _prStepI = 3; sweep(); sweep();
    let nearTotal = 0, nearCulled = 0;
    for(const o of propModels){
      if(!o || !o.userData) continue;
      const d = Math.hypot(o.position.x - player.pos.x, o.position.z - player.pos.z);
      if(d < LOD_NEAR_KEEP){ nearTotal++; if(o.userData._lodCull) nearCulled++; }
    }
    R.near = { within40m: nearTotal, ofThoseCulled: nearCulled, keep: LOD_NEAR_KEEP };

    /* the editor must never cull, whatever the rung says */
    editorOpen = true; sweep(); sweep();
    let edCulled = 0;
    for(const o of propModels){ if(o && o.userData && o.userData._lodCull) edCulled++; }
    R.editor = { rung: _prStepI, threshold: _lodPxNow(), culled: edCulled };
    editorOpen = false;

    _adaptOn = true; _prStepI = 0; sweep();
    return R;
  })()`);

  say('props in the level', { spawned: r.spawned, total: r.props });
  console.log('\n  rung   px   draw calls    triangles   props culled');
  for (const row of r.rows)
    console.log('  ' + String(row.rung).padEnd(6) + String(row.px).padEnd(5) +
                String(row.calls).padEnd(14) + String(row.tris).padEnd(13) + row.culled);
  console.log('  ctrl   ' + String(r.control.px).padEnd(5) + String(r.control.calls).padEnd(14) +
              String(r.control.tris).padEnd(13) + r.control.culled + '   <- returns');
  console.log('');
  console.log('\n  ISOLATED at rung 3 — same rung, same post pipeline, only the floor changes:');
  for (const [k, v] of Object.entries(r.isolate))
    console.log('   ' + k.padEnd(12) + 'px ' + String(v.px).padEnd(4) + String(v.calls).padEnd(8) + 'calls   ' + v.culled + ' culled');
  const iso = r.isolate.without.calls > 0 ? (1 - r.isolate.withFloor.calls / r.isolate.without.calls) : 0;
  console.log('   -> this build is worth ' + (iso * 100).toFixed(1) + '% of draw calls at the bottom rung\n');
  say('adaptive OFF at rung 3', r.adaptOff);
  say('within LOD_NEAR_KEEP', r.near);
  say('editor at rung 3', r.editor);

  const base = r.rows[0], worst = r.rows[3];
  console.log('  (rung 0 -> 1 falls with px 0 and nothing culled: SSR shedding a full scene pass. Pre-existing.)');

  const ok = r.rows[0].px === 0 && r.rows[1].px === 0 && r.rows[2].px === 1 && r.rows[3].px === 2
          && r.rows[0].culled === 0 && r.rows[1].culled === 0     // the top rungs change nothing
          && worst.culled > 0 && worst.calls < base.calls          // the bottom rung buys something
          // The top-rung control renders the FULL pipeline, whose shadow refit tracks the live sun, so
          // build 1430 already recorded that this one returns to within a couple of calls rather than
          // byte-exactly. The ISOLATION control below is the strict one, and it does return exactly.
          && Math.abs(r.control.calls - base.calls) <= 2 && r.control.culled === 0
          && r.adaptOff.px === 0 && r.adaptOff.culled === 0        // off is full quality
          && r.near.ofThoseCulled === 0                            // nothing near the player vanishes
          && r.editor.culled === 0                                 // authoring shows the level
          && r.isolate.withFloor.calls < r.isolate.without.calls   // the ISOLATED effect is real
          && r.isolate.without.culled === 0 && r.isolate.withFloor.culled > 0
          && r.isolate.control.calls === r.isolate.without.calls;  // ...and its control returns exactly
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + ' — the ladder buys draw calls where the machine is struggling, and gives them all back');
  if (!ok) process.exitCode = 1;
}, { settleMs: 4000 });
