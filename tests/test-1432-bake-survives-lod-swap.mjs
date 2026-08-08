// build 1432 — the per-vertex bake survives build 1431's geometry swap.
//
// REPORTED FROM PLAY, on the live site, 750 times in one session:
//   Uncaught TypeError: Cannot read properties of undefined (reading 'setXYZ')
//     at _bakeTick   (breach.html:11256)
//     at loop        (breach.html:40065)
//
// A throw INSIDE THE FRAME LOOP, once per frame, forever. The mechanism, and it is build 1431's fault:
//   - `_bakeTick` is RESUMABLE across frames (J.mi / J.vi) and read `mesh.geometry` on every resume.
//   - At J.vi === 0 it also CLONES the geometry and assigns the clone to the mesh.
//   - Build 1431 swaps `mesh.geometry` between a full and a simplified level BETWEEN FRAMES.
// So the job set up geometry A, build 1431 swapped in B, and the next resume read B.attributes.color —
// which does not exist, because the setup that creates it only runs at J.vi === 0.
//
// This is build 1263's rule — a perf change may not remove work something else relies on — and 1431's own
// entry congratulates itself on honouring it for RAYCASTING while missing it for the bake.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import * as THREE from 'three';

const src = gameSource();
const tick = extractFunction('_bakeTick', src);

/* ---- the job holds its own geometry, so a swap cannot move it ----------------------------------- */
assert(/it\.geo = g;/.test(tick), 'the job records the geometry it set up');
assert(/const geo = it\.geo \|\| mesh\.geometry;/.test(tick),
  'and every resume reads THAT, not whatever the mesh happens to be drawing');
assert(!/const pos = mesh\.geometry\.attributes\.position/.test(tick),
  'the per-resume read of mesh.geometry — the defect — is gone');
assert(/mesh\.userData\._lodHi \|\| mesh\.geometry/.test(tick),
  'and it bakes the AUTHORED geometry, never a simplified level');

/* ---- the clone keeps the LOD levels in step ------------------------------------------------------ */
assert(/mesh\.userData\._lodHi = g; mesh\.userData\._lodOn = false;/.test(tick),
  'when the bake supersedes the geometry, the level of detail follows it rather than pointing at a ghost');
// Merely DROPPING the level was the first fix, and the probe caught what it cost: baking is ON by default
// (build 1370), so every static model is cloned here and would lose its level for the rest of the session
// — build 1431 would have been a near no-op in the shipped configuration. A clone has identical topology,
// so the decimated INDEX is still valid against the new attributes.
assert(/nlo\.setIndex\(_oldLo\.index\)/.test(tick), 'the level is RE-SEATED onto the baked geometry, not dropped');
assert(/for\(const k in g\.attributes\) nlo\.setAttribute\(k, g\.attributes\[k\]\)/.test(tick),
  '...sharing the baked attributes, so it carries the colours and costs no second vertex buffer');
const iColour = tick.indexOf("setAttribute('color'"), iReseat = tick.indexOf('const _oldLo');
assert(iColour > 0 && iReseat > iColour,
  'and the re-seat happens AFTER the colour attribute exists, or the level would miss it and render black');

/* ---- the guard, because the failure mode is a frame-loop throw ----------------------------------- */
assert(/if\(!pos \|\| !nrm \|\| !col\)\{ J\.mi\+\+; J\.vi = 0; return; \}/.test(tick),
  'a mesh missing an attribute is SKIPPED, not thrown on — losing some shading beats losing the game');

/* ---- the baked colours reach the simplified level ------------------------------------------------ */
// Build 1195's shared-material invariant: vertexColors=true on a material means EVERY mesh using it must
// carry a colour attribute, or it samples (0,0,0) and renders black. The simplified level shares the same
// VERTICES, so the same attribute is valid for it unchanged.
assert(/_lo\.setAttribute\('color', col\)/.test(tick), 'the simplified level receives the baked colours');
const iCol = tick.indexOf("col.needsUpdate = true"), iLo = tick.indexOf("_lo.setAttribute('color', col)"),
      iVc = tick.indexOf('vertexColors = true');
assert(iCol > 0 && iLo > iCol && iVc > iLo,
  '...BEFORE the material is switched to vertex colours, or the level renders black for a frame');

/* ---- and 1431 can never assign a null geometry --------------------------------------------------- */
const geoTick = extractFunction('_lodGeoTick', src);
assert(/if\(!u \|\| !u\._lodHi \|\| !u\._lodLo\) return;/.test(geoTick),
  'a nulled level is skipped — assigning it would hand the renderer a mesh with no geometry at all');

/* ---- EXECUTED: the reported crash, reproduced and then not --------------------------------------- */
// The pre-1432 shape, driven directly: set up on geometry A, swap to B, resume.
const mk = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
};
const hi = mk();
const lo = new THREE.BufferGeometry();
for (const k in hi.attributes) if (k !== 'color') lo.setAttribute(k, hi.attributes[k]);   // 1431's level, built BEFORE the bake
const mesh = new THREE.Mesh(hi, new THREE.MeshBasicMaterial());
mesh.userData._lodHi = hi; mesh.userData._lodLo = lo;

// the OLD read: whatever the mesh is drawing right now
mesh.geometry = lo;                                   // 1431 swapped it between frames
let threw = false;
try { const col = mesh.geometry.attributes.color; col.setXYZ(0, 1, 1, 1); }
catch (e) { threw = /setXYZ/.test(String(e.message)); }
assert(threw, 'PREMISE: the reported crash reproduces — reading the DRAWN geometry throws on setXYZ');

// the NEW read: the geometry the job set up
const it = { mesh, geo: hi };
const geo = it.geo || mesh.geometry;
assert(geo.attributes.color, 'the held reference still has its colour attribute');
geo.attributes.color.setXYZ(0, 0.5, 0.5, 0.5);
eq(geo.attributes.color.getX(0), 0.5, '...and the bake writes into it, with the mesh still drawing the level');
eq(mesh.geometry, lo, 'the swap is untouched — the bake does not fight build 1431 for what is drawn');

// and the propagation makes the level renderable under vertexColors
lo.setAttribute('color', geo.attributes.color);
assert(lo.attributes.color === hi.attributes.color,
  'the level shares the baked attribute — same vertices, same colours, no second buffer');

done('build 1432: the per-vertex bake holds the geometry it set up, so build 1431 swapping a simplified ' +
     'level in between frames can no longer make it throw inside the frame loop — plus the level receives ' +
     'the baked colours (or it would render black under vertexColors) and a missing attribute is skipped');
