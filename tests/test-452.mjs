import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 598: cinematic path interpolation modes (linear vs smooth Catmull-Rom).

// --- executable: the smoothing densifies and passes through every waypoint ---
const mk = new Function(extractFunction('_catmullPt') + '\n' + extractFunction('_cineSmoothPoly') + '\nreturn _cineSmoothPoly;')();
const wps = [[0,0,0],[10,0,0],[10,0,10],[0,0,10]];
const poly = mk(wps, 16);
assert(poly.length > wps.length*8, 'smooth path is densified into many samples');
// endpoints preserved exactly
near(poly[0][0], 0, 1e-6, 'curve starts at first waypoint'); near(poly[0][2], 0, 1e-6, 'curve starts at first waypoint z');
near(poly[poly.length-1][0], 0, 1e-6, 'curve ends at last waypoint x'); near(poly[poly.length-1][2], 10, 1e-6, 'curve ends at last waypoint z');
// interior waypoints lie ON the curve (Catmull-Rom interpolates its control points): each appears as a sample
const hit = (wp)=> poly.some(p=>Math.hypot(p[0]-wp[0],p[1]-wp[1],p[2]-wp[2])<1e-6);
assert(hit(wps[1]) && hit(wps[2]), 'curve passes through the interior waypoints');
// a curved sample bulges off the straight chord between wp1 and wp2's leg (proves it is not linear)
const off = poly.some(p=> p[2] < -0.01 || (p[0] > 10.01));
assert(off, 'smoothed path bows beyond the straight legs');
// fewer than 3 points -> falls back to the raw legs (smooth needs 3+)
eq(mk([[0,0,0],[5,0,0]],16).length, 2, '2-point path is left linear');

// --- wiring ---
const sp = extractFunction('_cineSamplePoly');
assert(/shot\.interp==='smooth' && path\.length>=3/.test(sp), 'sample poly only curves with smooth + 3+ points');
const nc = extractFunction('_normCineShot');
assert(/interp:\(s\.interp==='smooth'\?'smooth':'linear'\)/.test(nc) && /out\._poly =/.test(nc), 'normalized shot carries interp + precomputed poly');
const uc = extractFunction('updateCinematic');
assert(/const poly=d\._poly\|\|path;/.test(uc) && /pointAlongPath\(poly, te, false\)/.test(uc), 'playback rides the (possibly curved) poly');
// editor: line follows the curve, dropdown writes interp
assert(/_cineSamplePoly\(_curShot\)\.map\(q=>new THREE\.Vector3/.test(src), 'editor preview line follows the curve');
assert(/\['linear','Linear \(straight legs\)'\],\['smooth','Smooth \(curved\)'\]/.test(src), 'editor offers the Path dropdown');
assert(/CS\.interp=sel\.value; if\(typeof refreshCinePreview==='function'\) refreshCinePreview\(\)/.test(src), 'changing interp re-renders the preview');
// persistence
assert(/interp: cineCfg\.interp/.test(extractFunction('serializeLevel')), 'interp saves with the level');
assert(/interp:\(s\.interp==='smooth'\)\?'smooth':'linear'/.test(extractFunction('_resShot')), 'interp restores with the level');

done('cinematic interpolation: linear vs smooth Catmull-Rom, constant-speed, editor preview + persistence (build 598)');
