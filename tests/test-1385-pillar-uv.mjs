// build 1385: a shared material carries ONE repeat, and the pillar is not a boundary wall.
//
// Found by a cold rendering critic and verified at the line. `wallMat` is shared, and build 1378 derives
// its texture repeat from the boundary wall's own span — `_surfRepeat(ARENA*2)` across and `_surfRepeat(H)`
// up. Before 1378, `wallTex` was '' so that repeat governed nothing. The moment the wall gained a texture,
// every other mesh sharing the material inherited a tiling tuned for a 140 x 8 m box — and `buildPillar`
// shares it for a 16 m cylinder about 7.5 m around, which is 0.2 m per tile around and 8 m per tile up.
// A 37:1 stretch, on four objects standing at the default level's spawn. That is a 1378 regression.
import { gameSource, assert, near, eq, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');

// ------------------------------------------------------------ the mismatch is real ----
{
  assert(/const pil = new THREE\.Mesh\(_uvRescale\(new THREE\.CylinderGeometry/.test(src),
    'the pillar rescales its own UVs');
  // the material is still SHARED — a clone would stop tracking the creator's wall colour and texture
  // through applyWorldCfg, and one material per pillar is a draw call per pillar.
  assert(/_pilH\/H\), wallMat\)|_pilH \/ H\), wallMat\)/.test(src.replace(/\s+/g, ' ')) || /, wallMat\);/.test(src),
    '...and still uses the SHARED wallMat rather than a clone');
  eq((src.match(/new THREE\.MeshPhysicalMaterial\(\{ color:0x1a242b/g) || []).length, 1,
    'wallMat is constructed exactly once, so "shared" means shared');
  // the repeat it inherits is derived from the boundary wall, which is the whole problem
  assert(/const wuAuto = _surfRepeat\(ARENA\*2\), wvAuto = _surfRepeat\(H\)/.test(src),
    'and that repeat is still derived from ARENA*2 and H (build 1378)');
}

// -------------------------------------------------- the factor is a RATIO OF SPANS ----
// It never mentions SURF_TILE_M, which is what makes it survive a retune of the tile size, and it moves
// with ARENA so a creator resizing the arena keeps both surfaces at one physical scale.
{
  const call = src.match(/_uvRescale\(new THREE\.CylinderGeometry\([^)]*\),\s*([^;]+?)\), wallMat\)/);
  assert(call, 'the rescale factors are readable');
  const f = call[1];
  assert(/\(2 \* Math\.PI \* _pilR\) \/ \(ARENA \* 2\)/.test(f), 'U is the cylinder\'s CIRCUMFERENCE over the wall\'s width');
  assert(/_pilH \/ H/.test(f), 'V is the cylinder\'s height over the wall\'s height');
  assert(!/SURF_TILE_M/.test(f), 'and it never names the tile size — a ratio of spans cancels it out entirely');

  // executed: with the shipped numbers, both surfaces end at the same metres-per-tile
  const SURF_TILE_M = parseFloat(src.match(/const SURF_TILE_M = ([\d.]+)/)[1]);
  const ARENA = 70, H = 8, R = 1.2, PH = 16;
  const rep = (span) => Math.max(1, Math.round(span / SURF_TILE_M));
  const wu = rep(ARENA * 2), wv = rep(H);
  const su = (2 * Math.PI * R) / (ARENA * 2), sv = PH / H;
  // effective tiles on the pillar = the material's repeat times the UV scale
  const pillarU = wu * su, pillarV = wv * sv;
  near((2 * Math.PI * R) / pillarU, SURF_TILE_M, SURF_TILE_M * 0.35,
    'the pillar tiles at about ' + SURF_TILE_M + ' m around, like the wall does');
  near(PH / pillarV, SURF_TILE_M, SURF_TILE_M * 0.35, '...and about ' + SURF_TILE_M + ' m up');

  // and the defect it replaces, stated as a number so the regression cannot come back quietly
  const wasU = (2 * Math.PI * R) / wu, wasV = PH / wv;
  assert(wasU < 0.4, 'before this, one tile spanned ' + wasU.toFixed(2) + ' m around the pillar');
  assert(wasV > 6, '...and ' + wasV.toFixed(1) + ' m up it — a ' + (wasV / wasU).toFixed(0) + ':1 stretch');
  const nowStretch = Math.max(pillarU / pillarV, pillarV / pillarU) /
                     Math.max((2 * Math.PI * R) / PH, PH / (2 * Math.PI * R));
  assert(nowStretch < 1.6, 'and now the two axes are within 1.6x of the geometry\'s own aspect');
}

// -------------------------------------------------------- the rescale, executed ----
{
  const fn = new Function(src.match(/function _uvRescale\(geo, su, sv\)\{[\s\S]*?\n\}/)[0] + '\nreturn _uvRescale;')();
  const g = new T.CylinderGeometry(1.2, 1.2, 16, 12);
  const v0 = g.attributes.uv.version;
  const before = Array.from(g.attributes.uv.array);
  fn(g, 0.05, 2);
  const after = g.attributes.uv.array;
  let uOk = true, vOk = true;
  for(let i = 0; i < before.length; i += 2){
    if(Math.abs(after[i] - before[i] * 0.05) > 1e-6) uOk = false;
    if(Math.abs(after[i + 1] - before[i + 1] * 2) > 1e-6) vOk = false;
  }
  assert(uOk && vOk, 'every uv is scaled per axis');
  // `needsUpdate` is a SET-ONLY accessor in three — it bumps `version` and reads back false, so the
  // observable effect is the version, not the flag.
  assert(g.attributes.uv.version > v0, 'and the attribute is flagged (version ' + v0 + ' -> ' +
    g.attributes.uv.version + '), or the GPU never sees the new uvs');
  // it must refuse rather than corrupt
  const g2 = new T.CylinderGeometry(1, 1, 2, 6); const snap = Array.from(g2.attributes.uv.array);
  fn(g2, 0, 1); fn(g2, 1, -1); fn(g2, NaN, 1); fn(null, 1, 1); fn({}, 1, 1);
  eq(Array.from(g2.attributes.uv.array).join(','), snap.join(','),
    'a zero, negative, NaN or missing factor leaves the geometry untouched rather than collapsing it');
  // three still gives a cylinder UVs at all — if an upgrade drops them this becomes a silent no-op
  assert(new T.CylinderGeometry(1, 1, 2, 6).attributes.uv, 'three ' + T.REVISION + ' still gives CylinderGeometry uvs');
}

done('build 1385: the pillar tiles at its own size, off the same shared material');
