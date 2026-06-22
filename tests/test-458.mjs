import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 604: cinematic DoF is independent of world DoF, with focus + blur keyframing.

// --- executable: a focusOn shot drives its OWN dofFocus/dofRange/dofStrength, ramped ---
const deps = `let dofEnabled=false,dofFocus=18,dofRange=14,dofStrength=1.4,IS_COARSE=false;
let camera={fov:60,position:{copy(){},set(){}},lookAt(){},updateProjectionMatrix(){},quaternion:{clone:()=>({})}};
let _cineV0={set(){},copy(){},distanceToSquared:()=>9,x:0,y:0,z:0}, _cineTgt={set(){},distanceToSquared:()=>9};
let playerSpawn={x:0,z:0}; const terrainHeightAt=()=>0, EYE=1.6; const lensToFov=l=>l; let _cineShots=null,_cineShotIdx=0,_cineT=0,_cineData=null;
function pointAlongPath(){return [0,0,0];} function endCinematic(){} const _cineAvatar=null;`;
const run = new Function('return (function(){ '+deps+'\n'+extractFunction('_cineEase')+'\n'+extractFunction('updateCinematic')+'\n'+
  'const d={ path:[[0,0,0],[10,0,0]], lensFrom:35,lensTo:35, focusOn:true, focusFrom:4, focusTo:12, dur:10, look:"spawn", dofRange:6, dofStrength:0.5, dofStrengthTo:2.5 };'+
  '_cineData=d; _cineT=0;'+
  'updateCinematic(5);'+   // halfway: te = smoothstep(0.5)=0.5
  'return { dofEnabled, dofFocus, dofRange, dofStrength }; })')();
const r = run();
assert(r.dofEnabled===true, 'focusOn force-enables DoF for the shot');
near(r.dofFocus, 8, 0.01, 'focus distance ramps (4->12 at midpoint = 8)');
eq(r.dofRange, 6, 'shot drives its own focus band, not the world');
near(r.dofStrength, 1.5, 0.01, 'blur strength keyframes (0.5->2.5 at midpoint = 1.5)');

// --- wiring: independence (save/restore world look) ---
assert(/dofR:dofRange, dofS:dofStrength/.test(extractFunction('startCinematic')), 'world DoF range+strength saved on start');
const ec = extractFunction('endCinematic');
assert(/if\(_cineReturn\.dofR!=null\) dofRange=_cineReturn\.dofR; if\(_cineReturn\.dofS!=null\) dofStrength=_cineReturn\.dofS/.test(ec), 'world DoF range+strength restored on end');
const uc = extractFunction('updateCinematic');
assert(/if\(d\.dofRange!=null\) dofRange = d\.dofRange/.test(uc), 'playback overrides range from the shot');
assert(/const sTo=\(d\.dofStrengthTo!=null\?d\.dofStrengthTo:d\.dofStrength\); dofStrength = d\.dofStrength \+ \(sTo - d\.dofStrength\)\*te/.test(uc), 'playback ramps blur strength');

// --- persistence + editor ---
assert(/dofRange:\+s\.dofRange\|\|14, dofStrength:\(s\.dofStrength!=null\?\+s\.dofStrength:1\.4\)/.test(extractFunction('_resShot')), 'per-shot DoF restores with the level');
assert(/dofRange: cineCfg\.dofRange, dofStrength: cineCfg\.dofStrength, dofStrengthTo: cineCfg\.dofStrengthTo/.test(extractFunction('serializeLevel')), 'per-shot DoF saves with the level');
assert(/crow\('Blur start',/.test(src) && /crow\('Blur end',/.test(src) && /crow\('Focus band',/.test(src), 'editor exposes blur start/end + focus band');
assert(/CS\.dofStrength=v/.test(src) && /CS\.dofStrengthTo=v/.test(src) && /CS\.dofRange=v/.test(src), 'sliders write the per-shot DoF fields');

done('cinematic DoF: independent of world, focus + blur keyframed, persisted (build 604)');
