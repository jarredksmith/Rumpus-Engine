import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 612: live camera-preview window for cinematic editing — a scissored PiP of the actual shot camera.

// gating helper
const sh = extractFunction('_cinePvShot');
assert(/if\(!editorOpen\) return null;/.test(sh), 'no preview outside the editor');
assert(/return \(s && s\.path && s\.path\.length>=1\) \? s : null;/.test(sh), 'needs a shot with at least one waypoint');

// ---- executable: preview camera framing mirrors updateCinematic (pos + lens ramp) ----
const deps = `const camera={near:0.1,far:1200}; const EYE=1.6; let playerSpawn={x:0,z:0};
const terrainHeightAt=()=>0; function lensToFov(mm){ const f=Math.max(8,+mm||35); return 2*Math.atan((24/2)/f)*180/Math.PI; }
function pointAlongPath(poly,t){ const i=t*(poly.length-1), a=Math.floor(i), b=Math.min(poly.length-1,a+1), f=i-a; const p=poly[a],q=poly[b]; return [p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f,p[2]+(q[2]-p[2])*f]; }
function _cineEase(t,m){ t=Math.max(0,Math.min(1,t)); return m==='linear'?t:m==='in'?t*t:m==='out'?t*(2-t):t*t*(3-2*t); }
function _cineSamplePoly(s){ return s.path.map(q=>[q[0],q[1],q[2]]); }
${extractFunction('_normCineShot')}
function Cam(){ this.position={ v:null, set(x,y,z){ this.v=[x,y,z]; } }; this.up={set(){}}; this.fov=50; this.lookAt=function(){}; this.rotateZ=function(){}; this.updateProjectionMatrix=function(){}; }
const THREE={ PerspectiveCamera: Cam };
let _cinePvCam=null;`;
const frame = (path, u, extra)=> new Function(
  deps + '\n' + extractFunction('_cinePvFrameAt') +
  '\nconst shot=Object.assign({ path:'+JSON.stringify(path)+', lensFrom:35, lensTo:35, dur:6, look:"spawn", ease:"linear" }, '+JSON.stringify(extra||{})+');' +
  '\n_cinePvFrameAt(shot, '+u+'); return { pos:_cinePvCam.position.v, fov:_cinePvCam.fov };')();
let r = frame([[0,0,0],[10,0,0]], 0.5, {});
near(r.pos[0], 5, 1e-6, 'midpoint of a 2-point linear path is halfway along it');
r = frame([[0,0,0],[10,0,0]], 0.5, {lensFrom:20, lensTo:60});
near(r.fov, 2*Math.atan((24/2)/40)*180/Math.PI, 1e-6, 'lens keyframe ramps in the preview (40mm at midpoint)');
r = frame([[2,3,4]], 0, {});
assert(r.pos[0]===2 && r.pos[1]===3 && r.pos[2]===4, 'single-waypoint shot frames from that point');

// render wiring
const rw = extractFunction('_renderCinePvWindow');
assert(/if\(!editorOpen \|\| !_cinePvOn \|\| _cineActive\)\{ if\(_cinePvPanel\) _cinePvPanel\.style\.display='none'; _blankCinePvWindow\(\); return; \}/.test(rw), 'hidden when not editing / toggled off / during playback (build 662: also blanks the pop-out)');
assert(/renderer\.setScissorTest\(true\); renderer\.setViewport\(X, Yb, Wr, Hr\); renderer\.setScissor\(X, Yb, Wr, Hr\)/.test(rw), 'renders into a scissored corner viewport');
assert(/renderer\.render\(scene, _cinePvCam\)/.test(rw), 'previews the real scene through the cinematic camera');
assert(/renderer\.setScissorTest\(false\); renderer\.setViewport\(0,0,size\.x,size\.y\)/.test(rw), 'restores the full viewport after');
assert(/renderer\.shadowMap\.autoUpdate=false;[\s\S]*renderer\.shadowMap\.autoUpdate=sa/.test(rw), 'skips a redundant shadow rebuild for the second pass');
assert(/for\(const o of \[_cinePreviewGroup,/.test(rw), 'hides editor-only overlays (path dashes, gizmo) in the framing');
assert(/_cinePvPanel\.style\.left = dockLeft \? 'auto' : M\+'px'; _cinePvPanel\.style\.right = dockLeft \? M\+'px' : 'auto';/.test(rw), 'auto-corner sits opposite the editor dock');

// loop hook + toggle + scrubber
assert(/renderScene\(scene, activeCam\(\)\);\n  if\(editorOpen && typeof _renderCinePvWindow==='function'\) _renderCinePvWindow\(\);/.test(src), 'driven each editor frame, after the main render');
assert(/localStorage\.setItem\('breach_cinepv', _cinePvOn\?'on':'off'\)/.test(src), 'preview on/off persists');
assert(/sld\.oninput=\(\)=>\{ _cinePvT=\+sld\.value; \}/.test(src), 'the panel scrubber drives the preview parameter');
assert(/Camera preview window/.test(src), 'editor exposes a camera-preview toggle');

done('cinematic camera preview: live PiP framing, scrubbable, editor-only (build 612)');
