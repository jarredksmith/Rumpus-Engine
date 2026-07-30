// build 1185: two-cascade sun shadows — the shadow cliff moves 4x out, contacts stay sharp.
//
// The rendering critic's #1 CRITICAL: one shadow volume was a trade with no right answer — tight gives
// sharp contacts and a hard line where shadows END ("the world floats" past shadowDist); wide gives no
// cliff and mud everywhere. Now the near volume stays exactly build 1120's camera-following fit and a
// second sun (moonFar, seated at BOOT — the light count must never change during play) covers 4x that
// extent. A chunk patch makes each fragment take the sun from exactly ONE cascade: the near one wherever
// its map's projected coord actually covers, the far one everywhere else.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import * as THREE from 'three';
const src = gameSource();

// ---------------------------------------------------------------- the anchors and machinery, real build
{
  assert(THREE.ShaderChunk.lights_fragment_begin.includes('getDirectionalLightInfo( directionalLight, geometry, directLight );'),
    'the patch anchor is verbatim in three\'s directional loop — a rename makes the replace a silent no-op');
  assert(THREE.ShaderChunk.lights_fragment_begin.includes('UNROLLED_LOOP_INDEX'),
    'the unroll token exists — the gate\'s per-index constants depend on three\'s loop unroller');
  assert(typeof THREE.ShaderChunk.lights_pars_begin === 'string', 'the uniform rides lights_pars_begin');
  // the walk end-to-end: add to the merged entries, clone, and the value must ride BY REFERENCE
  const P = { x: 0, y: 1, z: 0 };
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u.directionalLights) u._csmT = { value: P }; }
  assert(THREE.ShaderLib.standard.uniforms._csmT, 'lit entries carry the uniform after the walk (UniformsLib.lights merged at module load — 1181\'s lesson, same shape)');
  const clone = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
  assert(clone._csmT.value === P, '...and a material\'s per-material clone still references the ONE shared object');
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u._csmT) delete u._csmT; }
}

// ---------------------------------------------------------------- the fit, executed with real three
const NB = +src.match(/const SUN_NB_TEXELS = ([\d.]+);/)[1];
const build = (coarse, shadowDist) => {
  const moon = new THREE.DirectionalLight(0x9fd8ff, 0.9); moon.position.set(40, 80, 20);
  moon.shadow.mapSize.set(2048, 2048); moon.shadow.camera.near = 1; moon.shadow.camera.far = 260;
  const _sunTarget = new THREE.Object3D(); moon.target = _sunTarget;
  const moonFar = coarse ? null : new THREE.DirectionalLight(0x9fd8ff, 0.9);
  const _sunTargetFar = new THREE.Object3D();
  if (moonFar) { moonFar.shadow.mapSize.set(2048, 2048); moonFar.target = _sunTargetFar; }
  const worldCfg = { shadowDist: shadowDist || 60 };
  const fit = new Function('THREE', 'moon', 'moonFar', '_sunTarget', '_sunTargetFar', 'worldCfg',
    'const SUN_NB_TEXELS = ' + NB + ';\n' +
    src.match(/const _sunNormalBias = \(extent, px\) => [^\n]+;/)[0] + '\n' +
    'const _fitF = new THREE.Vector3(), _fitAx = new THREE.Vector3(), _fitAy = new THREE.Vector3(), _fitL = new THREE.Vector3(), _fitL2 = new THREE.Vector3();\n' +
    'let _fitFx = 1e9, _fitFz = 1e9;\n' +
    extractFunction('_fitSunShadow') + '\nreturn _fitSunShadow;'
  )(THREE, moon, moonFar, _sunTarget, _sunTargetFar, worldCfg);
  return { fit, moon, moonFar, _sunTarget, _sunTargetFar };
};
{
  const t = build(false, 60);
  const cam = new THREE.PerspectiveCamera(); cam.position.set(100, 2.9, 50); cam.updateMatrixWorld();
  assert(t.fit(cam) === true, 'the first fit reports movement so the caller dirties the maps');
  eq(t.moon.shadow.camera.right, 60, 'the near volume is build 1120\'s fit, unchanged');
  eq(t.moonFar.shadow.camera.right, 240, 'the far volume covers 4x the near extent');
  eq(t.moonFar.shadow.camera.near, 1, 'far cascade depth range: near 1...');
  eq(t.moonFar.shadow.camera.far, (90 + 240) + 240, '...to D+F — the light stands D=90+F back so the whole ±F volume fits inside (a light left on the 90 orbit would spill ~110 units behind itself)');
  { const d1 = t.moon.position.clone().sub(t._sunTarget.position).normalize();
    const d2 = t.moonFar.position.clone().sub(t._sunTargetFar.position).normalize();
    assert(d1.dot(d2) > 0.9999, 'both cascades shine the SAME direction — they are one sun, split by coverage, not two lights'); }
  near(t.moonFar.shadow.normalBias, Math.min(2.2, (2 * 240 / 2048) * NB), 1e-9,
    'the far bias is the texel rule (1125) at the far map\'s own scale — the near 0.6 cap is a near-volume quantity and must not clamp it');
  { // the mirror runs BEFORE the early return — colour/intensity stay live even when nothing moved
    t.moon.intensity = 0.42; t.moon.color.setHex(0xff0000);
    assert(t.fit(cam) === false, 'an unmoved camera fits nothing...');
    near(t.moonFar.intensity, 0.42, 1e-12, '...but the far cascade still mirrors intensity (the day cycle writes it per frame)');
    eq(t.moonFar.color.getHex(), t.moon.color.getHex(), '...and colour'); }
  { // far target moves ONLY in whole far-texel steps on its own light-space grid — never a fraction
    const ftex = (2 * 240) / 2048;
    const L = t.moon.position.clone().normalize();   // the fit's own grid axes (1120's _fitL), not the light direction
    const ax = new THREE.Vector3(-L.z, 0, L.x).normalize(), ay = new THREE.Vector3(-ax.z, 0, ax.x);
    const p0 = t._sunTargetFar.position.clone();
    cam.position.x += 1.0; cam.updateMatrixWorld(); t.fit(cam);
    const dv = t._sunTargetFar.position.clone().sub(p0);
    for (const axis of [ax, ay]) {
      const step = dv.dot(axis) / ftex;
      assert(Math.abs(step - Math.round(step)) < 1e-6,
        'the far volume moves in whole far-texel steps along the light\'s axes (moved ' + step.toFixed(4) + ' texels) — sub-texel slide is what makes distant shadow edges crawl');
    } }
}
{ // phones: one cascade, one shadow pass, no throw
  const t = build(true, 60);
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 2, 0); cam.updateMatrixWorld();
  assert(t.fit(cam) === true && t.moon.shadow.camera.right === 60, 'the coarse path still fits the near volume with moonFar null');
}

