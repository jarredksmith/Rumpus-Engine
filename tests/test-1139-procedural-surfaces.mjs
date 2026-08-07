// build 1139: the engine's own surfaces stop being flat albedo.
//
// A critic measured it: a generated arena's ground patch holds 1,745 unique colours over 10,800 pixels,
// while the DEFAULT level's floor holds THREE over 18,900. Every primitive and both boundary surfaces
// were one colour, one roughness and no relief — "a render" rather than "a photograph of something",
// whatever the lighting on top of it.
//
// One 256x256 height field, generated once at boot, becomes a Sobel normal map and a roughness map that
// every built-in surface opts into. Three things went wrong on the way here, and each is pinned below
// because each was invisible until it was measured:
//
//  1. Assigning the maps at material construction achieves NOTHING. worldCfg.floorTex is '' by default,
//     so the first applyWorldCfg ran _loadSurfaceMap's "no url" branch and wrote null over them, before
//     the first frame. Measured: 560 unique colours vs 561, and a byte-identical mean.
//  2. Tiling lives in UV space, so ONE repeat value gives an 11 m blotch on a 22 m deck and a 50 cm one
//     on a 1 m crate — the same material reading as two differently-zoomed photographs.
//  3. buildInstancing() rebuilt the batch material FROM SCRATCH at the default roughness/metalness, so
//     every instanced prop lost the detail set — and, long before this build, its authored shine and
//     opacity too. Play did not match the frame the level was authored in.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the field, executed
{
  // _procSurface uses canvas and THREE, so run the noise half of it directly: the field must TILE (it is
  // sampled with RepeatWrapping) and must be DETERMINISTIC (build 1133's rule — a level that looks
  // different on every load cannot be screenshotted or shared).
  const fn = extractFunction('_procSurface');
  assert(/let seed = 0x9e3779b9;/.test(fn), 'the noise is seeded from a constant, not Math.random()');
  assert(!/Math\.random/.test(fn), '...and reaches for Math.random() nowhere');
  assert(/\[\[8, 0\.55\], \[24, 0\.3\], \[64, 0\.15\]\]/.test(fn), 'three octaves, coarse to fine');
  assert(/const x1 = \(x0\+1\)%cells, y1 = \(y0\+1\)%cells;/.test(fn),
    'the lattice wraps, so the texture tiles seamlessly');
  assert(/const sm = \(t\)=> t\*t\*\(3-2\*t\);/.test(fn), 'smoothstep between lattice points, so cell edges do not show');
  assert(/catch\(e\)\{ _surfTex = false; \}/.test(fn), 'and a canvas failure degrades to flat surfaces rather than a broken boot');
  assert(/if\(_surfTex !== null\) return _surfTex;/.test(fn),
    'built once — `!== null` not a truthiness test, so the `false` failure state is also cached');

  // rebuild the field the same way and check the two properties
  const N = 64;   // the shape of the algorithm, at a size a test can afford
  const field = (seedInit) => {
    let seed = seedInit;
    const rnd = ()=>{ seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5; return ((seed>>>0)/4294967296); };
    const H = new Float32Array(N*N);
    for (const [cells, amp] of [[8, 0.55], [24, 0.3], [64, 0.15]]) {
      const g = new Float32Array(cells*cells);
      for (let i=0;i<g.length;i++) g[i] = rnd();
      const sm = (t)=> t*t*(3-2*t);
      for (let y=0;y<N;y++) for (let x=0;x<N;x++) {
        const fx = x/N*cells, fy = y/N*cells;
        const x0 = Math.floor(fx)%cells, y0 = Math.floor(fy)%cells;
        const x1 = (x0+1)%cells, y1 = (y0+1)%cells;
        const tx = sm(fx-Math.floor(fx)), ty = sm(fy-Math.floor(fy));
        const a = g[y0*cells+x0]*(1-tx) + g[y0*cells+x1]*tx;
        const b = g[y1*cells+x0]*(1-tx) + g[y1*cells+x1]*tx;
        H[y*N+x] += (a*(1-ty) + b*ty) * amp;
      }
    }
    return H;
  };
  const A = field(0x9e3779b9), B = field(0x9e3779b9);
  for (let i=0;i<A.length;i+=97) eq(A[i], B[i], 'the same seed gives the same field (sample ' + i + ')');
  // it must actually VARY — a constant field would pass every structural check above and do nothing
  let lo = Infinity, hi = -Infinity;
  for (const v of A) { if (v < lo) lo = v; if (v > hi) hi = v; }
  assert(hi - lo > 0.25, 'the field has real range (' + lo.toFixed(3) + '..' + hi.toFixed(3) + ')');
  // and it must be CONTINUOUS across the wrap seam, or every tile boundary is a visible line
  let seam = 0, interior = 0;
  for (let y=0;y<N;y++) { seam += Math.abs(A[y*N] - A[y*N + (N-1)]); interior += Math.abs(A[y*N + (N>>1)] - A[y*N + (N>>1) - 1]); }
  assert(seam / N < (interior / N) * 3 + 0.02,
    'the wrap seam is no more of a step than an ordinary neighbouring pixel (' + (seam/N).toFixed(4) + ' vs ' + (interior/N).toFixed(4) + ')');
}

