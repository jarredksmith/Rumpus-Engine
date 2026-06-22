import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 610: per-shot hold/dwell — freeze the framing for holdStart before the move and holdEnd after it.

// ---- executable: time mapping holds at both ends, travels (eased) in the middle ----
const deps = `let dofEnabled=false,dofFocus=18,dofRange=14,dofStrength=1.4,IS_COARSE=true;
let _capt={x:null};
let camera={fov:60,position:{copy(v){_capt.x=v.x;},set(){}},lookAt(){},rotateZ(){},updateProjectionMatrix(){},quaternion:{clone:()=>({})}};
let _cineV0={set(x){this.x=x;},copy(){},distanceToSquared:()=>9,x:0,y:0,z:0}, _cineTgt={set(){},distanceToSquared:()=>9};
let playerSpawn={x:0,z:0}; const terrainHeightAt=()=>0, EYE=1.6; const lensToFov=l=>l; let _cineShots=null,_cineShotIdx=0,_cineT=0,_cineData=null;
function pointAlongPath(poly,t){ return [t*100,0,0]; } function endCinematic(){ _cineData=null; } const _cineAvatar=null;`;
const build = (at)=> new Function(deps+'\n'+extractFunction('_cineEase')+'\n'+extractFunction('updateCinematic')+'\n'+
  'const d={ path:[[0,0,0],[100,0,0]], lensFrom:35,lensTo:35, focusOn:false, dur:10, look:"spawn", ease:"linear", holdStart:2, holdEnd:3 };'+
  '_cineData=d; _cineT='+at+';'+
  'updateCinematic(0); return { x:_capt.x, ended:_cineData===null };')();
near(build(1).x, 0, 1e-6, 'during the start hold (t=1s<2s), camera sits at the first point');
near(build(2).x, 0, 1e-6, 'at the end of the start hold, still at the first point');
near(build(7).x, 50, 1e-6, 'mid-travel (2s hold + 5s of 10s, linear) -> halfway down the path');
near(build(12).x, 100, 1e-6, 'during the end hold (after hold+dur), parked at the last point');
assert(build(15.1).ended===true, 'shot ends only after holdStart + dur + holdEnd (2+10+3=15s)');
assert(build(14).ended===false, 'shot is NOT over while still in the end hold');

// wiring
const uc = extractFunction('updateCinematic');
assert(/const _hs=\+d\.holdStart\|\|0, _he=\+d\.holdEnd\|\|0, _total=_hs\+d\.dur\+_he;/.test(uc), 'total time accounts for both holds');
assert(/let t = _cineT<=_hs \? 0 : \(_cineT>=_hs\+d\.dur \? 1 : \(_cineT-_hs\)\/d\.dur\)/.test(uc), 'travel param holds 0 then 1 at the ends');
assert(/if\(_cineT>=_total\)\{/.test(uc), 'shot advances on total (incl. holds), not bare duration');

// plumbing + persistence
const H="holdStart:Math.max(0,+s.holdStart||0), holdEnd:Math.max(0,+s.holdEnd||0)";
assert(extractFunction('_resShot').includes(H), '_resShot clamps holds >= 0');
assert(extractFunction('_normCineShot').includes(H), '_normCineShot carries holds');
assert(/ease:'inout', holdStart:0, holdEnd:0 \}; \}/.test(extractFunction('_newCineShot')), '_newCineShot seeds holds');
assert(/ease:'inout', holdStart:0, holdEnd:0, audio:''/.test(extractFunction('_newCutscene')), '_newCutscene seeds holds');
const ac=extractFunction('_applyCine');
assert(/cineCfg\.holdStart=Math\.max\(0,\+lc\.holdStart\|\|0\); cineCfg\.holdEnd=Math\.max\(0,\+lc\.holdEnd\|\|0\)/.test(ac), '_applyCine restores holds');
assert(/cineCfg\.holdStart=0; cineCfg\.holdEnd=0;/.test(ac), '_applyCine defaults holds');
assert(/ease:s\.ease, holdStart:s\.holdStart, holdEnd:s\.holdEnd \}/.test(src), 'serialized shots carry holds');
assert(/ease: cineCfg\.ease, holdStart: cineCfg\.holdStart, holdEnd: cineCfg\.holdEnd, audio/.test(src), 'serialized intro carries holds');
assert(/ease:o\.ease, holdStart:o\.holdStart, holdEnd:o\.holdEnd, shots2:/.test(src), 'serialized cutscenes carry holds');
// editor
assert(/crow\('Hold start', \(CS\.holdStart\|\|0\), 0, 10, 0\.25, 's', v=>\{ CS\.holdStart=v; \}\)/.test(src), 'editor has a Hold start slider');
assert(/crow\('Hold end', \(CS\.holdEnd\|\|0\), 0, 10, 0\.25, 's', v=>\{ CS\.holdEnd=v; \}\)/.test(src), 'editor has a Hold end slider');

done('cinematic hold/dwell: framing freezes at both ends, total = hold+dur+hold (build 610)');
