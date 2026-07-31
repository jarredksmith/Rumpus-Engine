// build 1219: the crosshair blooms with the live spread — an invisible penalty becomes a visible one.
//
// The gameplay-feel critic's MEDIUM: build 1161 made movement and airtime cost accuracy, but #crosshair was
// a static reticle, so the player had no readout of "I am currently inaccurate" — the airborne spread floor
// felt like random misses rather than a rule to stop-and-shoot around. The spread math is hoisted into
// _curSpread (shared by shoot AND the crosshair, so the reticle can never lie), and the four arms offset
// outward by a CSS var (--xh-bloom) eased from that spread each frame; a scoped optic hides the reticle so
// the bloom costs nothing there.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- _curSpread, executed (and identical to 1161's math)
{
  const cs = new Function('WEAPONS', 'curWep', 'adsBlend', 'player',
    extractFunction('_curSpread') + '\nreturn _curSpread;');
  const run = (wspread, ads, hspd, grounded) =>
    cs({ r: { spread: wspread } }, 'r', ads, { vel: { x: hspd, z: 0 }, onGround: grounded })();

  eq(run(0, 0, 0, true), 0, 'a zero-spread weapon, standing still, hip: exactly zero (byte-identical to 1161)');
  assert(run(0, 0, 0, false) > 0, 'the same weapon AIRBORNE pays the floor — the anti sprint-jump-snipe term');
  near(run(0, 0, 0, false), 0.030, 1e-9, '...specifically the 0.030 airborne floor');
  assert(run(0.04, 0, 8, true) > run(0.04, 0, 0, true), 'moving is less accurate than standing');
  assert(run(0.04, 1, 8, true) < run(0.04, 0, 8, true), 'aiming while moving is tighter than hip-firing while moving');
  // the crosshair and the shot read the SAME function
  assert(/const spread = _curSpread\(w\);/.test(src), 'shoot() computes its spread through _curSpread');
}

// ---------------------------------------------------------------- the bloom easing + mapping
{
  const upd = new Function('crosshairEl', 'curSpread',
    'let _xhBloom = 0; const _curSpread = curSpread;\n' +
    extractFunction('_updateCrosshairBloom').replace('_curSpread()', '_curSpread()') +
    '\nreturn { step:(dt)=>_updateCrosshairBloom(dt), get:()=>_xhBloom };');
  const el = { _v: {}, style: { setProperty(k, v) { el._v[k] = v; } } };
  let spread = 0;
  const api = upd(el, () => spread);

  // standing still: the gap stays ~0
  for (let i = 0; i < 60; i++) api.step(1 / 60);
  assert(api.get() < 0.5, 'a tight (zero) spread keeps the crosshair closed');
  // start moving/jumping: the gap grows toward the mapped target and eases (does not snap)
  spread = 0.1;
  const before = api.get();
  api.step(1 / 60);
  const after1 = api.step(1 / 60);
  assert(api.get() > before, 'the gap opens as spread rises');
  assert(api.get() < 0.1 * 90, 'it EASES toward the target (0.1*90=9px), not there in one frame — it breathes');
  for (let i = 0; i < 120; i++) api.step(1 / 60);
  near(api.get(), 9, 0.2, '...settling at spread*90 px');
  // the cap
  spread = 1.0; for (let i = 0; i < 200; i++) api.step(1 / 60);
  near(api.get(), 18, 0.1, 'a huge spread clamps the bloom at 18px — the reticle never flies apart');
  // and it writes the CSS var
  assert(/px$/.test(el._v['--xh-bloom']), 'the eased value is written as a px CSS variable');
}

// ---------------------------------------------------------------- the arms read the var, all four outward
{
  const ac = extractFunction('applyCrosshair');
  assert(/const b0='var\(--xh-bloom,0px\)', bN='calc\(-1 \* var\(--xh-bloom,0px\)\)';/.test(ac),
    'the outward and inward offsets are the CSS var and its negation');
  assert(/translateY\('\+bN\+'\)[\s\S]*top:0/.test(ac) && /translateY\('\+b0\+'\)[\s\S]*bottom:0/.test(ac),
    'the top arm moves up and the bottom arm down (both away from centre)');
  assert(/translateX\('\+bN\+'\)[\s\S]*left:0/.test(ac) && /translateX\('\+b0\+'\)[\s\S]*right:0/.test(ac),
    'the left arm moves left and the right arm right');
  assert(/_updateCrosshairBloom==='function'\) _updateCrosshairBloom\(dt\)/.test(src),
    'the frame loop updates the bloom beside the reticle opacity write');
}

done('build 1219: the crosshair blooms with the live spread — _curSpread executed proving the standing-still values are byte-identical to 1161 and shot/reticle share it, the bloom eases toward spread*90px and clamps at 18px (never snapping, never flying apart), and all four arms offset outward from a single CSS var; a penalty you can see is a penalty you can learn');
