// (build 875) FLOOR MATERIAL PAINTING — "the ground can be all grass, the user selects a brush with
// soft edges it blends, and can paint a different texture for a path of dirt". A 256² RGBA splat canvas
// (R/G/B = three paint layers) is blended into the floor's own standard material via onBeforeCompile —
// lighting/shadows/fog untouched, no render targets, no extra draw calls. The existing terrain brush
// gains a 'Paint' mode; the splat persists as a PNG dataURL in worldCfg.paint (verified headless:
// stroke falloff, erase, alignment, dataURL round-trip, clean GL renders).
import { gameSource, extractFunction, evalDecl, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- the stroke math, executed against a stub canvas ----
const N = 256, ARENA = 70;
const data = new Uint8ClampedArray(N * N * 4);
const _paintStroke = evalDecl(extractFunction('_paintStroke', src), '_paintStroke', {
  terrainBrush: { radius: 12, paintLayer: 0, soft: 0.5, flow: 1, paintErase: false },
  ARENA, _PAINT_N: N, _paintData: data,
  _paintCtx: { putImageData(){} }, _paintImg: {}, _paintTex: {},
  Math,
});
const texel = (wx, wz) => {
  const px = Math.round(((wx + ARENA) / (ARENA * 2)) * N), pz = Math.round(((ARENA - wz) / (ARENA * 2)) * N);
  return [data[(pz * N + px) * 4], data[(pz * N + px) * 4 + 1], data[(pz * N + px) * 4 + 2]];
};
_paintStroke(10, -20);
eq(texel(10, -20)[0], 90, 'full weight at the brush centre (flow 1 → 90/dab, airbrush build-up)');
const edge = texel(20, -20)[0];
assert(edge > 5 && edge < 60, `soft edge: partial weight in the falloff band (got ${edge})`);
eq(texel(40, -20)[0], 0, 'nothing outside the radius');
eq(texel(10, -20)[1], 0, 'layer 1 paints only the R channel');
// accumulation + clamp
_paintStroke(10, -20); _paintStroke(10, -20); _paintStroke(10, -20);
eq(texel(10, -20)[0], 255, 'repeated dabs build up and clamp at 255');
// erase subtracts
const eraseStroke = evalDecl(extractFunction('_paintStroke', src), '_paintStroke', {
  terrainBrush: { radius: 12, paintLayer: 0, soft: 0.5, flow: 1, paintErase: true },
  ARENA, _PAINT_N: N, _paintData: data, _paintCtx: { putImageData(){} }, _paintImg: {}, _paintTex: {}, Math,
});
eraseStroke(10, -20); eraseStroke(10, -20); eraseStroke(10, -20);
eq(texel(10, -20)[0], 0, 'erase paints the layer away');

// ---- shader injection: blended inside the floor material, raw uv (not the tiled map uv) ----
assert(/floorMat\.onBeforeCompile = \(shader\)=>\{/.test(src), 'the floor material owns the blend (lighting/shadows intact)');
assert(/shader\.vertexShader = 'varying vec2 vPaintUv;\\n' \+ shader\.vertexShader\.replace\('#include <begin_vertex>', 'vPaintUv = uv;\\n#include <begin_vertex>'\);/.test(src),
  'a raw uv varying of our own — the floor texture’s tiling transform must not leak into the splat lookup');
assert(/vec3 pw = texture2D\(uSplat, vPaintUv\)\.rgb \* uPHas;/.test(src), 'R/G/B splat weights gate three layers');
assert(/if\(pw\.r>0\.004\) diffuseColor\.rgb = mix\(diffuseColor\.rgb, texture2D\(uPL0, vPaintUv\*uPRep\.x\)\.rgb, pw\.r\);/.test(src), 'layer blend is a straight mix over the base');
assert(/_paintTex\.flipY = false;/.test(src), 'flipY off: canvas rows align with uv v (paint + round-trip stay put)');
assert(!/new THREE\.WebGLRenderTarget/.test(extractFunction('_applyPaintCfg', src)), 'no render targets anywhere in the paint path');

// ---- persistence + load paths ----
assert(/if\(typeof _applyPaintCfg==='function'\) _applyPaintCfg\(\);/.test(src), 'applyWorldCfg repaints — boot, load, share, MP-adopt and undo all pass through it');
assert(/worldCfg\.paint\.map=_paintCanvas\.toDataURL\('image\/png'\);/.test(src), 'a finished stroke commits the splat as a PNG dataURL');
assert(/if\(_brushing\)\{ _brushing = false; editorDragMoved = true; if\(terrainBrush\.mode==='paint' && typeof _paintCommit==='function'\) _paintCommit\(\); \}/.test(src),
  'the commit fires on mouse-up (end of stroke), not per dab');
assert(/if\(_paintLoadedFor!==map\) return;/.test(src), 'a stale async image decode cannot clobber a newer level’s paint');

// ---- brush + editor wiring ----
assert(/if\(terrainBrush\.mode==='paint'\)\{\s+\/\/ build 875[\s\S]{0,200}_paintStroke\(hitP\.x, hitP\.z\); return true;/.test(src), 'paint mode strokes without needing a height grid (flat floors paint too)');
assert(/\[\['raise','Raise'\],\['lower','Lower'\],\['smooth','Smooth'\],\['paint','Paint'\]\]/.test(src), 'Paint joins the brush-mode row');
assert(/paintLayer:0, soft:0\.5, flow:0\.55, paintErase:false/.test(src), 'brush defaults: layer 1, half-soft edge, moderate flow');
assert(/mkBSlider\('Soft edge', /.test(src) && /mkBSlider\('Flow', /.test(src) && /mkBSlider\('Tiles', /.test(src), 'Soft edge / Flow / Tiles controls exist');
assert(/Erase \(remove this layer\\u2019s paint\)/.test(src), 'erase toggle exists');
assert(/renderTexSearch\(sh,\(maps\)=>\{ pushUndoSnapshot\(\); L\.t=maps\.map\|\|'';/.test(src), 'layers pick textures from the same free-texture search as the floor');

done('build 875: soft-edged material painting on the floor — 3 splat layers, saved with the level');
