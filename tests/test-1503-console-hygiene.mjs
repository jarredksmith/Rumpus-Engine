// build 1503: the console stops crying wolf.
//
// From a pasted play-session console, each class measured before touching anything
// (tools/probe/console-noise.mjs): 12x "THREE.Texture: Unable to serialize Texture" — ALL at deploy, the
// stack naming buildInstancing -> material.clone() -> Material.copy, which deep-copies userData via
// JSON.stringify, and userData carried live canvas textures (procSurf) and a compiled shader's whole
// uniforms object (_odU). Plus a 404 for a VFX fire sheet that has NEVER shipped, and 4 errors for a CSP
// directive the spec ignores in <meta>. After: 0 serialize warns at every step, control unchanged.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
import { readFileSync, existsSync } from 'node:fs';

const src = gameSource();

// ------------------------------------------------ the premise, pinned against the real three ----
{
  const lib = readFileSync(new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');
  assert(lib.includes('this.userData = JSON.parse( JSON.stringify( source.userData ) );'),
    'r149 Material.copy really does deep-copy userData through JSON — the mechanism both fixes exist for. ' +
    'If an upgrade changes this line, re-read build 1503 before trusting either.');
}

// ------------------------------------------------ the detail set is JSON-invisible, executed ----
{
  const fn = extractFunction('_procSet');
  assert(/set = \{ toJSON: function\(\)\{ return undefined; \} \};/.test(fn),
    'the set object carries toJSON -> undefined');
  // the real function, driven with stubs: the set works as a set AND vanishes from any stringify
  const mkTex = () => ({ clone(){ return { needsUpdate:false, wrapS:0, wrapT:0, repeat:{ set(){} }, anisotropy:0 }; } });
  const rig = new Function('_procSurface','PROC_SLOTS','_surfClones','THREE','MAX_ANISO',
    fn + '\nreturn _procSet(4);')(
    () => ({ normalMap: mkTex(), roughnessMap: mkTex() }),
    ['normalMap','roughnessMap'], {}, { RepeatWrapping: 1000 }, 8);
  assert(rig.normalMap && rig.roughnessMap, 'the set still carries its textures');
  eq(JSON.stringify({ userData: { procSurf: rig, other: 1 } }), '{"userData":{"other":1}}',
    'a userData carrying the set stringifies WITHOUT it — no Texture.toJSON, no mangled copy on a clone');
}

// ------------------------------------------------ the uniforms pointer is non-enumerable ----
{
  assert(src.includes("Object.defineProperty(mat.userData, '_odU', { value: shader.uniforms, enumerable: false, writable: true, configurable: true });"),
    'the compiled uniforms object (sampler textures inside) is stored non-enumerably');
  assert(!/mat\.userData\._odU = shader\.uniforms;/.test(src), 'the enumerable assignment is gone');
  // the semantics the two consumers rely on, executed: reads work, the scrub's null-assign works,
  // and JSON never sees it. (A toJSON key would be wrong here — three iterates uniforms BY KEY.)
  const ud = {};
  Object.defineProperty(ud, '_odU', { value: { uOdTex: { value: 'a-texture' } }, enumerable: false, writable: true, configurable: true });
  eq(ud._odU.uOdTex.value, 'a-texture', 'plain reads still work');
  eq(JSON.stringify(ud), '{}', 'JSON.stringify never walks into it');
  ud._odU = null;
  eq(ud._odU, null, "...and buildInstancing's scrub (`_odU = null`) still lands on a writable slot");
  // the scrub site itself is unchanged
  assert(/mat\.userData\._objDetail = null; mat\.userData\._odU = null;/.test(src),
    'the batch scrub still nulls both before re-applying detail');
}

// ------------------------------------------------ no VFX url without a shipped file ----
{
  assert(/fire:      \{ url:'',/.test(src),
    'the fire sheet is no longer fetched — vfx/ has never shipped one, so it 404ed for every player');
  const loader = extractFunction('loadVfxTexture');
  assert(/if\(!cfg\.url \|\| _vfxPng\[kind\]\) return;/.test(loader),
    'an empty url is the no-fetch branch, and the procedural sheet is already seeded above it');
  // the CLASS, closed: every non-empty VFX url must resolve to a file that actually ships
  const base = src.match(/const VFX_BASE = '([^']+)';/)[1];
  for (const m of src.matchAll(/url:VFX_BASE\+'([^']+)'/g)) {
    assert(existsSync(new URL('../' + base + m[1], import.meta.url)),
      'a VFX url the engine fetches ships in the repo: ' + base + m[1]);
  }
}

// ------------------------------------------------ the meta CSP carries only what <meta> can ----
{
  // test-1332 owns the full policy; this pins the 1503 change and its reason
  assert(!/content="[^"]*frame-ancestors/.test(readFileSync(new URL('../breach.html', import.meta.url), 'utf8').slice(0, 4000)),
    'frame-ancestors is out of the meta CSP — the spec ignores it there and the browser errored 4x per load');
}

// ------------------------------------------------ the D3D warnings are a decision, not a gap ----
{
  const i = src.indexOf('X3595');
  assert(i > 0 && /deliberately NOT chased/.test(src.slice(i - 200, i + 600)),
    'the two ANGLE/HLSL shader warnings are documented at the PCSS site as judged-benign, with the reasoning');
}

done('build 1503: material clones stop serializing live textures (12 -> 0 warns, measured at deploy), ' +
  'no VFX fetch without a shipped file, and the meta CSP claims only what a <meta> can deliver');
