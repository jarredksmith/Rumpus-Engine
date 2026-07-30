import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 636: the first explosion froze the whole screen 3–5s. Adding the pooled blast lights LAZILY on the first
// blast changed the scene's point-light count, forcing three.js to recompile EVERY lit material synchronously.
// Fix: seat the pooled blast + muzzle lights (and warm the debris PBR shader) at LOAD, behind the loading screen,
// so the count is fixed before any material compiles and a blast never triggers a recompile.

// --- lights are now created via an eager ensure-helper, not lazily inside the blast ---
assert(/function _ensureBlastLights\(\)\{/.test(src), 'eager blast-light pool creator exists');
assert(/function _ensureMuzzleLights\(\)\{/.test(src), 'eager muzzle-light pool creator exists');
const bla = extractFunction('_blastLightAt');
assert(/_ensureBlastLights\(\);/.test(bla) && !/new THREE\.PointLight/.test(bla), 'the blast helper just ensures the pool (no lazy light creation in the hot path)');

// --- warm-up runs at LOAD and seats the lights + debris shader before compiling ---
const warm = extractFunction('warmFlipbookShaders');
assert(/_ensureBlastLights\(\)/.test(warm) && /_ensureMuzzleLights\(\)/.test(warm), 'the warm pass seats both light pools BEFORE the compile (so materials bake for the final light count)');
assert(/new THREE\.MeshStandardMaterial\(\{ color:0x888888[\s\S]*?flatShading:_flat/.test(warm), 'the warm pass also compiles the debris PBR shader (both shading variants)');
assert(/renderer\.compile\(scene/.test(warm), 'and runs a compile pass');
const pv = extractFunction('preloadVfx');
// build 1153 added a THIRD pool (the loot-box beams) to the same line. What this pin protects is the
// ORDER — every pool seated before the compile — not the exact set, so it now checks that directly.
assert(/_ensureBlastLights\(\)/.test(pv) && /_ensureMuzzleLights\(\)/.test(pv) && /_ensureChestLights\(\)/.test(pv),
  'preloadVfx seats every light pool at load (behind the loading screen)');
for(const seat of ['_ensureBlastLights', '_ensureMuzzleLights', '_ensureChestLights'])
  assert(pv.indexOf(seat) < pv.indexOf('warmFlipbookShaders'),
    seat + ' is seated BEFORE the shaders are warmed, so materials bake for the final light count');

// --- executable: ensuring is idempotent and creates a FIXED count of 4 ---
const deps = `
  let added=0;
  const scene={ add:()=>{ added++; } };
  function PL(c,i,d){ this.intensity=i; }
  const THREE={ PointLight:PL };
  const _blastLightPool=[];
`;
const api = new Function(deps + '\n' + extractFunction('_ensureBlastLights') + '\n return { ensure:_ensureBlastLights, n:()=>_blastLightPool.length, added:()=>added };')();
api.ensure();
eq(api.n(), 4, 'first ensure creates the 4-light pool');
eq(api.added(), 4, 'all added to the scene at once (count fixed before any material compiles)');
api.ensure(); api.ensure();
eq(api.n(), 4, 'ensure is idempotent — never grows the light count again');
eq(api.added(), 4, 'no further scene.add on repeat ensures');

done('first-explosion freeze: combat shaders (lights + debris) warmed at load (build 636)');
