// build 1195: baked per-vertex ambient occlusion — interiors finally read as interiors.
//
// The rendering critic's #2 CRITICAL: a hand-built room was lit as if outdoors — hemisphere fill, env
// probe and bounce all arrive at full strength inside a windowless box, with only SSAO dissenting.
// Generated arenas have a real lightmap; creator levels (arbitrary GLBs, no UV2) get the per-vertex
// version: every vertex casts a fixed hemisphere of rays, colour = 0.35 + 0.65*skyVisibility, multiplied
// in by vertexColors. Occluders split by cost: OTHER colliders as overall boxes (slab test through the
// 1188 grid), the vertex's OWN model as real triangles (1097 BVH). This test executes the ray set, the
// slab test and the visibility integrator against real three geometry.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

// ---------------------------------------------------------------- the ray set
const DIRS = new Function('Math', 'return ' + src.match(/\(\(\)=>\{ const out=\[\], N=14, GA=[\s\S]{0,300}?return out; \}\)\(\)/)[0])(Math);
{
  eq(DIRS.length, 14, 'fourteen hemisphere directions');
  for (const d of DIRS) {
    near(Math.hypot(d[0], d[1], d[2]), 1, 1e-9, 'each is unit length');
    assert(d[1] > 0.1, '...and points into the upper hemisphere (y=' + d[1].toFixed(2) + ') — a bake ray never dives into the surface');
  }
  let minDot = 1;
  for (let i = 0; i < DIRS.length; i++) for (let j = i + 1; j < DIRS.length; j++)
    minDot = Math.min(minDot, 1 - (DIRS[i][0] * DIRS[j][0] + DIRS[i][1] * DIRS[j][1] + DIRS[i][2] * DIRS[j][2]));
  assert(minDot > 0.02, 'the golden-angle spiral spreads them (no two nearly collinear) — clumped rays alias the occlusion');
}

// ---------------------------------------------------------------- the slab test
{
  const rb = new Function(extractFunction('_bakeRayBox') + '\nreturn _bakeRayBox;')();
  const box = { min: { x: -1, y: 2, z: -1 }, max: { x: 1, y: 3, z: 1 } };
  eq(rb(0, 0, 0, 0, 1, 0, box, 22), true, 'a ray up into an overhead box hits');
  eq(rb(0, 0, 0, 1, 0, 0, box, 22), false, 'a sideways ray misses it');
  eq(rb(0, 0, 0, 0, -1, 0, box, 22), false, 'a ray away from it misses (no negative-t hits)');
  eq(rb(0, 5, 0, 0, 1, 0, box, 22), false, 'a ray starting past it misses');
  eq(rb(0, 2.95, 0, 0, 1, 0, box, 22), false, 'a surface-adjacent box inside the 0.15 near-clip does NOT count — a vertex must not be shadowed by its own wall\'s box');
  eq(rb(4, 0, 4, 0, 1, 0, box, 22), false, 'outside the slab on a zero-component axis');
  eq(rb(0, 0, 0, 0, 1, 0, { min: { x: -1, y: 30, z: -1 }, max: { x: 1, y: 31, z: 1 } }, 22), false, 'beyond the 22m range: the sky is not occluded by a tower a map away');
}

// ---------------------------------------------------------------- the visibility integrator, real three
{
  const mk = (boxes, self) => new Function('THREE', '_cgQuery', '_BAKE_DIRS', 'BAKE_RANGE',
    'const _bkRay = new THREE.Raycaster(); _bkRay.far = BAKE_RANGE;\n' +
    'const _bkO = new THREE.Vector3(), _bkD = new THREE.Vector3(), _bkN = new THREE.Vector3();\n' +
    'const _bkT = new THREE.Vector3(), _bkB = new THREE.Vector3(), _bkCand = [];\n' +
    extractFunction('_bakeRayBox') + '\n' + extractFunction('_bakeVisAt') + '\nreturn _bakeVisAt;'
  )(THREE, (a, b, c, d, out) => { out.length = 0; for (const bx of boxes) out.push(bx); return out; }, DIRS, 22);
  const B = (x0, y0, z0, x1, y1, z1) => ({ userData: { box: { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } } } });
  { const vis = mk([], null)(0, 0, 0, 0, 1, 0, null);
    eq(vis, 1, 'open sky: full visibility'); }
  { const vis = mk([B(-50, 2.5, -50, 50, 3.5, 50)], null)(0, 0, 0, 0, 1, 0, null);
    eq(vis, 0, 'a vast low roof overhead: zero — every upper-hemisphere ray hits it (a HIGH roof legitimately lets the shallowest rays escape within the 22m range)'); }
  { const vis = mk([B(0.5, 0, -50, 50, 30, 50)], null)(0, 1, 0, 0, 1, 0, null);
    assert(vis > 0.2 && vis < 0.8, 'a wall filling half the sky: partial (' + vis.toFixed(2) + ') — the integrator grades, it does not gate'); }
  { const self = new THREE.Mesh(new THREE.BoxGeometry(80, 0.4, 80), new THREE.MeshBasicMaterial());
    self.position.y = 3; self.updateMatrixWorld(true);
    const vis = mk([], self)(0, 0, 0, 0, 1, 0, self);
    eq(vis, 0, 'the vertex\'s OWN model occludes through real triangles — the roof of the building you are inside is the whole point'); }
  { const b = new THREE.Group(); b.userData.box = { min: { x: -50, y: 5, z: -50 }, max: { x: 50, y: 6, z: 50 } };
    const vis = mk([b], null)(0, 0, 0, 0, 1, 0, b);
    eq(vis, 1, '...but its own COLLIDER boxes are skipped (self tests as triangles, never as its own fat box)'); }
}

