// build 1424: a Draco-compressed model can be OPTIMIZED, not just read.
//
// Reported from play against a 497,912-triangle ramp (Draco-compressed to 1.72 MB — the file size is the
// trap): "Please install extension dependency, draco3d.encoder".
//
// Build 988 loaded the draco DECODER so the optimizer could READ such a model, and stopped there.
// gltf-transform keeps `KHR_draco_mesh_compression` attached to the document it read, and its write()
// then demands the ENCODER to re-compress on the way out — so the bake read the model, simplified it,
// shrank its textures, and threw at the last step. Which is the worst possible place for it to fail: the
// models that most need the optimizer are exactly the heavy ones people ship Draco-compressed.
//
// The fix DROPS the extension rather than loading a second wasm, and that is a design choice: this
// optimizer's output is MESHOPT (build 988, decoded by the game everywhere since 918). Reading Draco in
// and writing meshopt out is what the bake is for.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed against a fake document
{
  const fn = new Function(extractFunction('_dropDracoForWrite') + '; return _dropDracoForWrite;')();
  const mkDoc = (names) => {
    const alive = names.slice();
    return {
      alive,
      getRoot: () => ({ listExtensionsUsed: () => names.map(n => ({
        extensionName: n, dispose(){ const i = alive.indexOf(n); if (i >= 0) alive.splice(i, 1); } })) }),
    };
  };
  {
    const d = mkDoc(['KHR_draco_mesh_compression', 'KHR_materials_unlit', 'EXT_texture_webp']);
    eq(fn(d), 1, 'the Draco extension is disposed');
    eq(d.alive.join(), 'KHR_materials_unlit,EXT_texture_webp',
      '...and NOTHING else is — unlit and webp are the model’s own, and dropping them would change what ' +
      'it looks like rather than how it is packed');
  }
  {
    const d = mkDoc(['EXT_meshopt_compression']);
    eq(fn(d), 0, 'a meshopt-compressed input is untouched: that is the format this bake WRITES');
    eq(d.alive.join(), 'EXT_meshopt_compression');
  }
  eq(fn(mkDoc([])), 0, 'a plain model needs nothing done to it');
  // ...and it can never take the optimizer down with it
  eq(fn({ getRoot: () => ({ listExtensionsUsed: () => { throw new Error('older gltf-transform'); } }) }), 0,
    'a library without listExtensionsUsed is survived — the write may still fail, but loudly and in the ' +
    'library rather than here');
  eq(fn({ getRoot: () => ({}) }), 0, 'and so is one that answers nothing');
}

// ---------------------------------------------------------------- both repack paths go through it
{
  // There are exactly two places that read a model into a gltf-transform document and write it back:
  // the mobile bake and the part editor. Both had the same hole.
  const reads = (src.match(/await io\.readBinary\(/g) || []).length;
  eq(reads, 2, 'two repack paths exist');
  const drops = (src.match(/_dropDracoForWrite\(doc\);/g) || []).length;
  eq(drops, 2, '...and both drop the write-time Draco instruction');
  // and each drop is immediately after its own read, not somewhere hopeful further down
  for (const m of src.matchAll(/await io\.readBinary\([^\n]*\n/g)) {
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 140);
    assert(/_dropDracoForWrite\(doc\)/.test(after),
      'the drop follows the read directly, before any transform can run');
  }
}
{
  // the DECODER is what makes the read work, and it must stay
  const codecs = extractFunction('_ensureGlbCodecs');
  assert(/createDecoderModule/.test(codecs), 'the Draco decoder is still loaded — without it the read fails');
  assert(!/createEncoderModule/.test(codecs),
    '...and the ENCODER is deliberately NOT: the output is meshopt, so a second wasm would buy a ' +
    'compression the engine would rather not receive');
  assert(/meshopt\(\{ encoder:codecs\.meshoptEncoder \}\)/.test(src),
    'and the output really is meshopt-packed (build 988)');
}
{ // the budget the bake exists to enforce, which is what the reported model needed
  assert(/const MOBILE_TRI_BUDGET = 40000;/.test(src),
    'the bake simplifies to 40,000 triangles — the reported model was 497,912, so this is the ' +
    'difference between a level that runs and one that does not');
  assert(/ratio:Math\.max\(0\.01, triBudget\/before\.tris\)/.test(src),
    '...by ratio, so a 497,912-triangle model is cut ~92%');
}

done('build 1424: the optimizer can repack a Draco model — read Draco, write meshopt');
