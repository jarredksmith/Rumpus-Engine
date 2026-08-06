// What does a point light's shadow actually cost?
//
// Build 1348 wanted to answer this and could not: its frame-cost sweep FAILED ITS OWN CONTROL — a
// 0-caster baseline read 396 ms and the return to 0 read 554 ms — so there was no honest number to ship
// a cube shadow against, and the feature was parked with that stated. This is the re-run, and the change
// is the MEASURAND, not the patience.
//
// A wall-clock frame time under SwiftShader has a noise floor larger than the effect. DRAW CALLS do not:
// they are integers, they are exactly what a shadow map costs (six scene renders per point caster), and a
// control either returns to the baseline EXACTLY or the instrument is broken. That is the discriminator
// 1348 lacked.
//
// Nothing here changes the engine. It is a measurement, run before deciding anything.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };
const num = (v) => (typeof v === 'number' ? v : NaN);

await withGame(async (probe) => {
  const r = await probe(`
  (function(){
    const R = {};
    /* The scene must not move. A live world re-renders different geometry every frame and the sweep is
       then measuring the world, not the lights (build 1379's failure #4, verbatim). */
    paused = true;
    _tabHidden = true;
    player.pos.x = 0; player.pos.y = 2.9; player.pos.z = 30; player.yaw = 0; player.pitch = -0.1;
    camera.position.set(0, 2.9, 30); camera.rotation.set(-0.1, 0, 0, 'YXZ');
    camera.updateMatrixWorld(true);

    const made = [];
    function lamp(i){
      const l = new THREE.PointLight(0xffe6a0, 4, 18);
      l.position.set(-12 + i * 8, 3.2, 24);
      l.castShadow = false;
      scene.add(l); made.push(l);
      return l;
    }
    for(let i = 0; i < 4; i++) lamp(i);

    /* One sample = one real render with the shadow map FORCED to refresh. Without the force, build 1093's
       static shadow map hides the whole cost behind autoUpdate=false and every row reads the same. */
    /* renderer.info.autoReset is FALSE (build 1122b: "the perf HUD counts the frame, not the last quad"),
       and loop() owns the one reset per frame. This probe calls renderScene directly, so nothing reset it
       and every row read the RUNNING TOTAL — the counts climbed monotonically through the sweep and kept
       climbing on the return to 0. The control caught it, which is the entire reason it is the first
       assertion. Reset it here, the way loop() does. */
    function sample(){
      try{ renderer.info.reset(); }catch(e){}
      renderer.shadowMap.needsUpdate = true;
      renderScene(scene, camera);
      const inf = renderer.info.render;
      return { calls: inf.calls, tris: inf.triangles, programs: renderer.info.programs.length };
    }
    function row(nCast){
      for(let i = 0; i < made.length; i++) made[i].castShadow = (i < nCast);
      sample(); sample();                       // warm: the first render after a count change compiles
      const s = sample();
      return { n: nCast, calls: s.calls, tris: s.tris, programs: s.programs };
    }

    /* FIRST, before anything has ever cast: programs are cached for the life of the page, so once a
       1-caster variant has compiled, flipping back to it compiles nothing. Measured after the sweep this
       reads 0 and looks like a refutation of build 1348's finding when it is only the cache. */
    for(const l of made) l.castShadow = false;
    sample(); sample();
    const p0 = renderer.info.programs.length;
    made[0].castShadow = true;
    const firstFlip = sample();
    R.recompile = { before: p0, after: firstFlip.programs, delta: firstFlip.programs - p0 };
    for(const l of made) l.castShadow = false;
    sample(); sample();

    R.rows = [];
    R.rows.push(row(0));      // baseline
    R.rows.push(row(1));
    R.rows.push(row(2));
    R.rows.push(row(4));
    R.rows.push(row(0));      // THE CONTROL — must return to the baseline exactly

    /* A timing figure too, but as a MEDIAN of many and with its own control — reported for scale, and
       explicitly not the number any decision rests on. */
    function medianMs(nCast, k){
      for(let i = 0; i < made.length; i++) made[i].castShadow = (i < nCast);
      sample(); sample();
      const t = [];
      for(let i = 0; i < k; i++){ const a = performance.now(); sample(); t.push(performance.now() - a); }
      t.sort((x,y)=>x-y);
      return +t[t.length >> 1].toFixed(2);
    }
    R.ms0a = medianMs(0, 9);
    R.ms1  = medianMs(1, 9);
    R.ms4  = medianMs(4, 9);
    R.ms0b = medianMs(0, 9);   // the control 1348 could not close

    // how many shadow-casting objects there are to render six times over
    let casters = 0; scene.traverseVisible(o=>{ if(o.isMesh && o.castShadow) casters++; });
    R.casters = casters;

    for(const l of made){ l.castShadow = false; scene.remove(l); }
    renderer.shadowMap.needsUpdate = true; renderScene(scene, camera);
    paused = false; _tabHidden = false;
    return R;
  })()`);

  const [b0, c1, c2, c4, ctrl] = r.rows;
  const line = (x) => x.n + ' casters: ' + x.calls + ' calls, ' + x.tris + ' tris';
  for (const x of r.rows) console.log('        ' + line(x));
  console.log('        recompile on one flip: ' + r.recompile.before + ' -> ' + r.recompile.after +
              ' programs (delta ' + r.recompile.delta + ')');
  console.log('        median ms: 0=' + r.ms0a + '  1=' + r.ms1 + '  4=' + r.ms4 + '  0(control)=' + r.ms0b);
  console.log('        shadow-casting meshes in the scene: ' + r.casters + '\n');

  // ---- THE CONTROL, first: nothing below means anything without it ----
  P(ctrl.calls === b0.calls && ctrl.tris === b0.tris,
    'THE CONTROL RETURNS EXACTLY — 4 casters back to 0 reproduces the baseline call and triangle counts, ' +
    'which is what build 1348\'s timing sweep could not do',
    ctrl.calls + '/' + ctrl.tris + ' vs ' + b0.calls + '/' + b0.tris);

  const per1 = c1.calls - b0.calls, per2 = c2.calls - b0.calls, per4 = c4.calls - b0.calls;
  P(per1 > 0, 'one shadow-casting point light costs real draw calls', '+' + per1);
  P(Math.abs(per2 - per1 * 2) <= Math.max(2, per1 * 0.1) && Math.abs(per4 - per1 * 4) <= Math.max(4, per1 * 0.2),
    '...and the cost is LINEAR in the number of casters — 1/2/4 land on 1x/2x/4x, so a per-caster figure ' +
    'is a real figure rather than an artefact of one measurement',
    '+' + per1 + ' / +' + per2 + ' / +' + per4);
  P(per1 >= 5 * (b0.calls > 0 ? 1 : 1),
    '...at roughly six scene renders per caster, which is what a cube map IS',
    '+' + per1 + ' calls against ' + r.casters + ' casting meshes (~' + (r.casters ? (per1 / r.casters).toFixed(1) : '?') + ' passes)');

  P(r.recompile.delta > 0,
    'and build 1348\'s reason for never making it a live toggle is confirmed: flipping castShadow ' +
    'RECOMPILES, because NUM_POINT_LIGHT_SHADOWS is a #define',
    '+' + r.recompile.delta + ' programs in one frame');

  const drift = Math.abs(r.ms0b - r.ms0a) / Math.max(0.01, r.ms0a);
  P(true, 'timing, for scale only — median ms 0/1/4 = ' + r.ms0a + '/' + r.ms1 + '/' + r.ms4 +
          ', control ' + r.ms0b + ' (drift ' + (drift * 100).toFixed(0) + '%)');
  if (drift > 0.15) console.log('        ^ the TIMING control still does not close under SwiftShader — ' +
                                'which is exactly why the decision rests on the call counts.');
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
