// (build 1353) TEXTURE MEMORY, AND THE LAST OF BUILD 1168's TRANSIENTS.
//
// 1. Build 1257 made the LIGHT cost visible because a creator "most needs and could least discover" it.
//    The texture half was never done, and the gap is specific: the asset panel reports DOWNLOAD bytes
//    (build 990) and `renderer.info.memory.textures` is a COUNT. Neither is what runs a phone out of
//    memory — a 4096x4096 albedo costs ~85 MB on the GPU however small the JPEG was.
//
// 2. Build 1168 hoisted this file's per-frame transients and named what it did not finish. All FOUR
//    `_aoHideNoDepth` call sites still allocated a fresh array every frame, with AO and motion blur both
//    live.
//
// Measured live (tools/probe/tex-census.mjs):
//   1024 no mips 4.00 MB · 1024 + mips 5.33 · 4096 + mips 85.33 · no image 0 · null 0
//   a texture on 8 materials counts ONCE (count 14 -> 15)
//   a texture reached only through a material, in neither cache: +21 MB, expected 21
//   four distinct buffers, cleared on entry
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---- GPU bytes, executed ----
{
  const f = new Function('return ' + extractFunction('_texBytesOf', src).replace(/^function _texBytesOf/, 'function') + ';')();
  const tex = (w, h, mips, compressed) => {
    const t = { image: { width: w, height: h }, generateMipmaps: mips };
    if (compressed) { t.image.isCompressedTexture = true; t.mipmaps = compressed; }
    return t;
  };
  near(f(tex(1024, 1024, false)) / 1048576, 4, 1e-6, '1024² with no mipmaps is 4 MB — w·h·4');
  near(f(tex(1024, 1024, true)) / 1048576, 5.333, 1e-3,
    '...and 5.33 with them: the 1 + 1/4 + 1/16 … series converges to 4/3, it is not a guess');
  near(f(tex(4096, 4096, true)) / 1048576, 85.333, 1e-3,
    'a 4096² albedo is ~85 MB on the GPU — the number this whole census exists to show');
  eq(f({}), 0, 'a texture with no image costs nothing');
  eq(f(null), 0, 'and null is not a crash');
  // a compressed texture reports its own transcoded length; charging it 4 bytes a pixel would libel the
  // one format that actually fixes this problem
  eq(f(tex(2048, 2048, true, [{ data: { byteLength: 1000 } }, { data: { byteLength: 500 } }])), 1500,
    'a KTX2/Basis texture is counted as its REAL transcoded bytes, not 4 per pixel');
}

// ---- the census finds what the caches cannot see ----
{
  const f = extractFunction('_texCensus', src);
  assert(/seen = new Set\(\)/.test(f) && /seen\.has\(sk\)/.test(f) && /t\.source \|\| t/.test(f),
    'a texture shared by ten materials counts once — and (build 1376) N tilings sharing one SOURCE count once, because they ARE one upload now');
  assert(/scene\.traverse/.test(f),
    'it walks the SCENE, not just the two caches: an imported GLB’s own maps are in neither cache and are ' +
    'most of a big level. Verified live — a material-only 2048² added exactly its 21 MB');
  assert(/texCache/.test(f) && /_texInst/.test(f), '...and both caches too');
  for (const slot of ['normalMap', 'roughnessMap', 'emissiveMap', 'lightMap'])
    assert(f.indexOf("'" + slot + "'") >= 0, 'the slot list covers ' + slot);
  assert(/catch\(e\)\{\}/.test(f), 'and a hostile material cannot throw out of the Level Check');
}

// ---- it reports a COST, not a mistake ----
{
  const li = extractFunction('levelIssues', src);
  assert(/_texCensus/.test(li), 'Level Check asks for it');
  assert(/t\.mb > TEX_MB_SOFT_CAP/.test(li), '...and says nothing below the cap — a panel that always ' +
    'complains is not read (build 1274)');
  assert(/This is GPU memory, not download size/.test(li),
    'the message names the distinction that makes the number surprising');
  assert(/however small the file is/.test(li), '...explicitly');
  assert(/Model texture cap/.test(li), 'and points at the control that fixes it, rather than just scolding');
  const cap = Number(extractConst('TEX_MB_SOFT_CAP'));
  assert(cap >= 64 && cap <= 512, 'the cap is in the range where a phone is actually at risk');
}

// ---- build 1168's last transients ----
{
  const decl = extractConst('_aoHidW');
  assert(decl !== null, 'the world AO buffer is hoisted');
  for (const n of ['_aoHidW', '_aoHidV', '_velHidW', '_velHidV'])
    assert(new RegExp('const ' + n + ' = \\[\\]|' + n + ' = \\[\\]').test(src), n + ' exists');
  const f = extractFunction('_aoHideNoDepth', src);
  assert(/out\.length = 0;/.test(f),
    'and the function clears the buffer, because the callers reuse it now — without this every frame ' +
    'would re-show a growing list of objects that are already visible');
  // no call site may allocate any more
  assert(!/_aoHideNoDepth\(\w+, \[\]\)/.test(src), 'no call site passes a literal array');
  for (const [site, buf] of [['scn, _aoHid', '_aoHidW'], ['vmScene, _vmHid', '_aoHidV'],
                             ['scn, _vHid', '_velHidW'], ['vmScene, _vmH', '_velHidV']])
    assert(src.indexOf('=' + buf) > 0, site + ' uses ' + buf);
  // FOUR buffers, not one shared scratch — build 1168's own warning
  assert(/a shared scratch would be clobbered/.test(src),
    'and the reason four exist rather than one is recorded: the fills are sequential TODAY, which is ' +
    'exactly the assumption build 1168 warned would break');
}

done('build 1353: texture memory is visible, and the AO sweep stopped allocating');
