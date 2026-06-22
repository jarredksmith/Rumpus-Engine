import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 614: the preview window now shows the shot's depth of field (rack focus), not just framing.

// ---- executable: _cinePvFrameAt computes the shot's DoF at the scrub point (mirrors updateCinematic) ----
const deps = `const camera={near:0.1,far:1200}; const EYE=1.6; let playerSpawn={x:0,z:0};
const terrainHeightAt=()=>0; function lensToFov(mm){ const f=Math.max(8,+mm||35); return 2*Math.atan((24/2)/f)*180/Math.PI; }
function pointAlongPath(poly,t){ const i=t*(poly.length-1), a=Math.floor(i), b=Math.min(poly.length-1,a+1), f=i-a; const p=poly[a],q=poly[b]; return [p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f,p[2]+(q[2]-p[2])*f]; }
function _cineEase(t,m){ t=Math.max(0,Math.min(1,t)); return m==='linear'?t:m==='in'?t*t:m==='out'?t*(2-t):t*t*(3-2*t); }
function _cineSamplePoly(s){ return s.path.map(q=>[q[0],q[1],q[2]]); }
${extractFunction('_normCineShot')}
function Cam(){ this.position={ set(){} }; this.up={set(){}}; this.fov=50; this.near=0; this.far=0; this.lookAt=function(){}; this.rotateZ=function(){}; this.updateProjectionMatrix=function(){}; }
const THREE={ PerspectiveCamera: Cam };
let _cinePvCam=null, _pvDofOn=false, _pvDofFocus=0, _pvDofRange=0, _pvDofStrength=0;`;
const probe = (extra, u)=> new Function(
  deps + '\n' + extractFunction('_cinePvFrameAt') +
  '\nconst shot=Object.assign({ path:[[0,0,0],[10,0,0]], lensFrom:35, lensTo:35, dur:6, look:"spawn", ease:"linear" }, '+JSON.stringify(extra)+');' +
  '\n_cinePvFrameAt(shot, '+u+'); return { on:_pvDofOn, focus:_pvDofFocus, range:_pvDofRange, strength:_pvDofStrength };')();

let r = probe({ focusOn:false }, 0.5);
assert(r.on===false, 'no focus flag when the shot has no rack focus');
r = probe({ focusOn:true, focusFrom:4, focusTo:12, dofRange:6, dofStrength:0.5, dofStrengthTo:2.5 }, 0.5);
assert(r.on===true, 'focus flagged for a focusOn shot');
near(r.focus, 8, 1e-6, 'focus distance ramps 4->12 (=8 at midpoint)');
near(r.range, 6, 1e-6, 'focus band comes from the shot');
near(r.strength, 1.5, 1e-6, 'blur strength ramps 0.5->2.5 (=1.5 at midpoint)');

// ---- the PiP DoF render: own targets, same blur shaders, corner present ----
const pd = extractFunction('_renderPvDof');
assert(/new THREE\.WebGLRenderTarget\(Wd,Hd/.test(pd) && /_pvDofRT\.depthTexture = new THREE\.DepthTexture\(Wd,Hd\)/.test(pd), 'allocates its own PiP-sized color+depth targets');
assert(/renderer\.setScissorTest\(false\);\n  renderer\.setRenderTarget\(_pvDofRT\); renderer\.setViewport\(0,0,W,H\); renderer\.render\(scene, _cinePvCam\)/.test(pd), 'pass 1: scene -> offscreen, scissor off');
assert(/_dofMatH\.uniforms\.tColor\.value=_pvDofRT\.texture; _dofMatH\.uniforms\.tDepth\.value=_pvDofRT\.depthTexture; _dofQuad\.material=_dofMatH;\n  renderer\.setRenderTarget\(_pvDofRT2\)/.test(pd), 'pass 2: horizontal blur reuses the DoF shader into RT2');
assert(/_dofMatV\.uniforms\.tColor\.value=_pvDofRT2\.texture[\s\S]*renderer\.setScissorTest\(true\); renderer\.setViewport\(X,M,W,H\); renderer\.setScissor\(X,M,W,H\); renderer\.render\(_dofScene,_dofCam\)/.test(pd), 'pass 3: vertical blur presents into the scissored corner');
assert(/u\.uFocus\.value=_pvDofFocus; u\.uRange\.value=_pvDofRange; u\.uStrength\.value=_pvDofStrength; u\.uTexel\.value\.set\(1\/Wd,1\/Hd\)/.test(pd), 'shot DoF params drive the blur shader');

// the window routes to DoF only when the shot has focus (and not on mobile)
const rw = extractFunction('_renderCinePvWindow');
assert(/if\(_pvDofOn && !IS_COARSE && typeof ensureDof==='function' && ensureDof\(\)\)\{\n    try\{ _renderPvDof\(X, Yb, Wr, Hr\)/.test(rw), 'DoF path chosen for focus shots, plain render otherwise');
assert(/\} else \{\n    renderer\.setScissorTest\(true\); renderer\.setViewport\(X, Yb, Wr, Hr\); renderer\.setScissor\(X, Yb, Wr, Hr\);\n    try\{ renderer\.render\(scene, _cinePvCam\)/.test(rw), 'non-focus shots still get the plain corner render');

done('preview window DoF: shot rack focus shown in the PiP, own targets + shared shaders (build 614)');
