// build 1095: the filmic rendering pipeline — the engine half of the AAA visual push.
//
// Four independent upgrades, each verified separately:
//  1. ACES filmic tone mapping (+ exposure), on by default, saved with the level (worldCfg),
//     toggleable in the world panel. Rolls highlights off like film instead of clipping.
//  2. A default procedural environment map (gradient sky + sun blob through PMREM) whenever no
//     HDRI sky is set — metals stop rendering black, roughness starts responding to something.
//  3. Anisotropic filtering on every texture path (loader cache + imported model traversal).
//  4. Radiance-lightmap adoption: a generated level marks its bake with material
//     extras.rumpusLightmap and the loader moves it from aoMap to lightMap (colored indirect GI).
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// ---- 1. filmic tone mapping
assert(/renderer\.toneMapping = THREE\.ACESFilmicToneMapping;/.test(src), 'ACES is the boot default');
assert(/renderer\.toneMappingExposure = 1\.25;/.test(src), 'with a compensating exposure lift');
assert(/filmic:1, exposure:1\.25/.test(src), 'both are level-saved worldCfg defaults');
assert(/const wantTM = worldCfg\.filmic \? THREE\.ACESFilmicToneMapping : THREE\.NoToneMapping;/.test(src),
  'applyWorldCfg drives the mode from the level');
assert(/if\(renderer\.toneMapping !== wantTM\)\{\n      renderer\.toneMapping = wantTM;\n      scene\.traverse/.test(src),
  'toggling recompiles materials (tone mapping is baked into programs) — and only on change');
assert(/worldCfg\.filmic=fmCb\.checked\?1:0; applyWorldCfg\(\);/.test(src), 'the world panel has the toggle');

// ---- 2. default environment
assert(/function _ensureDefaultEnv\(\)\{/.test(src), 'the procedural environment builder exists');
assert(/_envDefaultRT = pg\.fromEquirectangular\(tex\); pg\.dispose\(\); tex\.dispose\(\);/.test(src),
  'built once through PMREM, generator disposed');
assert(/if\(!_skyHdriUrl\)\{ _ensureDefaultEnv\(\); if\(_envDefaultRT && scene\.environment !== _envDefaultRT\.texture\) scene\.environment = _envDefaultRT\.texture; \}/.test(src),
  'applied whenever no HDRI sky is active');
assert(/_ensureDefaultEnv\(\); scene\.environment = _envDefaultRT \? _envDefaultRT\.texture : null;/.test(src),
  'clearing an HDRI sky falls back to the procedural env, not to nothing');

// ---- 3. anisotropy
assert(/const MAX_ANISO = Math\.min\(8, \(renderer\.capabilities && renderer\.capabilities\.getMaxAnisotropy\)/.test(src),
  'capability-capped anisotropy constant');
assert(/tex\.anisotropy = MAX_ANISO;/.test(src), 'applied in the texture loader cache');
assert(/for\(const k of \['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'\]\) if\(m\[k\]\) m\[k\]\.anisotropy = MAX_ANISO;/.test(src),
  'and to every map of every imported model');

// ---- 4. radiance lightmap adoption
assert(/if\(m\.userData && m\.userData\.rumpusLightmap && m\.aoMap && !m\.lightMap\)\{/.test(src),
  'opt-in via glTF material extras — plain models are untouched');
assert(/m\.lightMap = m\.aoMap; m\.aoMap = null;/.test(src),
  'the bake moves from aoMap (ambient-only darkening) to lightMap (adds colored GI)');
assert(/m\.lightMapIntensity = \+m\.userData\.rumpusLightmap \|\| 1;/.test(src),
  'the extras value doubles as the intensity');

// ---- shadow bias retune rides along
// build 1125: the retune's VALUE is unchanged at the volume it was tuned against (+/-80 on a 2048
// map); it is just no longer a literal, because normalBias is a texel quantity and build 1120 made
// the volume authorable. _sunNormalBias(80, 2048) === 0.6 is asserted in test-1125.
assert(/moon\.shadow\.normalBias = _sunNormalBias\(moon\.shadow\.camera\.right, moon\.shadow\.mapSize\.x\);/.test(src),
  'normalBias 1.2 -> 0.6: contact shadows reattach');

done('build 1095: ACES + IBL + anisotropy + radiance lightmaps — the filmic pipeline');
