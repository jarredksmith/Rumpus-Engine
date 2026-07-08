// (build 788) Mobile gets a dedicated on-screen driving cluster that swaps in for the combat buttons while you're in a
// car: BOOST + BRAKE (held), and LIGHTS / VIEW / CAM / EXIT (tap). Entering a car adds body.driving (CSS swaps the
// buttons); leaving removes it and drops any held driving input.
import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// --- the buttons exist in the touch UI markup ---
for(const id of ['tBoost','tBrake','tLights','tView','tFollow','tExit'])
  assert(new RegExp('id="'+id+'"[^>]*class|class="tBtn dBtn" id="'+id+'"').test(html) || new RegExp('id="'+id+'"').test(html), 'driving button markup exists: '+id);
assert(/class="tBtn dBtn" id="tBoost"/.test(html), 'the driving buttons carry the dBtn class');

// --- CSS: hidden by default, shown (and combat buttons hidden) only while driving on touch ---
assert(/\.dBtn \{ display:none; \}/.test(html), 'driving buttons are hidden by default');
assert(/body\.touch\.driving \.dBtn \{ display:flex; \}/.test(html), 'the cluster shows while driving on touch');
assert(/body\.touch\.driving #tFire, body\.touch\.driving #tAim,[\s\S]*?#tChat \{ display:none !important; \}/.test(html), 'the combat buttons (including the build-908 six) hide while driving');

// --- held flags declared + reset ---
assert(/let touchBoost=false, touchHandbrake=false;/.test(src), 'the mobile driving hold flags are declared');

// --- button wiring: held gas/brake + tap toggles ---
const wire = src;
assert(/hold\('tBoost', \(\)=>touchBoost=true, \(\)=>touchBoost=false\);/.test(wire), 'Boost is a held button -> touchBoost');
assert(/hold\('tBrake', \(\)=>touchHandbrake=true, \(\)=>touchHandbrake=false\);/.test(wire), 'Brake is a held button -> touchHandbrake');
assert(/tap\('tLights', \(\)=>\{ if\(typeof _carCycleHeadlights==='function'\) _carCycleHeadlights\(\); \}\);/.test(wire), 'Lights taps the headlight toggle');
assert(/tap\('tView',\s*\(\)=>\{ if\(typeof _carCycleView==='function'\) _carCycleView\(\); \}\);/.test(wire), 'View taps the camera-view toggle');
assert(/tap\('tFollow', \(\)=>\{ if\(typeof _carCycleFollow==='function'\) _carCycleFollow\(\); \}\);/.test(wire), 'Cam taps the follow-cam toggle');
assert(/tap\('tExit',\s*\(\)=>\{ if\(typeof exitCar==='function'\) exitCar\(\); \}\);/.test(wire), 'Exit taps out of the car');

// --- body.driving is toggled on enter/exit; held inputs drop on exit ---
assert(/document\.body\.classList\.add\('driving'\);/.test(extractFunction('enterCar')), 'entering a car adds body.driving');
const ex = extractFunction('exitCar');
assert(/touchBoost=false; touchHandbrake=false;/.test(ex), 'leaving a car drops any held driving input');
assert(/document\.body\.classList\.remove\('driving'\);/.test(ex), 'leaving a car removes body.driving');

done('build 788: mobile on-screen driving control cluster');
