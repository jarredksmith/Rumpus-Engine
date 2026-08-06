// Does a wall now BLOCK the lamp?
//
// point-shadow-cost.mjs priced the feature. This one asks whether it works, and the distinction matters:
// `castShadow = true` being readable back proves the flag was set, not that a single photon stopped at a
// wall. Build 1381's own lesson is that half a shadow patch renders a perfectly plausible frame — so the
// question has to be asked of PIXELS.
//
// The fixture is a floor, a wall and a lamp on one side of it, built at (200, 200) — far outside ARENA=70,
// because build 1323 spent three instrument failures discovering that the stock level has a crate exactly
// where you want to measure. Every other light in the world is zeroed, so the lamp is the only thing
// lighting the floor and there is nothing else for a change to be attributed to.
//
// THE CONTROL IS THE WHOLE PROBE. Shadow OFF, ON, OFF again:
//   - if the shadowed side darkens and the LIT side holds, the wall is blocking light;
//   - if BOTH sides move, something else changed and the measurement is worthless;
//   - if the final OFF does not return, the instrument is not repeatable and nothing above it counts.
//
// Read as scene-linear radiance out of a FloatType target with tone mapping off (room-leak7's rig), because
// an 8-bit tone-mapped canvas value is albedo x light x a curve and cannot answer a question about light.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(`
  (function(){
    const R = {}, made = [];
    /* Everything in ONE eval. The frame loop owns the camera (build 1345) and updateShadowLightBudget owns
       castShadow, so anything set in one probe() call and measured in the next has already been undone. */
    paused = true; _tabHidden = true;
    _adaptOn = false; _prStepI = 0; _hiFxOn = true;

    /* Kill every other light. Not tidiness — with the sun on, the sun is the frame and the lamp is a
       rounding error, and "the shadowed side got darker" would be measuring the wrong shadow. */
    const w = worldCfg;
    const savedW = { sun:w.sun, sky:w.sky, bounce:w.bounce, ambient:w.ambient, ssao:w.ssao,
                     baked:w.baked, autoExp:w.autoExp, postGrain:w.postGrain, postMotion:w.postMotion };
    w.sun = 0; w.sky = 0; w.bounce = 0; w.ambient = 0; w.ssao = 0; w.baked = false;
    w.autoExp = 0; w.postGrain = 0; w.postMotion = 0;
    applyWorldCfg();

    const FX = 200, FZ = 200;
    function prop(x, y, z, sx, sy, sz){
      let o = null; spawnProp('box',[x, y, z, 0,0,0, sx, sy, sz],(b)=>{o=b;});
      if(!o) throw new Error('spawnProp did not build synchronously');
      made.push(o); return o;
    }
    /* Primitives are base-at-origin (build 1320), so the floor's top is y = 0.4 and the wall stands on it. */
    prop(FX, 0,   FZ, 16, 0.4, 16);            // floor
    prop(FX, 0.4, FZ, 0.4, 4,   10);           // wall, running along Z, TALLER than the lamp

    /* The shipped path, not a hand-built THREE.PointLight — the question is whether buildLight's own
       cube-shadow configuration works. */
    const lg = buildLight({ type:'point', color:0xffffff, intensity:14, distance:24,
                            shadow:true, t:[FX-4, 2.5, FZ] });
    const L = lg.userData.light;
    R.wantShadow = !!lg.userData.wantShadow;
    R.ltype = lg.userData.ltype;
    R.mapPx = L.shadow ? L.shadow.mapSize.x : null;
    R.near = L.shadow ? L.shadow.camera.near : null;
    R.far  = L.shadow ? L.shadow.camera.far  : null;
    R.isCube = !!(L.shadow && L.shadow.camera && L.shadow.camera.isPerspectiveCamera);

    const W = 400, H = 240;
    const LIT = new THREE.Vector3(FX-2.5, 0.41, FZ);   // lamp's side of the wall
    const SHD = new THREE.Vector3(FX+2.5, 0.41, FZ);   // behind it

    function shot(){
      /* Pose and render in the same statement run: the loop cannot get between them. */
      camera.position.set(FX, 12, FZ + 12);
      camera.up.set(0,1,0);
      camera.lookAt(FX, 0.4, FZ);
      camera.updateMatrixWorld(true); camera.updateProjectionMatrix();

      renderer.shadowMap.needsUpdate = true;
      const rt = new THREE.WebGLRenderTarget(W, H, {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.FloatType });
      const tm = renderer.toneMapping, ex = renderer.toneMappingExposure, prev = renderer.getRenderTarget();
      renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      const b = new Float32Array(W*H*4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, b);
      renderer.setRenderTarget(prev); renderer.toneMapping = tm; renderer.toneMappingExposure = ex;
      rt.dispose();

      /* Sample by PROJECTING the world point, not by eyeballing a rectangle off a screenshot — that is
         the mistake build 1151 recorded ("read WHO before attributing anything to a surface") and the one
         that cost build 1136 a capture cycle. */
      function patch(v){
        const p = v.clone().project(camera);
        const px = Math.round((p.x*0.5+0.5)*W), py = Math.round((p.y*0.5+0.5)*H);   // readPixels rows are bottom-up
        if(px < 3 || py < 3 || px > W-4 || py > H-4) return { y:NaN, px:px, py:py, off:true };
        let s = 0, n = 0;
        for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++){
          const i = (((py+dy)*W)+(px+dx))*4;
          s += 0.2126*b[i] + 0.7152*b[i+1] + 0.0722*b[i+2]; n++;
        }
        return { y:+(s/n).toFixed(6), px:px, py:py, off:false };
      }
      return { lit: patch(LIT), shd: patch(SHD) };
    }

    function row(on){
      L.castShadow = on;
      shot(); shot();                 // warm: the map is created lazily and the first frame after a flip compiles
      const s = shot();
      return { on:on, lit:s.lit.y, shd:s.shd.y, litPx:[s.lit.px, s.lit.py], shdPx:[s.shd.px, s.shd.py],
               offscreen: s.lit.off || s.shd.off };
    }

    R.off1 = row(false);
    R.on   = row(true);
    R.off2 = row(false);              // THE CONTROL

    /* teardown */
    L.castShadow = false;
    const li = lightModels.indexOf(lg); if(li >= 0) lightModels.splice(li, 1);
    scene.remove(lg);
    for(const o of made){ const i = propModels.indexOf(o); if(i >= 0) removeProp(i); }
    Object.assign(worldCfg, savedW); applyWorldCfg();
    renderer.shadowMap.needsUpdate = true;
    paused = false; _tabHidden = false;
    R.leftOver = lightModels.indexOf(lg) >= 0 ? 1 : 0;
    return R;
  })()`);

  const f = (x) => (typeof x === 'number' ? x.toFixed(5) : String(x));
  console.log('        fixture: floor + wall at (200,200), one point lamp on the -x side, every other light zeroed');
  console.log('        sample px  lit ' + JSON.stringify(r.off1.litPx) + '   shadowed ' + JSON.stringify(r.off1.shdPx));
  console.log('        shadow OFF   lit ' + f(r.off1.lit) + '   shadowed ' + f(r.off1.shd));
  console.log('        shadow ON    lit ' + f(r.on.lit)   + '   shadowed ' + f(r.on.shd));
  console.log('        shadow OFF   lit ' + f(r.off2.lit) + '   shadowed ' + f(r.off2.shd) + '   <- the control');
  console.log('        cube map ' + r.mapPx + 'px, near ' + r.near + ', far ' + r.far + '\n');

  // ---- the control first: nothing below it means anything ----
  const back = (a, b) => Math.abs(a - b) <= Math.max(1e-4, Math.abs(b) * 0.02);
  P(back(r.off2.lit, r.off1.lit) && back(r.off2.shd, r.off1.shd),
    'THE CONTROL RETURNS — switching the shadow back off reproduces both readings, so the instrument is ' +
    'repeatable and the middle row is a real difference rather than drift',
    f(r.off2.lit) + '/' + f(r.off2.shd) + ' vs ' + f(r.off1.lit) + '/' + f(r.off1.shd));

  P(!r.off1.offscreen && !r.on.offscreen,
    'both sample points are on screen — a probe that samples off the frame reports 0 and reads as a shadow',
    JSON.stringify(r.off1.litPx) + ' ' + JSON.stringify(r.off1.shdPx));

  // ---- and the instrument can produce a positive: the fixture is lit at all ----
  P(r.off1.shd > 0.01 && r.off1.lit > 0.01,
    'with the shadow OFF the lamp lights BOTH sides of the wall — i.e. it shines straight through it, ' +
    'which is the defect builds 1132 and 1348 left standing and the thing this build removes',
    'lit ' + f(r.off1.lit) + ', through-the-wall ' + f(r.off1.shd));

  // ---- the finding ----
  const drop = r.off1.shd > 0 ? 1 - r.on.shd / r.off1.shd : 0;
  const litMove = r.off1.lit > 0 ? Math.abs(r.on.lit - r.off1.lit) / r.off1.lit : 1;
  P(drop >= 0.7,
    'shadow ON: the floor BEHIND the wall loses most of its light — the wall is finally an occluder',
    (drop * 100).toFixed(1) + '% darker (' + f(r.off1.shd) + ' -> ' + f(r.on.shd) + ')');
  P(litMove <= 0.06,
    '...while the lamp\'s OWN side holds. That is what separates "the wall blocks light" from "the frame ' +
    'got darker" — if both had moved, the measurement would prove nothing',
    (litMove * 100).toFixed(1) + '% (' + f(r.off1.lit) + ' -> ' + f(r.on.lit) + ')');

  // ---- and it is really the cube path ----
  P(r.wantShadow === true && r.ltype === 'point',
    'buildLight accepted shadow:true on a POINT light and recorded wantShadow, so the budget will rank it');
  P(r.isCube && r.mapPx > 0 && r.near === 0.25 && r.far === 24,
    '...configured as a cube: perspective shadow camera, near 0.25, far = the lamp\'s own reach, ' +
    'not three\'s default 500 spread over a range the lamp never lights',
    r.mapPx + 'px near ' + r.near + ' far ' + r.far);
  P(r.leftOver === 0, 'teardown removed the light again', r.leftOver);
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