// ---------------------------------------------------------------- the cascade pick, replayed
{
  const pick = (idx, nearOK) => ((idx === 0) !== nearOK) ? 0 : 1;   // 0 = light zeroed
  eq(pick(0, true), 1, 'inside near coverage: the near sun lights');
  eq(pick(1, true), 0, '...and the far sun is zeroed — one sun per fragment, never two');
  eq(pick(0, false), 0, 'outside near coverage: the near sun is zeroed');
  eq(pick(1, false), 1, '...and the far sun takes over');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/const moonFar = IS_COARSE \? null : new THREE\.DirectionalLight\(0x9fd8ff, 0\.9\);/.test(src),
    'moonFar is seated at BOOT, desktop only — decided once before the first compile, so the light count never changes during play');
  assert(/const _csmP = \{ x:0, y: moonFar\?1:0, z:0 \};/.test(src), 'the runtime switch is 1 exactly when the far cascade exists');
  assert(/'#if NUM_DIR_LIGHT_SHADOWS >= 2',/.test(src),
    'the gate compiles ONLY where two shadow-casting directionals exist — the thumbnail/inspector two-light rigs are untouched by structure');
  assert(/'bool _csN = _cs0\.x > 0\.02 && _cs0\.x < 0\.98 && _cs0\.y > 0\.02 && _cs0\.y < 0\.98;',/.test(src),
    'the pick reads the near map\'s own projected coord — a derived split distance gets the screen corners wrong; the coord cannot');
  assert(/'#else',\n   'bool _csN = true;',/.test(src),
    'an object that cannot read the coord (receiveShadow=false — the nocollide grass) takes the NEAR sun unshadowed; without this branch it would get BOTH suns = 2x light');
  assert(/'if \( \( UNROLLED_LOOP_INDEX == 0 \) != _csN \) directLight\.color = vec3\( 0\.0 \);',/.test(src), 'exactly one cascade survives per fragment');
  assert(/THREE\.UniformsLib\.lights\.csmSunP = \{ value:_csmP \};/.test(src) &&
    /for\(const _clk in THREE\.ShaderLib\)\{ const _clu = THREE\.ShaderLib\[_clk\]\.uniforms; if\(_clu && _clu\.directionalLights\)\{ _clu\.csmSunP = \{ value:_csmP \}; \} \}/.test(src),
    'the value reaches every already-merged lit entry — the late lib add alone reaches nothing (1181, proven again above)');
}

done('build 1185: two-cascade sun shadows — near volume unchanged (1120 fit, 1125 bias), far cascade at 4x extent with its own texel grid, depth range and bias, one sun per fragment picked by the near map\'s real coverage, grass and other non-receivers structurally protected from double light, phones untouched at one cascade — the shadow cliff moves from shadowDist to 4x shadowDist');
