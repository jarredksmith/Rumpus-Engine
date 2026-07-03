// (build 858) WATERFALLS — the water tool grows a falling-sheet type: ONE shader plane per fall
// (scrolling streak bands, soft edges, whiter/mistier toward the plunge), a foam-pool disc at the base,
// and positional looping sound via the audio-zone recipe (buffer -> gain -> sfxBus), so master/SFX
// volume and mute apply and bigger falls are audible further. Still zero render targets, zero particles.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- audible-radius + gain math run executably ----
const gainFn = new Function(extractFunction('_fallGainFor') + 'return _fallGainFor;')();
const audFn  = new Function('Math', extractFunction('_fallAudR') + 'return _fallAudR;')(Math);
eq(gainFn(0, 20, 0.8), 0.8, 'full volume at the fall');
near(gainFn(10, 20, 0.8), 0.4, 1e-9, 'linear falloff at half distance');
eq(gainFn(25, 20, 0.8), 0, 'silent beyond the audible radius');
eq(gainFn(0, 20, null), 0.8, 'default volume 0.8');
eq(audFn({ w:6, h:8 }), Math.max(14, 6*2+8*1.2), 'audible radius scales with size');
assert(audFn({ w:30, h:40 }) > audFn({ w:6, h:8 }), 'bigger falls carry further');

// ---- the sheet + foam are the cheap kind ----
const sheet = src.match(/const _FALL_FSH = \[[\s\S]{0,1600}?\]\.join/)[0];
assert(/uTime\*uSpd/.test(sheet) && /smoothstep\(0\.0,0\.12,vUv\.x\)/.test(sheet), 'scrolling sheet with soft edges');
assert(/smoothstep\(0\.35,0\.0,vUv\.y\)/.test(sheet), 'whiter/mistier toward the plunge');
assert(!/WebGLRenderTarget/.test(src.match(/function buildWaterfallGroup[\s\S]{0,1800}/)[0]), 'no render targets');
assert(/CircleGeometry\(Math\.max\(0\.6,w\*0\.42\), 36\)/.test(src), 'foam pool disc at the base');

// ---- sound path mirrors the audio zones (sfxBus => master/SFX/mute apply) ----
const upd = src.match(/function updateWaterfalls[\s\S]{0,2600}/)[0];
assert(/connect\(rt\.gain\)\.connect\(sfxBus\)/.test(upd), 'looped through the SFX bus');
assert(/loadSound\(f\.snd\)/.test(upd), 'sound buffers lazy-load like audio zones');
assert(/setTargetAtTime\(vol, actx\.currentTime, 0\.1\)/.test(upd), 'smooth gain ramps (no clicks)');

// ---- plumbing ----
assert(/waterfalls: waterfalls\.map\(f=>\(\{ x:\+f\.x, z:\+f\.z, y:\+f\.y, h:\+f\.h, w:\+f\.w, yaw:/.test(src), 'waterfalls serialize with the level');
eq((src.match(/waterfalls = Array\.isArray\(level\.waterfalls\) \? level\.waterfalls\.map\(_migrateWaterfall\) : \[\];/g)||[]).length, 2, '...and restore on both load paths');
assert(/waterfalls\.length=0; if\(typeof refreshWaterfalls==='function'\) refreshWaterfalls\(\);/.test(src), 'wipe clears them');
assert(/updateWaterfalls\(dt\);/.test(src.match(/updateWaterZones\(dt\);[^\n]*/)[0]), 'ticked beside the water zones');
assert(/_renderWaterfallsUI\(host\);/.test(src), 'the Waterfalls UI renders inside the Water tool');
assert(/\+ Add waterfall \(at me\)/.test(src), '...with its add button');

done('build 858: waterfalls — executable gain/falloff math, one-plane sheet + foam pool, sfxBus positional sound');
