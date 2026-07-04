// (build 861) DAY/NIGHT CYCLE — the sun crosses the sky during play. One pure function (_dayCalc)
// models it: phase 0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight → solar elevation, a smooth light factor
// with a moonlight floor, and a golden-hour warmth factor. updateDayNight drives the 855 sun orbit from
// it (azimuth also revolves 360°/cycle), throttles shadow re-renders to 0.4s, dims sky-light/fog/flat-sky
// toward night, and hands the sky back to the authored settings the moment the cycle stops (editor or
// toggle-off). Cars with headlights switch them on automatically when entered after dark.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the sky model, executably ----
const calc = new Function('Math', extractFunction('_dayCalc') + 'return _dayCalc;')(Math);
near(calc(0).elDeg, 0, 1e-9, 'dawn: sun on the horizon');
near(calc(0.25).elDeg, 70, 1e-9, 'noon: 70° up');
near(calc(0.5).elDeg, 0, 1e-9, 'dusk: back on the horizon');
near(calc(0.75).elDeg, -70, 1e-9, 'midnight: 70° below');
near(calc(0.25).dayF, 1, 1e-9, 'noon is full light');
near(calc(0.75).dayF, 0.06, 1e-9, 'midnight sits on the moonlight floor, never black');
assert(calc(0.02).dayF > 0.06 && calc(0.02).dayF < 1, 'twilight ramps smoothly');
assert(calc(0.5).duskF > 0.9, 'golden hour peaks at the horizon crossing');
eq(calc(0.75).duskF, 0, 'no warmth at midnight');
assert(calc(1.25).elDeg === calc(0.25).elDeg, 'phase wraps');

// ---- runtime wiring ----
const upd = src.match(/function updateDayNight[\s\S]{0,2600}/)[0];
assert(/_sunOrbit\(\(\+worldCfg\.sunAzim\|\|0\) \+ _dayPhase\*360, Math\.max\(5, d\.elDeg\)\)/.test(upd), 'azimuth revolves; elevation floors at 5° (valid shadows all night)');
assert(/_dayShadowT>=0\.4/.test(upd), 'shadow re-renders are throttled, not per-frame');
assert(/applyWorldCfg\(\)/.test(upd), 'stopping the cycle restores the authored sky');
assert(/scene\.background\.isColor/.test(upd), 'flat skies dim toward night (HDRI textures are left alone)');
assert(/updateDayNight\(dt\);/.test(src.match(/updateWaterfalls\(dt\);[^\n]*/)[0]), 'ticked in the zones line');
// defaults + editor
assert(/dayCycle:false, dayLen:240, dayStart:0\.25,/.test(src.match(/const DEFAULT_WORLD = \{[^\n]*/)[0]), 'defaults: off, 4-minute cycle, start at noon');
assert(/Day\/night cycle<\/b> — the sun crosses the sky during play/.test(src), 'the Lighting fold exposes it');
assert(/\[\['Dawn',0\],\['Noon',0\.25\],\['Dusk',0\.5\],\['Night',0\.75\]\]/.test(src), '...with start-time presets');
// night auto-headlights
assert(/_dayIsNight\(\) && !!o\.userData\.vehicle\.headlights/.test(src), 'entering a car after dark lights it up');

done('build 861: day/night cycle — pure sky model verified at dawn/noon/dusk/midnight, authored-sky restore, night headlights');
