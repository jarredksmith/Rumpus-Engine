// (build 1039) SURFACE WEIGHT SMOOTHING — author: "still making the creases pretty badly."
// The 1037 kernel widened the blend radially, but weights still stepped too fast ALONG THE
// SURFACE. The bind now diffuses weights over the mesh's own topology (Laplacian over welded
// vertex adjacency — UV/normal seam duplicates weld by position), with the round count adaptive
// to mesh density, before truncating to the final top-4 bones.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const env = new Function(
  extractFunction('_arSmoothWeights', src) + '\n' + extractFunction('_arSmoothIters', src)
  + '\nreturn { smooth:_arSmoothWeights, iters:_arSmoothIters };')();

// ---- a strip of 8 quads along X with a hard bone-0|bone-1 step in the middle ----
// verts: columns x=0..8, rows y=0/1 -> v(c,r)=c*2+r; quads triangulated
const COLS = 9;
const pos = new Float32Array(COLS * 2 * 3);
for (let c = 0; c < COLS; c++) for (let r = 0; r < 2; r++) { const v = c * 2 + r; pos[v * 3] = c; pos[v * 3 + 1] = r; pos[v * 3 + 2] = 0; }
const idx = [];
for (let c = 0; c < COLS - 1; c++) {
  const a = c * 2, b = c * 2 + 1, d = (c + 1) * 2, e = (c + 1) * 2 + 1;
  idx.push(a, b, d, b, e, d);
}
const wl = [];
for (let c = 0; c < COLS; c++) for (let r = 0; r < 2; r++) wl.push([[c < 4 ? 0 : 1, 1]]);   // hard step at x=4

const out = env.smooth(pos, idx, wl, 4);
const shareB1 = (c) => { const m = new Map(out[c * 2]); return (m.get(1) || 0) / ([...m.values()].reduce((a, b) => a + b, 0)); };
near(shareB1(0), 0, 0.02, 'the far bone-0 end stays bone 0');
near(shareB1(8), 1, 0.02, 'the far bone-1 end stays bone 1');
assert(shareB1(4) > 0.25 && shareB1(4) < 0.85, 'the old hard step is now mixed at the boundary: ' + shareB1(4).toFixed(3));
assert(shareB1(3) > 0.05, 'the blend reaches back across the boundary: ' + shareB1(3).toFixed(3));
{
  let mono = true;
  for (let c = 1; c < COLS; c++) if (shareB1(c) < shareB1(c - 1) - 1e-6) mono = false;
  assert(mono, 'the ramp is monotonic along the strip');
}
{
  let sums = true;
  for (const w of out) { const t = w.reduce((a, p) => a + p[1], 0); if (Math.abs(t - 1) > 1e-6) sums = false; }
  assert(sums, 'every vertex still sums to 1');
}

// ---- seam welding: a duplicated position (UV/normal split) adopts its group's weights ----
{
  const pos2 = new Float32Array((COLS * 2 + 1) * 3);
  pos2.set(pos);
  const dup = COLS * 2;
  pos2[dup * 3] = 4; pos2[dup * 3 + 1] = 0; pos2[dup * 3 + 2] = 0;   // exact copy of v(4,0)'s position
  const wl2 = wl.map(w => w.map(p => p.slice())); wl2.push([[0, 1]]);   // the duplicate starts hard bone-0
  const out2 = env.smooth(pos2, idx, wl2, 4);
  const a = new Map(out2[4 * 2]), b = new Map(out2[dup]);
  near((a.get(1) || 0), (b.get(1) || 0), 1e-9, 'seam duplicates weld by position and share identical smoothed weights (no crease at UV seams)');
}

// ---- zero iterations / degenerate input are safe no-ops ----
eq(env.smooth(pos, idx, wl, 0), wl, 'zero rounds returns the input untouched');
eq(env.smooth(pos, idx, [], 3).length, 0, 'an empty mesh is a no-op');

// ---- adaptive round count ----
{
  const k = env.iters(pos, idx, COLS * 2, 2.0);   // blend radius 2 vs edge ~1
  assert(k >= 3 && k <= 16, 'rounds stay in the 3..16 clamp: ' + k);
  const dense = env.iters(pos, idx, COLS * 2, 40);
  eq(dense, 16, 'a huge radius/edge ratio caps at 16 (no runaway cost)');
  eq(env.iters(pos, idx, COLS * 2, 0), 3, 'a degenerate radius still smooths a little');
}

// ---- wiring into the bind ----
assert(/const K=Math\.min\(6, cand\.length\), top=new Array\(K\);   \/\/ build 1039: keep 6 candidates/.test(src),
  'the bind keeps 6 raw candidates for the smoother to arbitrate');
assert(/fin=_arSmoothWeights\(posArr, idxArr, wlist, _arSmoothIters\(posArr, idxArr, n, rAvg\)\);/.test(src),
  'smoothing runs between the raw kernel and the final write');
assert(/if\(n<=90000\)\{/.test(src), 'extreme meshes skip the pass instead of stalling the import');
assert(/const rAvg=segs\.length \? segs\.reduce/.test(src), 'the blend radius drives the smoothing depth');
assert(/segLen\*0\.3, h\*0\.025\), h\*0\.1\)/.test(src), 'the blend radius widened (30% of bone, 2.5%..10% of height)');

// ---- the modal's unreadable text ----
assert(/line-height:1\.5;color:#9fbdb2;/.test(src), 'the sidebar instructions finally have a color (they inherited near-black)');
assert(/id="arHint" style="flex:1;min-width:180px;color:#a9dcc9;/.test(src), 'the status line brightened');

done('build 1039: weights diffuse along the surface — deep bends stop folding, and the modal text is readable');
