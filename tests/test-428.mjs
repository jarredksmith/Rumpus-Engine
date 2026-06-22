import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 562: auto-gen layouts get random Poly Haven (CC0) textures. Floor = one plane textured as a single
// seamless piece; walls = each box tiled to its own world size (diffuse-only, quantized repeat so many boxes
// share a few GPU textures). Reuses the existing texSearch / texResolvePBR / applyPropTexturePBR pipeline.

assert(/let _genCells=9, _lastMazeSeed=0, _genCover=true, _genLoot=true, _genTex=true, _genDesc='', _genVision=true;/.test(src), 'textured-surfaces toggle state');
assert(/const _GEN_FLOOR_TEX=\['wood','tiles','concrete','carpet','marble'\];/.test(src), 'floor texture keyword set');
assert(/const _GEN_WALL_TEX=\['concrete','plaster','brick','painted','stone'\];/.test(src), 'wall texture keyword set');

const at = extractFunction('_genApplyTextures');
assert(/texSearch\(/.test(at) && /texResolvePBR\(/.test(at) && /applyPropTexturePBR\(/.test(at), 'reuses the Poly Haven search/resolve/apply pipeline');
assert(/creditAsset\(/.test(at), 'credits Poly Haven (feeds the credits screen)');
assert(/floorProp\.userData\.texRepeat=\[rp,rp\]; applyPropTexturePBR\(floorProp, pbr\);/.test(at), 'floor textured as one piece with full PBR maps, tiled across the plane');
assert(/applyPropTexturePBR\(o, \{ map:pbr\.map \}\);/.test(at), 'walls are diffuse-only (memory)');
assert(/const u=Math\.max\(1,Math\.min\(8,Math\.round\(longD\/tile\)\)\), v=Math\.max\(1,Math\.round\(o\.scale\.y\/tile\)\);/.test(at), 'per-box repeat scaled to world size, quantized + clamped');

// both generators: emit a floor plane + collect walls + call the texturer, all gated on opts.tex
const gm = extractFunction('generateMaze'), go = extractFunction('generateOffice');
for(const [name, fn] of [['maze',gm],['office',go]]){
  assert(/if\(opts\.tex!==false\) spawnProp\('box', \[0, -0\.47, 0, 0,0,0, span\+cell, 0\.5, span\+cell\]/.test(fn), name+' emits a single floor plane when textured');
  assert(/const wallProps=\[\]; let floorProp=null;/.test(fn), name+' collects wall props + floor prop');
  assert(new RegExp('if\\(opts\\.tex!==false\\) _genApplyTextures\\(rnd, floorProp, wallProps, 4, span[^;]*\\);').test(fn), name+' applies textures when enabled');
}

// panel toggle
const panel = extractFunction('renderGeneratePanel');
assert(/Textured surfaces/.test(panel) && /_genTex=v/.test(panel), 'panel has the textured-surfaces toggle');
assert(/tex:_genTex/.test(panel), 'tex flag passed to the generators');

// --- executable model: wall-repeat quantization keeps the distinct GPU-texture count bounded ---
function wallRepeat(longD, wallH, tile){ return [Math.max(1,Math.min(8,Math.round(longD/tile))), Math.max(1,Math.round(wallH/tile))]; }
const seen = new Set();
for(let longD=2; longD<=120; longD+=0.5){ const [u,v]=wallRepeat(longD, 5, 4); seen.add(u+'x'+v); }
assert(seen.size<=8, 'across all wall lengths there are at most ~8 distinct repeats -> bounded GPU textures (got '+seen.size+')');
// and a tiny wall still tiles at least 1x (never 0 -> invisible/over-tiled)
const [u0] = wallRepeat(0.3, 5, 4); assert(u0>=1, 'even a tiny wall tiles at least once');

done('auto-gen Poly Haven texturing: seamless floor, world-scaled walls, bounded texture count, credited (build 562)');
