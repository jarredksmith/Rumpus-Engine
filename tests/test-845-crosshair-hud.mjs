// (build 845) CROSSHAIR LIVES IN THE HUD TAB. It was one of three panels inside Weapons > Effects — but a
// reticle is a HUD element, and first-time users looked for it under HUD (where every other on-screen element
// lives). The host is now its own 'Crosshair' section registered to the HUD mode; the Effects picker keeps
// Impacts + Tracer. A stale localStorage selection of the removed picker type falls back safely.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

assert(/const WEPFX_TYPES = \[\['impactfx','\\ud83d\\udca5','Impacts'\],\['tracerfx','\\ud83d\\udca8','Tracer'\]\];/.test(src), 'the Effects picker is Impacts + Tracer only');
assert(/const WEPFX_HOST = \{ impactfx:'edImpactFx', tracerfx:'edTracerFx' \};/.test(src), 'no host mapping for the moved panel');
assert(/if\(_w && WEPFX_HOST\[_w\]\) activeWepFx = _w;/.test(src), 'a stale saved picker choice (crosshair) is ignored, not crashed on');
assert(/sec\('Crosshair', 'crosshair', '<div id="edCrosshair"><\/div>'\)/.test(src), 'Crosshair is its own section');
assert(/hud:     \['hud','crosshair'\]/.test(src), '...owned by the HUD tab');
assert(/crosshair:\s*'Reticle shape, size & colour\.'/.test(src), '...with its plain-language subtitle');
assert(!/id="edCrosshair" class="wepfxHost"/.test(src), 'the host no longer sits inside the Effects group');

done('build 845: the crosshair is a HUD element — moved from Weapons > Effects to the HUD tab');
