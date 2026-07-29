// build 1122: the perf HUD reports the whole frame, not the last fullscreen quad.
//
// three r149 clears renderer.info at the START of every render() call, and one frame makes many:
// the scene pass, the shadow map, four post-chain quads, the viewmodel, and any preview window.
// renderScene captured the counters immediately after the post chain returned — and the post chain
// ends with a fullscreen quad — so the HUD read "draws 1  tris 0k" no matter what the level held.
// Every performance decision a creator made was based on that.
//
// Measured in a live session after the fix: "draws 19  tris 1k" on the stock level.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

assert(/renderer\.info\.autoReset = false;/.test(src),
  'three no longer clears the counters inside every render() call');
assert(/try\{ renderer\.info\.reset\(\); \}catch\(e\)\{\}/.test(src), 'the frame opens one accumulation window');
{
  // ...at the TOP of the loop, before anything renders
  const loop = src.slice(src.indexOf('function loop(){'));
  const reset = loop.indexOf('renderer.info.reset()');
  const firstRender = loop.indexOf('renderScene(');
  assert(reset > 0 && reset < firstRender, 'the reset happens before the frame renders anything');
  // ...and the read is at the BOTTOM, after every pass including the viewmodel
  const read = loop.indexOf('_perfCalls=renderer.info.render.calls');
  const vm = loop.indexOf('renderViewmodel();', firstRender);
  assert(read > vm && vm > 0, 'the counters are read after the viewmodel, so they cover every pass');
}
// and renderScene must no longer sample them mid-frame
{
  const rs = src.slice(src.indexOf('function renderScene('), src.indexOf('// ---------- Post-processing'));
  assert(!/_perfCalls=/.test(rs), 'renderScene no longer captures the counters mid-frame');
  assert(/_prof\.render\+=/.test(rs), '...but still times itself, which is a per-pass measurement and correct here');
}
// the HUD still reads the same variables
assert(/draws '\+_perfCalls\+'/.test(src), 'the HUD prints the frame total');

done('build 1122: the perf HUD counts the frame, not the last quad');