// ---------------------------------------------------------------- the job's invariants, pinned
{
  const tick = extractFunction('_bakeTick');
  // build 1432 restructured this through a local, because the job must HOLD the geometry it set up —
  // build 1431 swaps mesh.geometry between frames and the resumable job was reading whatever was drawn.
  // The intent here is untouched: a shared geometry is cloned once and marked, so copies of one GLB do
  // not bake over each other.
  assert(/g = g\.clone\(\); g\.userData\._bakeOwn = true;/.test(tick),
    'copies of one GLB share geometry — the bake writes into a private, marker-guarded clone');
  assert(/if\(!g\.userData\._bakeOwn\)\{/.test(tick), '...and only clones when it does not already own one');
  assert(/mesh\.geometry = g;/.test(tick), '...then the mesh draws the clone');
  assert(/if\(ms\.some\(m => _bakeMats\.has\(m\)\)\)/.test(tick) && /new Float32Array\(cnt \* 3\)\.fill\(1\)/.test(tick),
    'the shared-material invariant: any unbaked mesh sharing a baked material gets an all-white attribute — a missing attribute renders BLACK');
  assert(/if\(typeof _glbPending !== 'undefined' && _glbPending > 0\) return;/.test(tick),
    'the bake waits out model loads — bake what will actually be there');
  assert(/const sig = _bakeSig\(\);/.test(tick) && /if\(sig === _bakeDoneSig\)\{ _bakeDoneN = colliders\.length; return; \}/.test(tick),
    'a prop arriving or leaving after the bake re-requests it ONLY when the BAKE SET changed (build 1206: a mover/dynamic/wall toggle no longer restarts the bake — the late-GLB black-mesh hazard still triggers because a real bake prop changes the sig)');
  assert(/function _bakeSig\(\)\{ let n = 0; for\(const c of colliders\)\{ const u = c\.userData; if\(u && u\.src && !\(u\.phys \|\| u\.vehicle \|\| \(u\.xa && u\.xa\.on\)\)\) n\+\+; \} return n; \}/.test(gameSource()),
    'the signature counts exactly what _bakeCollect would gather — a static, non-mover prop with src');
  assert(/const budget = \(typeof _prStepI !== 'undefined' && _prStepI > 0\) \? 2 : BAKE_MS;/.test(tick),
    'build 1206: the per-frame budget drops to 2ms when the adaptive resolution scaler has engaged — a background bake must never buy a visible downshift');
  assert(/performance\.now\(\) - t0 < budget/.test(tick), 'the job is frame-budgeted — never a synchronous stall');
  assert(/if\(u\.phys \|\| u\.vehicle \|\| \(u\.xa && u\.xa\.on\)\) continue;/.test(extractFunction('_bakeCollect')),
    'movers cannot hold a static bake and are skipped (they then ride the white-attribute invariant)');
  assert(/mat\.vertexColors = false;   \/\* build 1195/.test(src),
    'the primitive instancing batch strips vertexColors — its shared unit geometry has no colour attribute and would render black');
  assert(/lut:'', lutAmt:1, baked:true,/.test(src), 'the flag ships in DEFAULT_WORLD (ON since build 1370) and rides the whole-world serialization');
  assert(/if\(worldCfg\.baked && typeof requestSceneBake==='function'\) requestSceneBake\(\);/.test(src),
    'applyWorldCfg kicks the bake on load — a shared level re-bakes deterministically wherever it opens');
  assert(/if\(!\(typeof worldCfg !== 'undefined' && worldCfg\.baked\)\)\{ if\(_bakeMats\.size\) unbakeScene\(\); return; \}/.test(tick),
    'flag off = unbake (vertexColors stripped from every touched material)');
  assert(/if\(typeof _bakeTick==='function'\) _bakeTick\(\);/.test(src), 'the frame loop drives the job');
  assert(/Baked ambient occlusion \(per-vertex\)/.test(src), 'the checkbox lives in the Lighting fold');
}

done('build 1195: baked per-vertex AO — a 14-ray golden-angle hemisphere (unit, upper-half, spread — each property executed), a slab test with a self-surface near-clip (seven cases), a visibility integrator proven on real three geometry including own-model triangle occlusion and own-box exclusion, and a frame-budgeted job with the shared-geometry clone, the shared-material white-attribute invariant, load-gating, re-bake on prop changes, and clean unbake');
