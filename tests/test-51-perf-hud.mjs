// (build 72) Diagnostic perf meter (toggle with `). Surfaces FPS/frame-time, draw calls, triangles, and
// geometry/texture counts (a climbing geom/tex count while idle = a leak) so a framerate drop can be pinpointed.
import { gameSource, html, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
const upd = extractFunction('updatePerfHud');
assert(upd && /renderer\.info\.memory/.test(upd), 'reports geometry/texture counts from renderer.info');
assert(/_perfNextDraw = now \+ 250/.test(upd), 'throttles its own redraw');
assert(/_perfCalls=renderer\.info\.render\.calls/.test(src), 'captures draw calls on the render path');
assert(/updatePerfHud\(\);/.test(src), 'meter ticks every frame in the loop');
// build 1436: the key still toggles the meter alongside the controller debug — it just no longer sets the
// flag and the element by hand, because the pause-menu checkbox (the only door a touchscreen has) sets the
// same two things and a second setter is a second chance for them to disagree.
{
  const k = src.slice(src.indexOf("if(e.code==='Backquote')"));
  const line = k.slice(0, k.indexOf('return; }') + 9);
  assert(/setPerfHud\(el \? show : !perfOn\)/.test(line) && /padDebug/.test(line),
    'backquote toggles the meter alongside the controller debug');
}
assert(/id="perfHud"/.test(html), 'perf hud element exists');
assert(/_perfFrameAcc \+= \(now - _perfPrev\)/.test(upd), 'measures real wall-clock frame time (not the clamped sim dt)');
assert(/_prof\.render\+=_pnow\(\)-_r/.test(src), 'render phase is timed');
assert(/_prof\.phys\+=_pnow\(\)-_a/.test(src) && /_prof\.net\+=/.test(src) && /_prof\.mini\+=/.test(src), 'physics/net/minimap phases are timed');
done('diagnostic perf meter');
