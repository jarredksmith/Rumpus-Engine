import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 625: damage numbers cache their glyph texture by (text|color|size) and pool the Sprites, instead of
// building a fresh canvas + CanvasTexture (a GPU upload) and disposing it on every single hit.

// --- wiring ---
assert(/const _dmgTexCache = new Map\(\);/.test(src) && /const _dmgSpritePool = \[\];/.test(src), 'texture cache + sprite pool declared');
const sdn = extractFunction('spawnDamageNumber');
assert(/const tex = _dmgTex\(txt, color, fs\);/.test(sdn), 'spawn pulls a cached glyph texture');
assert(/let sp = _dmgSpritePool\.pop\(\);/.test(sdn), 'spawn reuses a pooled sprite when available');
assert(/if\(!hadMap\) sp\.material\.needsUpdate = true;/.test(sdn), 'recompiles a pooled material only the first time it gets a map (no per-hit recompile)');
assert(!/new THREE\.CanvasTexture/.test(sdn), 'spawn no longer builds a CanvasTexture per hit');
const uf = extractFunction('updateFloaters');
assert(/_dmgSpritePool\.push\(f\.sp\);/.test(uf), 'expired numbers return their sprite to the pool');
assert(!/f\.tex\.dispose\(\)/.test(uf) && !/f\.sp\.material\.dispose\(\)/.test(uf), 'the shared texture + pooled material are NOT disposed on expiry');

// --- executable: _dmgTex caches, reuses, bumps LRU, and evicts (with dispose) past the cap ---
const deps = `
  let _made=0;
  const document={ createElement:()=>({ width:0, height:0, getContext:()=>({ font:'', textAlign:'', textBaseline:'', lineWidth:0, strokeStyle:'', fillStyle:'', strokeText(){}, fillText(){} }) }) };
  const THREE={ LinearFilter:1, CanvasTexture:function(cv){ this.cv=cv; this.id=_made++; this.minFilter=0; this.disposed=false; this.dispose=()=>{ this.disposed=true; }; } };
  const _dmgTexCache = new Map();
` + extractFunction('_srgbTex') + `
  const _DMG_TEX_MAX = 3;
`;
const api = new Function(deps + '\n' + extractFunction('_dmgTex') + '\n return { _dmgTex, cache:_dmgTexCache };')();

const a = api._dmgTex('12', '#fff', 44);
const a2 = api._dmgTex('12', '#fff', 44);
assert(a === a2, 'same (text,color,size) -> the SAME cached texture (no re-render)');
const b = api._dmgTex('8', '#fff', 44);
assert(b !== a, 'a different value -> a different texture');
const c = api._dmgTex('5', '#fff', 44);   // cache now {12,8,5} (size 3, at cap)
// touch '12' so it's most-recently-used, then add a 4th -> the LRU ('8') should be evicted + disposed
api._dmgTex('12', '#fff', 44);
const d = api._dmgTex('99', '#fff', 44);
assert(api.cache.size === 3, 'cache stays capped at _DMG_TEX_MAX');
assert(b.disposed === true, 'the least-recently-used texture is evicted and disposed');
assert(api.cache.has('12|#fff|44') === true, 'a recently-used entry survives eviction');
assert(api._dmgTex('99', '#fff', 44) === d, 'the freshly added texture is itself cached');

done('damage numbers: cached glyph textures + pooled sprites, no per-hit GPU churn (build 625)');
