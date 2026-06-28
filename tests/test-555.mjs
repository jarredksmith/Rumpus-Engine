import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 715: driving Phase 4 polish — a speed HUD (km/h + bar) and a speed-reactive engine sound that start on enter,
// update each frame, and stop on exit. Audio + DOM are browser-verified; this pins the wiring + lifecycle.

// --- engine sound: a guarded sawtooth through a lowpass, pitch/volume tracking speed + throttle ---
const es = extractFunction('_engStart');
assert(/if\(_eng \|\| typeof actx==='undefined' \|\| !actx \|\| !sfxBus\) return;/.test(es), 'engine start is guarded (no audio context = no-op)');
assert(/o\.type='sawtooth'/.test(es) && /f\.type='lowpass'/.test(es) && /o\.connect\(f\)\.connect\(g\)\.connect\(sfxBus\)/.test(es), 'osc -> lowpass -> gain -> sfx bus');
const eu = extractFunction('_engUpdate');
assert(/const t=actx\.currentTime, frac=Math\.min\(1, Math\.abs\(speed\)\/14\)/.test(eu), 'pitch/volume scale with speed');
assert(/_eng\.o\.frequency\.setTargetAtTime\(55 \+ frac\*150/.test(eu) && /_eng\.g\.gain\.setTargetAtTime\(0\.03 \+ frac\*0\.085/.test(eu), 'frequency + gain ramp with speed/throttle');
assert(/e\.o\.stop\(t\+0\.2\)/.test(extractFunction('_engStop')) && /e\.o\.disconnect\(\)/.test(extractFunction('_engStop')), 'stop ramps down, stops, and disconnects the nodes (no leak)');

// --- lifecycle: start + show on enter, stop + hide on exit, killed on deploy ---
assert(/_engStart\(\); _driveHudEl\(\)\.style\.display='block';/.test(extractFunction('enterCar')), 'entering a car starts the engine + shows the HUD');
assert(/_engStop\(\); \{ const _dh=document\.getElementById\('driveHud'\); if\(_dh\) _dh\.style\.display='none'; \}/.test(extractFunction('exitCar')), 'exiting stops the engine + hides the HUD');
assert(/if\(typeof _engStop==='function'\) _engStop\(\);/.test(extractFunction('startGame')), 'deploy kills any lingering engine sound');

// --- per-frame update: engine + speedometer (km/h + bar) ---
const du = extractFunction('driveUpdate');
assert(/_engUpdate\(r\.speed, throttle\);/.test(du), 'the engine is updated each frame with speed + throttle');
assert(/v\.textContent=Math\.round\(Math\.abs\(r\.speed\)\*3\.6\)/.test(du), 'speed shown in km/h (m/s * 3.6)');
assert(/f\.style\.width=Math\.min\(100, Math\.abs\(r\.speed\)\/Math\.max\(1,cfg\.maxSpeed\)\*100\)\+'%'/.test(du), 'the bar fills toward top speed');

// --- the HUD element + its styles exist ---
const dh = extractFunction('_driveHudEl');
assert(/el\.id='driveHud'/.test(dh) && /id="dhVal"/.test(dh) && /id="dhFill"/.test(dh), 'the driveHud element carries the speed value + bar');
assert(/#driveHud \{ position:fixed;[^}]*display:none;/.test(html), 'driveHud is hidden by default (shown only while driving)');

done('build 715: driving speed HUD + speed-reactive engine sound');