// ---------------------------------------------------------------- exposure neutrality
{
  // NO albedo map, and this is the load-bearing decision of the build. `map` multiplies the material
  // colour, so it can only ever darken; a near-white 226..255 field averages 0.87 in LINEAR space, and
  // captured before/after it took the frame down ~19% (a deck 91,105,90 -> 74,91,68). Since this
  // retrofits detail onto colours creators already chose, that is not a trade to make.
  const m = src.match(/const PROC_SLOTS = \[([^\]]*)\];/);
  assert(m, 'the slots the detail set fills are declared in one place');
  const slots = m[1].split(',').map(s=>s.trim().replace(/'/g, '')).filter(Boolean);
  assert(slots.includes('normalMap') && slots.includes('roughnessMap'), 'relief and roughness are filled');
  assert(!slots.includes('map'), 'albedo is NOT — a colour multiplier cannot be exposure-neutral');
  eq(slots.length, 2, 'and those are the only two');
  // the roughness range multiplies the AUTHORED roughness, so it has to stay near 1
  const r = src.match(/const v = (\d+) \+ Math\.round\(\(1-H\[i\]\)\*(\d+)\);/);
  assert(r, 'the roughness map has a stated range');
  const rLo = +r[1] / 255, rHi = (+r[1] + +r[2]) / 255;
  assert(rHi > 0.99, 'the top of the range leaves the authored roughness alone (' + rHi.toFixed(3) + ')');
  assert(rLo > 0.75, '...and the bottom only nudges it (' + rLo.toFixed(3) + ') — the first cut swung to 0.59 and turned a matte deck glossy in patches');
}

// ---------------------------------------------------------------- relief strength, executed
{
  const fn = extractFunction('_procSurface');
  const s = fn.match(/const STR = ([\d.]+);/);
  assert(s, 'the relief strength is a named constant');
  const STR = +s[1];
  // Run the Sobel-to-normal arithmetic on the steepest gradient the field can produce and check the
  // resulting tilt is MICRO-relief. This is the number that was wrong twice: at 1.8 the crates read as
  // crumpled foil and the mid-ground floor showed grazing-angle moire.
  const tilt = (dx, dy) => { let nx = -dx*STR, ny = -dy*STR, nz = 1;
    const l = Math.hypot(nx, ny, nz); return Math.acos(nz/l) * 180/Math.PI; };
  assert(tilt(0.5, 0) < 12, 'the steepest slope the coarse octave produces tilts the normal under 12 degrees (' + tilt(0.5,0).toFixed(1) + ')');
  assert(tilt(0.5, 0) > 2, '...and over 2, or there is no relief at all (' + tilt(0.5,0).toFixed(1) + ')');
  eq(tilt(0, 0), 0, 'a flat patch stays flat');
  // and the strength is baked into the MAP, never set as material.normalScale — floorMat and wallMat are
  // shared, so a creator loading their own normal map would inherit whatever scale we left behind
  assert(!/normalScale = new THREE\.Vector2\(0\.7/.test(src), 'no leftover normalScale on the shared surfaces');
  assert(/nimg\.data\[i\] = Math\.round\(\(nx\*0\.5\+0\.5\)\*255\);/.test(fn), 'the normal is encoded to the usual 0..1 range');
}

// ---------------------------------------------------------------- 1. a FALLBACK, not an assignment
{
  const fn = extractFunction('_loadSurfaceMap');
  assert(/const fb = \(typeof _procFallback==='function'\) \? _procFallback\(mat, slot\) : null;/.test(fn),
    'clearing a surface map slot falls back to the procedural set');
  assert(!/if\(mat\[slot\]\)\{ mat\[slot\] = null; mat\.needsUpdate = true; \} return;/.test(fn),
    '...instead of writing null, which is what silently undid the whole build before the first frame');
  assert(/if\(mat\[slot\] !== fb\)\{ mat\[slot\] = fb; mat\.needsUpdate = true; \}/.test(fn),
    'and it only marks the material dirty on a real change');
  // the same fault, and the same fix, on the per-prop texture path
  const pt = extractFunction('applyPropTexture');
  assert(/o\.material\.normalMap = _procFallback\(o\.material, 'normalMap'\);/.test(pt),
    'clearing a prop texture returns it to the detail set, not to flat');
  assert(/o\.material\.map = null;/.test(pt), '...while the albedo slot really does clear, because the detail set holds no albedo');
  // executable: the fallback itself
  const ff = new Function(extractFunction('_procFallback') + '; return _procFallback;')();
  const set = { normalMap: { id: 'n' }, roughnessMap: { id: 'r' } };
  eq(ff({ userData: { procSurf: set } }, 'normalMap'), set.normalMap, 'it hands back the remembered texture');
  eq(ff({ userData: {} }, 'normalMap'), null, 'a material that never opted in falls back to nothing');
  eq(ff(null, 'normalMap'), null, '...and a missing material does not throw');
  eq(ff({ userData: { procSurf: set } }, 'map'), null, 'there is no albedo in the set to fall back to');
}

// ---------------------------------------------------------------- 2. the grain is a PHYSICAL size
{
  const mk = () => new Function('PROC_TILE_M', '_PROC_STEPS', 'Math',
    extractFunction('_procRepeatFor') + '; return _procRepeatFor;')(
      +src.match(/const PROC_TILE_M = ([\d.]+);/)[1],
      JSON.parse(src.match(/const _PROC_STEPS = (\[[^\]]*\]);/)[1]), Math);
  const rep = mk();
  const TILE = +src.match(/const PROC_TILE_M = ([\d.]+);/)[1];
  assert(TILE > 0.5 && TILE < 6, 'a tile of grain is a plausible physical size (' + TILE + ' m)');
  // the whole point: metres-per-tile is roughly constant across two orders of scale
  for (const span of [4.4, 9, 22, 70, 140, 400]) {
    const m = span / rep(span);
    assert(m > TILE / 1.5 && m < TILE * 1.5,
      'a ' + span + ' m surface gets ' + rep(span) + ' tiles = ' + m.toFixed(2) + ' m of grain, within 50% of ' + TILE);
  }
  // Below one tile-width the clamp takes over, and that is correct rather than a gap: fewer than one
  // repeat would stretch the field past its own period and the grain would read as a smear.
  for (const span of [0.4, 1, 2.2]) eq(rep(span), 1, 'a ' + span + ' m prop gets exactly one tile — finer grain than nominal, never coarser');
  assert(rep(140) > rep(22) && rep(22) > rep(2.4), 'bigger surfaces get more tiles');
  eq(rep(0), 1, 'a degenerate span still returns a usable tiling');
  eq(rep(1), 1, '...and never goes below one tile, which would stretch the grain past its own period');
  // quantised, so the clone cache stays a handful of entries rather than one per prop
  const steps = JSON.parse(src.match(/const _PROC_STEPS = (\[[^\]]*\]);/)[1]);
  assert(steps.length <= 16, 'the ladder is short (' + steps.length + ' rungs)');
  for (const span of [3, 7, 11, 19, 31, 57, 99]) assert(steps.includes(rep(span)), 'every result is on the ladder (' + span + ' -> ' + rep(span) + ')');
  // and one texture set per rung, cloned — three reads repeat off the TEXTURE, not the material
  const ps = extractFunction('_procSet');
  assert(/let set = _surfClones\[key\];/.test(ps) && /_surfClones\[key\] = set;/.test(ps), 'sets are cached per tiling');
  assert(/const t = S\[k\]\.clone\(\);/.test(ps), '...as clones, which share the uploaded image');
}
{
  // the callers: both shared surfaces pass a WORLD SPAN, and the arena rebuild re-derives it
  assert(/applyProcSurface\(floorMat, 140\);/.test(src), 'the floor plane opts in at its default extent');
  assert(/applyProcSurface\(wallMat, 140\);/.test(src), 'so do the boundary walls');
  const ra = extractFunction('rebuildArena');
  assert(/retileProcSurface\(floorMat, ARENA\*2\); retileProcSurface\(wallMat, ARENA\*2\);/.test(ra),
    'resizing the arena re-derives both, because their UVs span the whole extent');
  assert(/applyProcSurface\(new THREE\.MeshStandardMaterial\(\{ color:PRIM_DEFAULT_COLOR/.test(src),
    'every built-in primitive opts in through primitiveMat()');
  // ...and a prop's own tiling follows its scale, on spawn, on a field edit and on a gizmo drag
  const fp = extractFunction('finalizeProp');
  assert(/if\(typeof retileProcSurface==='function'\) retileProcSurface\(obj, _propProcSpan\(obj\)\);/.test(fp),
    'a spawned prop is tiled from its scale');
  assert(/retileProcSurface\(o, _propProcSpan\(o\)\);   \/\/ build 1139/.test(src), 'the transform fields re-tile');
  assert(/if\(typeof retileProcSurface==='function'\) retileProcSurface\(o, _propProcSpan\(o\)\); refreshPropCollider\(o\)/.test(src),
    'and so does a gizmo scale drag');
  // executable: the span is the largest scaled dimension, so a slab and a wall of the same length match
  const span = new Function('Math', extractFunction('_propProcSpan') + '; return _propProcSpan;')(Math);
  eq(span({ scale: { x: 22, y: 1.2, z: 9 } }), 22, 'a wide flat deck is measured by its width');
  eq(span({ scale: { x: 3, y: 4.5, z: 14 } }), 14, '...a tall thin wall by its length');
  eq(span({ scale: { x: -6, y: 1, z: 1 } }), 6, 'a mirrored prop uses the magnitude');
  eq(span(null), 1, 'and a missing object does not throw');
}
{
  // retileProcSurface must never touch a texture the creator supplied
  const fn = extractFunction('retileProcSurface');
  assert(/const cur = m\.userData\.procSurf; if\(!cur \|\| cur === set\) return;/.test(fn),
    'a material that never opted in is skipped, and a no-op re-tile costs nothing');
  assert(/for\(const k of PROC_SLOTS\) if\(m\[k\] === cur\[k\]\)\{ m\[k\] = set\[k\]; hit = true; \}/.test(fn),
    'only slots still holding OUR texture are swapped');
  assert(/if\(root\.isMaterial\) one\(root\);/.test(fn), 'it takes a material...');
  assert(/else if\(root\.traverse\)/.test(fn), '...or a whole prop');
}

// ---------------------------------------------------------------- 3. instanced props keep their material
{
  const fn = extractFunction('buildInstancing');
  // build 1430 appends a spatial CELL so a batch's volume is small enough for a frustum to reject
  // (measured: the dominant batch spanned the whole map before it). The intent here is untouched — the
  // MATERIAL identity still comes from the one function rather than being rebuilt inline — so that is
  // what is asserted, instead of the exact text of the concatenation.
  assert(/const key = _instKey\(o\)/.test(fn), 'the batch key comes from one function');
  assert(!/\bkey\b[^\n]*userData\.(col|shine|op)/.test(fn),
    '...and no material property is spelled out inline beside it');
  assert(!/new THREE\.MeshStandardMaterial\(\{ color:parseInt\(colStr,10\), roughness:\.65, metalness:\.35/.test(fn),
    'the batch material is NOT rebuilt from scratch at the engine defaults any more');
  assert(/const src0 = \(list\[0\]\.isMesh && list\[0\]\.material\) \? list\[0\]\.material : null;/.test(fn),
    'it clones a real member\'s material...');
  assert(/const mat = src0 \? src0\.clone\(\) :/.test(fn), '...so colour, shine, opacity and the detail set all carry into the batch');
  assert(/if\(src0 && src0\.userData\) mat\.userData = Object\.assign\(\{\}, src0\.userData\);/.test(fn),
    '...with its own userData copy, because r149\'s clone() shares the reference');
  assert(/if\(list\.length < 2\) continue;/.test(fn), 'singletons still are not worth instancing');
  // executable: the key separates everything the material can carry
  const mk = () => new Function('PRIM_DEFAULT_COLOR', 'PRIM_DEFAULT_ROUGH', 'PRIM_DEFAULT_METAL', '_procRepeatFor', '_propProcSpan',
    extractFunction('_instKey') + '; return _instKey;')(0x2a3a42, 0.65, 0.35, (s)=>Math.round(s), (o)=>o.scale.x);
  const K = mk();
  const P = (u, sc) => ({ userData: u, scale: { x: sc || 1 } });
  const base = { src: 'box', col: 0x445566, shine: { r: 0.85, m: 0.08 } };
  eq(K(P(base, 4)), K(P(Object.assign({}, base), 4)), 'two identical props batch together');
  assert(K(P(base, 4)) !== K(P(Object.assign({}, base, { col: 0x112233 }), 4)), 'a different colour does not');
  assert(K(P(base, 4)) !== K(P(Object.assign({}, base, { shine: { r: 0.5, m: 0.4 } }), 4)),
    'a different SHINE does not — this is what every instanced prop silently lost before this build');
  assert(K(P(base, 4)) !== K(P(Object.assign({}, base, { op: 0.4 }), 4)),
    '...nor a different opacity, which used to batch a glass crate into an opaque one');
  assert(K(P(base, 4)) !== K(P(base, 40)), '...nor a different size, which would give one grain scale to both');
  assert(K(P({ src: 'box' })) === K(P({ src: 'box', col: 0x2a3a42, shine: { r: 0.65, m: 0.35 } })),
    'an unset material is keyed the same as one explicitly set to the defaults');
  assert(K(P(base, 4)) !== K(P(Object.assign({}, base, { src: 'sphere' }), 4)), 'and shapes never share a batch');
}
{
  // teardown still restores the individual props for editing
  const fn = extractFunction('teardownInstancing');
  assert(/for\(const o of instancedProps\)\{ if\(propModels\.indexOf\(o\)>=0\) scene\.add\(o\); \}/.test(fn),
    'leaving play puts the real props back');
  // eligibility is unchanged: an authored texture, a glow, physics, a vehicle or a mechanism stays individual
  const el = extractFunction('instanceEligible');
  assert(/!o\.userData\.tex/.test(el), 'a prop with its own texture is never batched (so a batch is uniform by construction)');
}

done('build 1139: the built-in surfaces carry relief and roughness, at one physical grain size, in play as well as in the editor');
