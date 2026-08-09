import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 631: explosions used external vfx/*.png sheets; when missing they fell back to a single gradient sphere
// (cheesy + a per-blast geometry alloc). Now animated flipbook sheets are BAKED procedurally at load (one shared
// CanvasTexture per kind), so explosions/smoke/muzzle always play as real animated sprites. Hosted PNG still wins.

// --- wiring ---
assert(/function _procVfxSheet\(kind\)/.test(src), 'procedural sheet baker exists');
const lv = extractFunction('loadVfxTexture');
assert(/_seedProcVfx\(kind\)/.test(lv), 'the loader seeds a procedural sheet immediately');
assert(/if\(_old && _old\.proc && _old\.tex && _old\.tex\.dispose\) _old\.tex\.dispose\(\)/.test(lv), 'a hosted PNG override disposes the procedural sheet it replaces');
const pf = extractFunction('playFlipbook');
assert(/if\(!entry \|\| !entry\.tex\)\{ loadVfxTexture\(kind\); entry = _vfxTex\[kind\]; \}/.test(pf), 'playFlipbook seeds a sheet so it never returns the gradient-ball fallback');

// --- executable: bake a sheet for each kind with stubbed canvas + THREE ---
const deps = `
  const VFX = { explosion:{cols:5,rows:5,frames:25}, smoke:{cols:8,rows:8,frames:64}, muzzle:{cols:4,rows:4,frames:16} };
  const ctxStub = { save(){}, restore(){}, beginPath(){}, rect(){}, clip(){}, translate(){}, arc(){}, fill(){}, moveTo(){}, lineTo(){}, stroke(){},
    createRadialGradient(){ return { addColorStop(){} }; },
    set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set lineCap(v){}, set globalCompositeOperation(v){} };
  const document = { createElement:()=>({ width:0, height:0, getContext:()=>ctxStub }) };
  const THREE = { LinearFilter:1, ClampToEdgeWrapping:2, SRGBColorSpace:3,
    CanvasTexture:function(cv){ this.cv=cv; this.minFilter=0; this.magFilter=0; this.wrapS=0; this.wrapT=0; this.generateMipmaps=true; this.colorSpace=0;
      this.repeat={ set:(a,b)=>{ this._rx=a; this._ry=b; } }; this.dispose=()=>{}; } };
`;
const helpers = ['_srgbTex','_fireColAt','_drawExplosionFrame','_drawSmokeFrame','_drawMuzzleFrame','_procVfxSheet'].map(n=>extractFunction(n)).join('\n');
const api = new Function(deps + '\n' + helpers + '\n return { sheet:_procVfxSheet };')();

const ex = api.sheet('explosion');
assert(ex, 'explosion sheet builds a CanvasTexture');
eq(ex.cv.width, 5*128, 'explosion canvas is cols×128 wide');
eq(ex.cv.height, 5*128, 'explosion canvas is rows×128 tall');
eq(ex._rx, 1/5, 'tiling repeat.x = 1/cols');
eq(ex._ry, 1/5, 'tiling repeat.y = 1/rows');
// build 1441: and it comes out tagged as COLOUR. It used to carry its own tag written as a bare
// "colorSpace in tex" test, which is FALSE on r149 (a Texture there has .encoding and no .colorSpace),
// so the most-drawn sheet in the game was decoded as linear for as long as it has existed.
eq(ex.colorSpace, 3, 'the sheet is tagged sRGB — an additive flash decoded as linear is too bright');
eq(ex.generateMipmaps, false, 'mipmaps disabled (matches the PNG path)');
const sm = api.sheet('smoke');
eq(sm.cv.width, 8*128, 'smoke sheet sized from its own cols');
const mz = api.sheet('muzzle');
eq(mz.cv.width, 4*128, 'muzzle sheet sized from its own cols');

done('procedural flipbook VFX: explosions always animate as sprites, no external PNG dependency (build 631)');
