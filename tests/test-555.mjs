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
assert(/_eng\.o\.frequency\.setTargetAtTime\(_revHz/.test(eu) && /_eng\.g\.gain\.setTargetAtTime\(0\.03 \+ frac\*0\.085/.test(eu), 'frequency (gearbox rev) + gain ramp with speed/throttle');
// build 731: gearbox — RPM climbs within a gear then drops on the upshift
assert(/const GEARS=5, _g=Math\.min\(GEARS-1, Math\.floor\(frac\*GEARS\)\), _rpm=\(frac\*GEARS\)-_g;/.test(eu), 'speed maps to a gear + an in-gear RPM (0..1)');
assert(/const _revHz=\(58 \+ _g\*6\) \+ _rpm\*120 \+ \(throttle>0\?16:0\);/.test(eu), 'rev pitch = gear base + in-gear RPM (drops on each upshift)');
assert(/if\(Math\.abs\(throttle\)<0\.01 && Math\.abs\(r\.speed\)>0\.4\) r\.speed \*= \(1 - Math\.min\(0\.4, 0\.8\*dt\)\);/.test(extractFunction('driveUpdate')), 'build 731: engine braking slows the car when off the throttle');
// executable: RPM resets down at each gear boundary (the upshift)
{ const GEARS=5, rev=frac=>{ const g=Math.min(GEARS-1,Math.floor(frac*GEARS)), rpm=(frac*GEARS)-g; return (58+g*6)+rpm*120; };
  assert(rev(0.199) > rev(0.201), 'crossing into the next gear drops the revs (an upshift)'); }
assert(/e\.o\.stop\(t\+0\.2\)/.test(extractFunction('_engStop')) && /e\.o\.disconnect\(\)/.test(extractFunction('_engStop')), 'stop ramps down, stops, and disconnects the nodes (no leak)');

// --- lifecycle: start + show on enter, stop + hide on exit, killed on deploy ---
assert(/_engStart\(\); _driveHudEl\(\)\.style\.display='block';/.test(extractFunction('enterCar')), 'entering a car starts the engine + shows the HUD');
assert(/_engStop\(\); \{ const _dh=document\.getElementById\('driveHud'\); if\(_dh\) _dh\.style\.display='none'; \}/.test(extractFunction('exitCar')), 'exiting stops the engine + hides the HUD');
assert(/if\(typeof _engStop==='function'\) _engStop\(\);/.test(extractFunction('startGame')), 'deploy kills any lingering engine sound');

// --- per-frame update: engine + speedometer (km/h + bar) ---
const du = extractFunction('driveUpdate');
assert(/_engUpdate\(r\.speed, throttle, _slip\);/.test(du), 'the engine is updated each frame with speed + throttle + slip (build 728 screech)');
assert(/const U=_SPEED_UNIT\[cfg\.units\]\|\|_SPEED_UNIT\.kph;/.test(du) && /v\.textContent=Math\.round\(Math\.abs\(r\.speed\)\*U\.f\)/.test(du), 'speed shown in the vehicle’s unit (km/h or mph)');
assert(/un\.textContent=U\.l/.test(du), 'the unit label tracks the setting');
assert(/f\.style\.width=Math\.min\(100, Math\.abs\(r\.speed\)\/Math\.max\(1,cfg\.maxSpeed\)\*100\)\+'%'/.test(du), 'the bar fills toward top speed');

// --- the HUD element + its styles exist ---
const dh = extractFunction('_driveHudEl');
assert(/el\.id='driveHud'/.test(dh) && /id="dhVal"/.test(dh) && /id="dhFill"/.test(dh), 'the driveHud element carries the speed value + bar');
assert(/#driveHud \{ position:fixed;[^}]*display:none;/.test(html), 'driveHud is hidden by default (shown only while driving)');

// --- build 728: tyre screech (slip-driven noise) + skid marks ---
const es2 = extractFunction('_engStart');
assert(/src\.loop=true;/.test(es2) && /bp\.type='bandpass'/.test(es2) && /scr=\{ src, bp, g:sg \};/.test(es2), 'engine start also builds a looping bandpassed noise loop for screech');
assert(/const sl=Math\.max\(0, Math\.min\(1, \(\(slip\|\|0\)-0\.2\)\/0\.9\)\) \* Math\.min\(1, Math\.abs\(speed\)\/6\);/.test(extractFunction('_engUpdate')), 'screech gain follows slip * speed (silent until you slide and move)');
assert(/if\(e\.scr\)\{ e\.scr\.g\.gain\.setTargetAtTime\(0\.0001, t, 0\.05\); try\{ e\.scr\.src\.stop\(t\+0\.2\); \}catch/.test(extractFunction('_engStop')), 'engine stop also ramps down + stops the screech (no leak)');
const ds2 = extractFunction('_dropSkid'), fs = extractFunction('_fadeSkids');
assert(/_skidYawQ\.setFromAxisAngle\(_skidUp, yaw\); m\.quaternion\.copy\(_skidYawQ\)\.multiply\(_skidFlatQ\);/.test(ds2), 'a skid mark is laid flat and spun to the car yaw');
assert(/m\.material\.opacity=_SKID_OP; m\.userData\.skidLife=9;/.test(ds2) && /const l=\(m\.userData\.skidLife-=dt\);/.test(fs), 'skid marks carry a life and fade out');
// build 736: soft textures (not flat squares) + lower opacity
assert(/_skidTex=new THREE\.CanvasTexture/.test(src) && /map:tex\|\|null/.test(extractFunction('_ensureSkidPool')), 'skid marks use a soft canvas texture');
assert(/_puffTex=new THREE\.CanvasTexture/.test(src) && /createRadialGradient/.test(src), 'dust uses a soft radial smoke texture');
assert(/const _DUST_OP=0\.16;/.test(src) && /const _SKID_OP=0\.34;/.test(src), 'dust + skids toned down to faint opacities (build 736)');
assert(/const _sliding=\(_slip>0\.3 \|\| handbrake\);/.test(du) && /if\(_grounded && _sliding && Math\.abs\(r\.speed\)>3\)\{/.test(du), 'skid marks drop only while grounded + sliding/braking + moving');
assert(/_dropSkid\(_rbx \+ _rx\*_hw\*0\.7, gC, _rbz \+ _rz\*_hw\*0\.7, carYaw\);/.test(du), 'a mark is dropped under each rear tyre');
assert(/if\(typeof _clearSkids==='function'\) _clearSkids\(\);/.test(extractFunction('startGame')), 'deploy clears any lingering skid marks');

// build 732: tyre dust — billboarded puffs off the rear tyres under power / slides / boost
const ud = extractFunction('_updateDust');
assert(/m\.position\.x\+=d\.vx\*dt; m\.position\.y\+=d\.vy\*dt; m\.position\.z\+=d\.vz\*dt; d\.vy\*=\(1-0\.7\*dt\);/.test(ud), 'dust puffs drift + rise with decaying upward velocity');
assert(/m\.material\.opacity=d\.op\*f; m\.scale\.setScalar\(m\.scale\.x \+ dt\*1\.4\);/.test(ud) && /m\.lookAt\(camPos\)/.test(ud), 'dust grows softly + fades and billboards to the camera');
assert(/const _dustI=_sliding\?1\.5:\(_boosting\?1\.2:0\.55\);/.test(du) && /const _every=_sliding\?0\.05:0\.075;/.test(du), 'dust is a faint continuous haze, thicker on slides/boost (build 736)');
assert(/_spawnDust\(_rbx \+ _rx\*_hw\*0\.6, gC\+0\.2, _rbz \+ _rz\*_hw\*0\.6, -hx\*r\.speed, -hz\*r\.speed, _dustI\);/.test(du), 'dust spawns at the rear tyres, thrown back along travel, scaled by intensity');
assert(/_fadeSkids\(dt\); _updateDust\(dt, camera && camera\.position\);/.test(du), 'skids + dust update each frame');
assert(/if\(typeof _clearDust==='function'\) _clearDust\(\);/.test(extractFunction('startGame')), 'deploy clears lingering dust too');

done('build 715/728/731/732/736: driving HUD + engine + screech + skid marks + gearbox + engine braking + soft tyre dust');
