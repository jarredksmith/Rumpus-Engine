import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 715: driving Phase 4 polish — a speed HUD (km/h + bar) and a speed-reactive engine sound that start on enter,
// update each frame, and stop on exit. Audio + DOM are browser-verified; this pins the wiring + lifecycle.

// --- engine sound: a guarded sawtooth through a lowpass, pitch/volume tracking speed + throttle ---
const es = extractFunction('_engStart');
assert(/if\(_eng \|\| typeof actx==='undefined' \|\| !actx \|\| !sfxBus\) return;/.test(es), 'engine start is guarded (no audio context = no-op)');
assert(/o\.type='sawtooth'/.test(es) && /f\.type='lowpass'/.test(es) && /o\.connect\(f\)\.connect\(g\)\.connect\(sfxBus\)/.test(es), 'osc -> lowpass -> gain -> sfx bus');
const eu = extractFunction('_engUpdate');
// build 793: the gearbox spans the vehicle's REAL top speed (was a fixed /14 that pinned fast cars in top gear)
assert(/const t=actx\.currentTime, _top=Math\.max\(6, \(\+maxSpeed\|\|16\)\), frac=Math\.min\(1, Math\.abs\(speed\)\/_top\)/.test(eu), 'pitch/volume scale with speed relative to the real top speed');
assert(/_eng\.o\.frequency\.setTargetAtTime\(_revHz/.test(eu) && /_eng\.g\.gain\.setTargetAtTime\(\(0\.03 \+ frac\*0\.09/.test(eu), 'frequency (gearbox rev) + gain ramp with speed/throttle');
// build 731/793: gearbox — RPM climbs within a gear then drops on the upshift; a clutch dip ducks the gain so you hear the shift
assert(/const GEARS=5, _g=Math\.min\(GEARS-1, Math\.floor\(frac\*GEARS\)\), _rpm=\(frac\*GEARS\)-_g;/.test(eu), 'speed maps to a gear + an in-gear RPM (0..1)');
assert(/const _revHz=\(58 \+ _g\*7\) \+ _rpm\*130 \+ \(throttle>0\?18:0\);/.test(eu), 'rev pitch = gear base + in-gear RPM (drops on each upshift)');
assert(/if\(_g>_eng\._gear\) _eng\._shiftT=t\+0\.13;/.test(eu) && /const _shift=\(_eng\._shiftT && t<_eng\._shiftT\)\?0\.5:1;/.test(eu), 'an upshift opens a short window that ducks the volume (clutch dip)');
assert(/if\(!_airb && Math\.abs\(throttle\)<0\.01 && Math\.abs\(r\.speed\)>0\.4\) r\.speed \*= \(1 - Math\.min\(0\.4, 0\.8\*dt\)\);/.test(extractFunction('driveUpdate')), 'build 731/824: engine braking slows the car when off the throttle — wheels on the ground only');
// executable: RPM resets down at each gear boundary (the upshift)
{ const GEARS=5, rev=frac=>{ const g=Math.min(GEARS-1,Math.floor(frac*GEARS)), rpm=(frac*GEARS)-g; return (58+g*7)+rpm*130; };
  assert(rev(0.199) > rev(0.201), 'crossing into the next gear drops the revs (an upshift)');
  // and with the real-top-speed scaling, a fast car still shifts across the range (not pinned at frac=1)
  const fr=(spd,top)=>Math.min(1,Math.abs(spd)/Math.max(6,top||16));
  assert(fr(20,60) < 0.4 && fr(50,60) > 0.8, 'a 60-unit car spreads the gears across its whole range (20 vs 50 land in different gears)'); }
assert(/e\.o\.stop\(t\+0\.2\)/.test(extractFunction('_engStop')) && /e\.o\.disconnect\(\)/.test(extractFunction('_engStop')), 'stop ramps down, stops, and disconnects the nodes (no leak)');

// --- lifecycle: start + show on enter, stop + hide on exit, killed on deploy ---
assert(/_engStart\(\); _driveHudEl\(\)\.style\.display='block';/.test(extractFunction('enterCar')), 'entering a car starts the engine + shows the HUD');
assert(/_engStop\(\); \{ const _dh=document\.getElementById\('driveHud'\); if\(_dh\) _dh\.style\.display='none';/.test(extractFunction('exitCar')), 'exiting stops the engine + hides the HUD');
assert(/if\(typeof _engStop==='function'\) _engStop\(\);/.test(extractFunction('startGame')), 'deploy kills any lingering engine sound');

// --- per-frame update: engine + speedometer (km/h + bar) ---
const du = extractFunction('driveUpdate');
assert(/_engUpdate\(r\.speed, throttle, _slip, cfg\.maxSpeed\);/.test(du), 'the engine is updated each frame with speed + throttle + slip + the top speed (build 793 gearbox scaling)');
assert(/const U=_SPEED_UNIT\[cfg\.units\]\|\|_SPEED_UNIT\.kph;/.test(du) && /v\.textContent=Math\.round\(Math\.abs\(r\.speed\)\*U\.f\)/.test(du), 'speed shown in the vehicle’s unit (km/h or mph)');
assert(/un\.textContent=U\.l/.test(du), 'the unit label tracks the setting');
assert(/const _frac=Math\.min\(1, Math\.abs\(r\.speed\)\/Math\.max\(1,cfg\.maxSpeed\)\);/.test(du) && /a\.style\.strokeDashoffset=\(245\*\(1-_frac\)\)\.toFixed\(1\);/.test(du), 'build 743: the circular gauge fills toward top speed (arc dashoffset)');
assert(/a\.style\.stroke = _frac>0\.8\?'#ff5a5a':\(_frac>0\.55\?'#ffd166':'var\(--accent\)'\)/.test(du), 'the gauge tints accent -> amber -> red with speed (build 814: themed base)');

// --- the HUD element + its styles exist ---
const dh = extractFunction('_driveHudEl');
assert(/el\.id='driveHud'/.test(dh) && /id="dhVal"/.test(dh) && /class="dhGauge"/.test(dh) && /id="dhArc"/.test(dh), 'the driveHud element is a circular gauge carrying the speed value');
assert(/#driveHud \{ position:fixed;[^}]*display:none;/.test(html), 'driveHud is hidden by default (shown only while driving)');

// --- build 728: tyre screech (slip-driven noise) + skid marks ---
const es2 = extractFunction('_engStart');
assert(/src\.loop=true;/.test(es2) && /bp\.type='bandpass'/.test(es2) && /scr=\{ src, bp, g:sg \};/.test(es2), 'engine start also builds a looping bandpassed noise loop for screech');
assert(/const sl=Math\.max\(0, Math\.min\(1, \(\(slip\|\|0\)-0\.2\)\/0\.9\)\) \* Math\.min\(1, Math\.abs\(speed\)\/6\);/.test(extractFunction('_engUpdate')), 'screech gain follows slip * speed (silent until you slide and move)');
assert(/if\(e\.scr\)\{ e\.scr\.g\.gain\.setTargetAtTime\(0\.0001, t, 0\.05\); try\{ e\.scr\.src\.stop\(t\+0\.2\); \}catch/.test(extractFunction('_engStop')), 'engine stop also ramps down + stops the screech (no leak)');
const ds2 = extractFunction('_dropSkid'), fs = extractFunction('_fadeSkids');
assert(/_skidYawQ\.setFromAxisAngle\(_skidUp, yaw\); m\.quaternion\.copy\(_skidYawQ\)\.multiply\(_skidFlatQ\);/.test(ds2), 'a skid mark is laid flat and spun to the car yaw');
assert(/m\.material\.opacity=o; m\.userData\.skidOp=o; m\.userData\.skidLife=9;/.test(ds2) && /const l=\(m\.userData\.skidLife-=dt\);/.test(fs), 'skid marks carry a life + per-mark opacity and fade out');
// build 736: soft textures (not flat squares) + lower opacity
assert(/_skidTex=new THREE\.CanvasTexture/.test(src) && /map:tex\|\|null/.test(extractFunction('_ensureSkidPool')), 'skid marks use a soft canvas texture');
assert(/_puffTex=new THREE\.CanvasTexture/.test(src) && /createRadialGradient/.test(src), 'dust uses a soft radial smoke texture');
assert(/const _DUST_OP=0\.16;/.test(src) && /const _SKID_OP=0\.34;/.test(src), 'dust + skids toned down to faint opacities (build 736)');
assert(/const _sliding=\(_slip>0\.3 \|\| handbrake\);/.test(du) && /if\(_skidAmt>0 && _grounded && _sliding && Math\.abs\(r\.speed\)>3\)\{/.test(du), 'skid marks drop only while grounded + sliding/braking + moving (and the effect is on)');
assert(/_dropSkid\(_rbx \+ _rx\*_hw\*0\.7, gC, _rbz \+ _rz\*_hw\*0\.7, carYaw, _SKID_OP\*_skidAmt\);/.test(du), 'a mark is dropped under each rear tyre, scaled by the Skid-marks amount');
// build 738: editor amounts for smoke + skids (0 = off), serialized
assert(/const _skidAmt=\(cfg\.skid==null\?1:\+cfg\.skid\), _dustAmt=\(cfg\.dust==null\?1:\+cfg\.dust\);/.test(du), 'editor Tyre-smoke + Skid-marks amounts are read');
assert(/dust:\(v\.dust==null\?1:Math\.max\(0, Math\.min\(2, \+v\.dust\|\|0\)\)\), skid:\(v\.skid==null\?1:Math\.max\(0, Math\.min\(2, \+v\.skid\|\|0\)\)\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores smoke + skid amounts (default 1)');
assert(/row\('Tyre smoke','dust', 0, 2, 0\.05, 1\)/.test(src) && /row\('Skid marks','skid', 0, 2, 0\.05, 1\)/.test(src), 'editor exposes Tyre smoke + Skid marks sliders');
assert(/if\(V\.dust!=null && V\.dust!==1\) e\.veh\.dust=V\.dust; if\(V\.skid!=null && V\.skid!==1\) e\.veh\.skid=V\.skid;/.test(src), 'smoke + skid amounts serialized when non-default');
assert(/if\(typeof _clearSkids==='function'\) _clearSkids\(\);/.test(extractFunction('startGame')), 'deploy clears any lingering skid marks');

// build 732: tyre dust — billboarded puffs off the rear tyres under power / slides / boost
const ud = extractFunction('_updateDust');
assert(/m\.position\.x\+=d\.vx\*dt; m\.position\.y\+=d\.vy\*dt; m\.position\.z\+=d\.vz\*dt; d\.vy\*=\(1-0\.7\*dt\);/.test(ud), 'dust puffs drift + rise with decaying upward velocity');
assert(/m\.material\.opacity=d\.op\*f; m\.scale\.setScalar\(m\.scale\.x \+ dt\*1\.4\);/.test(ud) && /m\.lookAt\(camPos\)/.test(ud), 'dust grows softly + fades and billboards to the camera');
assert(/const _dustI=\(_sliding\?1\.5:\(_boosting\?1\.2:0\.55\)\)\*_dustAmt;/.test(du) && /const _every=_sliding\?0\.05:0\.075;/.test(du), 'dust is a faint continuous haze, thicker on slides/boost, scaled by the Tyre-smoke amount');
assert(/_spawnDust\(_rbx \+ _rx\*_hw\*0\.6, gC\+0\.2, _rbz \+ _rz\*_hw\*0\.6, -hx\*r\.speed, -hz\*r\.speed, _dustI\);/.test(du), 'dust spawns at the rear tyres, thrown back along travel, scaled by intensity');
assert(/_fadeSkids\(dt\); _updateDust\(dt, camera && camera\.position\);/.test(du), 'skids + dust update each frame');
assert(/if\(typeof _clearDust==='function'\) _clearDust\(\);/.test(extractFunction('startGame')), 'deploy clears lingering dust too');

// build 738: the crosshair hides while driving and returns on exit / deploy
assert(/const _cx=document\.getElementById\('crosshair'\); if\(_cx\) _cx\.style\.display='none';/.test(extractFunction('enterCar')), 'the crosshair is hidden on entering a vehicle');
assert(/const _cx=document\.getElementById\('crosshair'\); if\(_cx\) _cx\.style\.display='';/.test(extractFunction('exitCar')), 'the crosshair returns on exit');

// build 749: custom car SFX — engine clip loop (else synth) + brake / skid / boost one-shots
const es3 = extractFunction('_engStart'), eu3 = extractFunction('_engUpdate');
assert(/const engUrl=\(typeof curSounds==='function'\)\?curSounds\(\)\.carEngine:'';/.test(es3) && /es\.loop=true;/.test(es3), 'a set engine clip is looped (else the synth osc is used)');
assert(/if\(_eng\.sample\)\{ _eng\.sample\.src\.playbackRate\.setTargetAtTime\(\(0\.6 \+ _g\*0\.14 \+ _rpm\*0\.95/.test(eu3) && /else if\(_eng\.o\)\{/.test(eu3), 'the engine clip pitch steps down on each gear + climbs with RPM; the synth path is the fallback (build 793)');
assert(/playSample\(curSounds\(\)\.carBoost\)/.test(du), 'boost plays the car-boost clip');
assert(/if\(handbrake && !o\.userData\._hbWas && o\.userData\._carGrounded!==false && Math\.abs\(o\.userData\.carSpeed\|\|0\)>3 && typeof playSample==='function'\) playSample\(curSounds\(\)\.carBrake\);/.test(du), 'the handbrake plays the brake clip on its rising edge — only when grounded (build 754)');
assert(/if\(_sliding && !o\.userData\._slideWas && _grounded && Math\.abs\(r\.speed\)>4 && typeof playSample==='function'\) playSample\(curSounds\(\)\.carSkid\);/.test(du), 'a starting slide plays the skid clip (grounded only, build 754)');
// build 754: the grounded flag is persisted each frame so the (earlier) brake-SFX check can suppress a mid-air screech
assert(/const _grounded=\(_ny-_rest\)<0\.12; o\.userData\._carGrounded=_grounded;/.test(du), 'the per-frame grounded state is stored on the prop for the brake-SFX gate');

done('build 715-749: driving HUD + engine(+clip) + screech + skids + gearbox + dust + sliders + crosshair + car SFX');
