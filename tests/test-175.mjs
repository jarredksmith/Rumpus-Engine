import { gameSource, extractFunction, evalIn, assert, near, done } from './harness.mjs';
const src = gameSource();
const _terrainPaint = evalIn(extractFunction('_terrainPaint'));
const N = 21, ARENA = 70, mk = () => new Array(N*N).fill(0);
const idx = (r,c) => r*N+c;
const center = Math.floor(N/2);

// raise lifts the centre, leaves far corners untouched, and respects the radial falloff
let h = mk();
_terrainPaint(h, N, ARENA, 0, 0, 25, 4, 'raise');
assert(h[idx(center,center)] > 3.5, 'raise lifts the brush centre');
assert(h[idx(0,0)] === 0, 'corner outside radius is untouched');
assert(h[idx(center,center)] > h[idx(center,center+1)], 'falloff: centre rises more than its neighbour');

// lower digs down
h = mk(); _terrainPaint(h, N, ARENA, 0, 0, 25, 4, 'lower');
assert(h[idx(center,center)] < -3.5, 'lower digs the centre down');

// clamp at +/-60
h = mk(); for(let k=0;k<400;k++) _terrainPaint(h, N, ARENA, 0, 0, 25, 4, 'raise');
assert(h[idx(center,center)] <= 60 + 1e-9, 'height clamps at +60');

// smooth pulls a lone spike toward its neighbours (lowers a high centre surrounded by zeros)
h = mk(); h[idx(center,center)] = 30;
_terrainPaint(h, N, ARENA, 0, 0, 25, 1, 'smooth');
assert(h[idx(center,center)] < 30 && h[idx(center,center)] > 0, 'smooth relaxes a spike toward neighbours');

// outside-radius cells never change regardless of mode
h = mk(); _terrainPaint(h, N, ARENA, 0, 0, 10, 5, 'raise');
const farCol = center + Math.ceil((12/ (ARENA*2)) * (N-1)) + 2;   // a column well beyond 10 units
assert(h[idx(center, farCol)] === 0, 'cells beyond the radius stay flat');

// wiring assertions: brush is wired into the editor pointer flow + UI
assert(/if\(terrainBrush\.on && terrainPointUnderPointer\(e\)\)\{ pushUndoSnapshot\(\); _brushStroke\(e\); _brushing = true;/.test(src), 'mousedown does not start a brush stroke');
assert(/if\(_brushing\)\{ _brushStroke\(e\); editorDragMoved = true; return; \}/.test(src), 'mousemove does not continue the stroke');
assert(/if\(_brushing\)\{ _brushing = false;/.test(src), 'mouseup does not end the stroke');
assert(/Terrain brush \\u2014 sculpt \/ paint \/ scatter \(drag the floor \\u00b7 B toggles\)/.test(src), 'brush UI toggle missing');   // build 882: renamed again when the B hotkey landed
assert(/raycaster\.intersectObject\(floor, false\)/.test(src), 'terrainPointUnderPointer must raycast the floor mesh');
done();
