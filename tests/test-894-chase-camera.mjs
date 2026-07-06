// (build 894) DAMPED THIRD-PERSON CHASE — "a camera option for third person camera follow that smoothly
// follows the player with some damping?" Two halves:
//  (1) The third-person camera (player toggle since forever) gains a damped FOLLOW: exponential smoothing
//      of the camera position (frame-rate independent), blended OUT by adsBlend so aiming stays
//      crosshair-exact, snapping after a >1s gap (pause/tab-back/mode entry) instead of swooping. The
//      wall collide runs on the SMOOTHED point so a lagging camera can't hang inside geometry.
//  (2) 'chase' joins the per-level Camera view options (First person / Third-person / Top-down /
//      Side-scroller). It deliberately reports as 'fps' from activeViewMode() — chase keeps normal
//      mouselook/aim — and tpActive() (tpMode || chaseForced()) is the one truth for third-person
//      rendering. Verified headless: chase view puts the camera 4.2m behind with the avatar visible and
//      the viewmodel hidden, vm stays 'fps' (no twin-stick cursor), a yaw flip decays exponentially
//      (6.9 -> 5.6 -> ... -> 0), damping 0 is bolted-rigid, and the level serializes view:'chase'.
import { gameSource, extractFunction, assert, near, done } from './harness.mjs';

const src = gameSource();
const tp = extractFunction('tpCameraPushback', src);

// ---- the damped follow ----
assert(/function tpCameraPushback\(dt\)\{/.test(src), 'the camera tick receives dt');
assert(/let tpDamp = 0\.12;/.test(src), 'follow smoothing tunable (seconds), smooth by default');
assert(/tpDamp=Math\.max\(0,Math\.min\(0\.5,v\)\)/.test(src), '...persisted + clamped');
assert(/const _tau=tpDamp\*\(1-\(\(typeof adsBlend==='number'\)\?adsBlend:0\)\);/.test(tp), 'aiming blends the damping OUT (ADS stays exact)');
assert(/if\(_gap>1000 \|\| !\(_tau>0\.004\)\) _tpCamCur\.set\(camx,camy,camz\);/.test(tp), 'a >1s gap or rigid setting snaps — never a swoop');
assert(/const _k=1-Math\.exp\(-\(dt\|\|_gap\/1000\)\/_tau\);/.test(tp), 'exponential smoothing — frame-rate independent');
// the collide must see the SMOOTHED position (order: damp block, then _cameraCollide)
assert(tp.indexOf('_tpCamCur.set(camx,camy,camz)') < tp.indexOf('_cameraCollide(px, py, pz, camx, camy, camz'), 'wall collide runs on the smoothed point');

// the smoothing really converges: simulate the update law
{
  let cur=0; const target=10, dt=1/60, tau=0.12;
  const k=1-Math.exp(-dt/tau);
  const s1=[]; for(let i=0;i<60;i++){ cur+=(target-cur)*k; s1.push(cur); }
  assert(s1[0]>0.5 && s1[0]<3, 'first frame moves a fraction of the way, not all of it');
  near(s1[59], 10, 0.1, 'converges on the target within a second');
  // half-rate frames take the same wall-clock time (rate independence)
  let cur2=0; const k2=1-Math.exp(-(2*dt)/tau);
  for(let i=0;i<30;i++) cur2+=(target-cur2)*k2;
  near(cur2, s1[59], 0.05, 'same wall-clock convergence at half the frame rate');
}

// ---- the per-level chase view ----
assert(/function chaseForced\(\)\{/.test(src) && /gameCfg\.view==='chase'/.test(extractFunction('chaseForced', src)), 'a level can require the chase camera');
assert(/function tpActive\(\)\{ return tpMode \|\| chaseForced\(\); \}/.test(src), 'tpActive is the one truth for third-person rendering');
assert(/if\(gameCfg\.view==='chase'\) return 'fps';/.test(extractFunction('activeViewMode', src)),
  'chase reports as fps — mouselook/aim/crosshair paths stay untouched (no twin-stick cursor)');
assert(/if\(tpActive\(\) && gameOn && !duelDead\)\{ gun\.visible=false; tpCameraPushback\(dt\); \}/.test(src), 'the render loop drives it with dt');
// every view sanitizer accepts 'chase' (boot init, net load, restore, serialize)
assert(/savedLevel\.game\.view==='chase'/.test(src), 'boot init accepts chase');
assert((src.match(/level\.game\.view==='chase'/g)||[]).length===2, 'restoreLevel + loadLevelFromNet accept chase');
assert(/view: \(gameCfg\.view==='top'\|\|gameCfg\.view==='side'\|\|gameCfg\.view==='chase'\)\?gameCfg\.view:'fps',/.test(src), 'serializeLevel keeps chase');
// editor: the button + the smoothing slider
assert(/vBtn\('chase','Third-person'\)/.test(src), 'Camera view row has the Third-person option');
assert(/mkSlider\('Follow smoothing', \(\)=>tpDamp, v=>tpDamp=v, 0, 0\.5, 0\.01/.test(src), 'follow smoothing slider in the Third-person framing panel');

done('build 894: damped chase follow + per-level Third-person camera view');
