import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 357 + 575: oversized model textures are downscaled at load to cap VRAM/RAM. Originally mobile-only;
// build 575 makes the cap configurable and active on desktop too (Sketchfab 4K maps are the main RAM hog).

// --- executable: build the real cap-resolver + shrinker together, with DOM/stubs ---
const mkShrink = (coarse, cap) => new Function('_shrunkTex','document','HTMLImageElement','ImageBitmap',
  'var IS_COARSE='+(coarse?'true':'false')+'; var _modelTexCap='+cap+';\n'
  + extractFunction('_modelTexCapEff') + '\n'
  + extractFunction('_shrinkTexturesForMobile') + '\n'
  + 'return { eff:_modelTexCapEff, shrink:_shrinkTexturesForMobile };');
class FakeBitmap { constructor(w,h){ this.width=w; this.height=h; this.closed=0; } close(){ this.closed++; } }
const mkDoc = () => ({ created:[], createElement(){ const cv={ width:0, height:0, getContext:()=>({ drawImage(){} }) }; this.created.push(cv); return cv; } });
const run = (coarse, cap, img) => {
  const doc = mkDoc(); const tex = { image:img, needsUpdate:false };
  const root = { traverse(cb){ cb({ material:{ map:tex } }); } };
  const api = mkShrink(coarse, cap)(new WeakSet(), doc, function(){}, FakeBitmap);
  api.shrink(root); return { tex, doc, eff:api.eff() };
};

// desktop, default 1024 cap: a 4K map is downscaled (the build-575 change)
{ const { tex, doc, eff } = run(false, 1024, new FakeBitmap(4096, 2048));
  eq(eff, 1024, 'desktop effective cap = chosen 1024');
  assert(doc.created.length===1 && doc.created[0].width===1024 && doc.created[0].height===512, '4K texture lands at 1024 max, aspect kept');
  assert(tex.needsUpdate===true && tex.image===doc.created[0], 'texture swapped to the downscaled canvas'); }

// desktop, 512 cap: more aggressive
{ const { doc } = run(false, 512, new FakeBitmap(2048, 2048));
  assert(doc.created.length===1 && doc.created[0].width===512, '512 cap downscales a 2K map to 512'); }

// desktop, Off (0): no downscale
{ const { tex, doc, eff } = run(false, 0, new FakeBitmap(4096, 4096));
  eq(eff, 0, 'desktop "Off" = no cap'); assert(doc.created.length===0 && tex.needsUpdate===false, 'Off leaves textures full-res on desktop'); }

// mobile is always capped at <=1024, even when the user picked Off or 2048
{ const { doc, eff } = run(true, 0, new FakeBitmap(4096, 4096)); eq(eff, 1024, 'mobile forces 1024 even when Off'); assert(doc.created[0].width===1024, 'mobile downscales 4K->1024'); }
{ const { eff } = run(true, 2048, new FakeBitmap(2048,2048)); eq(eff, 1024, 'mobile clamps a 2048 choice down to 1024'); }

// already-small textures untouched
{ const { tex, doc } = run(false, 1024, new FakeBitmap(1024, 1024)); assert(doc.created.length===0 && tex.needsUpdate===false, 'already-small textures untouched'); }

// --- wiring + config ---
assert(/let _modelTexCap = 1024;/.test(src) && /localStorage\.getItem\('breach_model_texcap'\)/.test(src), 'texture cap is configurable + persisted, default 1024');
assert(/function _modelTexCapEff\(\)\{[^}]*IS_COARSE[^}]*Math\.min\(cap,1024\)/.test(src), 'mobile clamps the cap to <=1024');
assert(/try\{ if\(g && g\.scene\) _shrinkTexturesForMobile\(g\.scene\); \}catch\(e\)\{\}/.test(src), 'shrink runs at GLB resolve, before callbacks');
assert(/_shrunkTex\.has\(t\)/.test(src), 'shared textures are shrunk once');
assert(/isCompressedTexture \|\| t\.isDataTexture/.test(src), 'compressed/data textures are skipped (cannot canvas-resize)');
assert(/'clearcoatMap'/.test(src) && /'sheenColorMap'/.test(src), 'extended PBR map slots covered');
const rp = extractFunction('renderGeneratePanel');
assert(/_modelTexCapControl\(host\)/.test(rp), 'panel exposes the texture cap selector (reusable control)');
const tcc = extractFunction('_modelTexCapControl');
assert(/breach_model_texcap/.test(tcc) && /Model texture cap/.test(tcc), 'the control persists the cap + is labelled');
assert(/\['4k',4096\]/.test(tcc), 'build 641: a 4k option for hero models');
assert(/_modelTexCapControl\(host\)/.test(extractFunction('_modelSourceBar')), 'the control also appears atop every model search (discoverable on import)');
// build 577: streaming-hitch reduction — pre-upload textures + debounced shader precompile, both off the render loop
const sh = extractFunction('_shrinkTexturesForMobile');
assert(/renderer\.initTexture\(t\)/.test(sh), 'textures are pre-uploaded to the GPU at load (no first-draw upload stall)');
assert(/if\(!MAXD && !canWarm\) return/.test(sh), 'still runs when the cap is off, purely to pre-warm uploads');
const wc = extractFunction('_scheduleWarmCompile');
assert(/renderer\.compile\(scene,/.test(wc) && /setTimeout\(/.test(wc) && /clearTimeout\(_warmCompileT\)/.test(wc), 'shader precompile is debounced and off the render loop');
assert(/_scheduleWarmCompile\(\)/.test(extractFunction('spawnProp')), 'a settled model spawn schedules the precompile');
done('configurable model texture downscaling on load — desktop + mobile, default 1024 (build 575)');
