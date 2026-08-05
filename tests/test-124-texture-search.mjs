// (build 177) Texture search now resolves the full PBR set (color + normal + roughness) from Poly Haven and
// can texture the world floor/walls too — not just primitives. Color maps stay sRGB; normal/roughness load
// linear. Per-prop tiling + 2K toggle + thousandths scaling from prior builds are preserved.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// PBR resolution
assert(/function texResolvePBR\(id, hi, cb, errcb\)/.test(src), 'texResolvePBR exists');
const trp = extractFunction('texResolvePBR');
assert(/_texPickMap\(files, \/nor_gl\/i, hi\) \|\| _texPickMap\(files, \/normal\/i, hi\)/.test(trp), 'resolves a normal map');
assert(/_texPickMap\(files, \/rough\/i, hi\)/.test(trp) && /cb\(\{ map, normal, rough \}\)/.test(trp), 'resolves roughness + returns the set');
const pm = extractFunction('_texPickMap');
assert(/hi \? \['2k','1k','4k'\] : \['1k','2k','4k'\]/.test(pm), '2K toggle still reorders resolution');

// linear vs sRGB texture instances
const ti = extractFunction('texInstance');
assert(/srgb = \(srgb !== false\)/.test(ti) && /\+ \(srgb\?'s':'l'\)/.test(ti), 'texInstance keys + colorspaces by srgb flag');

// prop PBR application
const apt = extractFunction('applyPropTexture');
assert(/o\.material\.normalMap    = obj\.userData\.texN \? texInstance\(obj\.userData\.texN, rep\[0\], rep\[1\], false, rot\)/.test(apt), 'prop normalMap from texN (linear)');
assert(/o\.material\.roughnessMap = obj\.userData\.texR \? texInstance\(obj\.userData\.texR, rep\[0\], rep\[1\], false, rot\)/.test(apt), 'prop roughnessMap from texR (linear)');
assert(/function applyPropTexturePBR\(obj, maps\)\{ if\(!obj \|\| !maps\) return; obj\.userData\.texN = maps\.normal/.test(src), 'applyPropTexturePBR stores the PBR set');

// serialization round-trip
const pmd = extractFunction('propMaterialDesc');
assert(/m\.texN = o\.userData\.texN/.test(pmd) && /m\.texR = o\.userData\.texR/.test(pmd), 'propMaterialDesc serializes texN/texR');
const asm = extractFunction('applyStoredMaterial');
assert(/obj\.userData\.texN = mat\.texN/.test(asm) && /obj\.userData\.texR = mat\.texR/.test(asm), 'applyStoredMaterial restores texN/texR');

// world surface PBR
// build 1387 filled the two NORMAL slots with maps generated from the same height field as the albedo
// beside them (test-1387 re-derives both). The roughness slots stay empty because neither library texture
// carries an `mr` field. The intent here is unchanged: all four fields exist and are wired.
assert(/floorTexN:'[^']*', floorTexR:''/.test(src) && /wallTexN:'[^']*', wallTexR:''/.test(src),
  'DEFAULT_WORLD has floor/wall PBR fields');
assert(/floorTexN:'img\/tex\/floor-concrete-n\.png'/.test(src) && /wallTexN:'img\/tex\/wall-panels-n\.png'/.test(src),
  '...with the normal slots pointing at the shipped maps (build 1387)');
const su = extractFunction('applySurfaceTexture');
assert(/_loadSurfaceMap\(mat, 'normalMap',    normalUrl, repU, repV, false, rot\)/.test(su) && /_loadSurfaceMap\(mat, 'roughnessMap', roughUrl,  repU, repV, false, rot\)/.test(su), 'surface applies normal + roughness');
assert(/applySurfaceTexture\(floorMat, worldCfg\.floorTex, '_floorTexUrl', fu, fv, worldCfg\.floorTexN, worldCfg\.floorTexR, /.test(src), 'floor passes its PBR urls');
assert(/applySurfaceTexture\(wallMat, worldCfg\.wallTex, '_wallTexUrl', wu, wv, worldCfg\.wallTexN, worldCfg\.wallTexR, /.test(src), 'wall passes its PBR urls');

// search wired into world floor + wall
assert(/renderTexSearch\(host, onPick\)/.test(src), 'renderTexSearch takes a target callback');
assert(/renderTexSearch\(fh,\(maps\)=>\{ pushUndoSnapshot\(\); worldCfg\.floorTex=maps\.map/.test(src), 'floor search wired');
assert(/renderTexSearch\(wh,\(maps\)=>\{ pushUndoSnapshot\(\); worldCfg\.wallTex=maps\.map/.test(src), 'wall search wired');
done('PBR texture search + world floor/wall texturing');
