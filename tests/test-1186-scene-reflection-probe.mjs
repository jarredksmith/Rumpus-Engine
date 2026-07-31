// build 1186: the scene reflection probe — metals reflect the level, not bare sky through its walls.
//
// scene.environment was the SKY alone. The probe now renders the REAL scene from the spawn's eye into a
// cube at deploy — but the scene pass has ACES baked into every material's program (switching
// renderer.toneMapping to re-render clean would RECOMPILE every shader: the 636/977/1153 freeze), and
// build 1136's law says the environment must be RAW RADIANCE. So a second cube pass applies the EXACT
// ACES inverse. This test re-derives those inverse matrices from the forward pair in _ACES_GLSL itself
// (1151's pattern: derive from the thing described, so they cannot drift), and round-trips the full fit.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the inverse is THE inverse, derived
const num = '(-?[\\d.]+)';
const mat3 = (text, name) => {
  const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+=\\s+mat3\\(vec3\\(' + num + ',' + num + ',' + num + '\\), vec3\\(' + num + ',' + num + ',' + num + '\\), vec3\\(' + num + ',' + num + ',' + num + '\\)\\)');
  const m = text.match(re); assert(m, name + ' parses from the source');
  // GLSL mat3 takes COLUMNS; return row-major for the maths
  const c = m.slice(1, 10).map(Number);
  return [[c[0], c[3], c[6]], [c[1], c[4], c[7]], [c[2], c[5], c[8]]];
};
const inv3 = (m) => { const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
          [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
          [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]]; };
const mul = (m, v) => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);

const fwdIn = mat3(src, 'const mat3 _ACESin');
const fwdOut = mat3(src, 'const mat3 _ACESout');
const probeGlsl = src.match(/build 1186: the SCENE reflection probe[\s\S]{0,6000}?fromCubemap/)[0];
const invOut = mat3(probeGlsl, 'const mat3 outInv');
const invIn = mat3(probeGlsl, 'const mat3 inInv');
{
  const dIn = inv3(fwdIn), dOut = inv3(fwdOut);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    near(invIn[r][c], dIn[r][c], 1e-5, 'inInv[' + r + '][' + c + '] is the numeric inverse of _ACESin — derived, not transcribed');
    near(invOut[r][c], dOut[r][c], 1e-5, 'outInv[' + r + '][' + c + '] is the numeric inverse of _ACESout');
  }
}
{ // the full round trip, replicating both shaders in JS
  const fit = (x) => x.map((c) => (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081));
  const unfit = (y) => y.map((yy) => { const A = 1 - 0.983729 * yy, B = 0.0245786 - 0.4329510 * yy, C = -(0.000090537 + 0.238081 * yy);
    return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A); });
  const expo = 1.25 / 0.6;
  for (const v of [[0.1, 0.2, 0.3], [0.8, 0.5, 0.2], [0.02, 0.02, 0.02], [0.45, 0.45, 0.45]]) {
    const aces = mul(fwdOut, fit(mul(fwdIn, v.map((c) => c * expo))));            // what the scene pass wrote
    const back = mul(invIn, unfit(mul(invOut, aces))).map((c) => c / expo);       // what the probe recovers
    for (let i = 0; i < 3; i++) near(back[i], v[i], 1e-3, 'radiance ' + v[i] + ' survives ACES and its inverse');
  }
  { // the pole guard: the fit's ceiling is ~1.0167, and the clamp keeps the quadratic solvable
    const y = 0.999; const A = 1 - 0.983729 * y;
    assert(A > 0.015, 'at the 0.999 clamp the quadratic\'s leading term is safely non-zero');
    assert(/c = clamp\(c, 0\.0, 0\.999\);/.test(probeGlsl), '...and the shader clamps before inverting — ACES-clipped highlights saturate rather than exploding');
  }
}

// ---------------------------------------------------------------- the scheduler, executed
{
  const mk = (o) => { const calls = [];
    const tick = new Function('IS_COARSE', 'worldCfg', '_skyHdriUrl', 'performance', 'buildSceneProbe',
      'let _spQueue=' + JSON.stringify(o.queue || []) + ', _spRT=' + (o.rt ? '{}' : 'null') +
      ', _skyKey=' + JSON.stringify(o.skyKey || 'a') + ', _spSkyKey=' + JSON.stringify(o.spKey || 'a') + ', _spAt=' + (o.at != null ? o.at : 0) + ';\n' +
      extractFunction('_spTick') + '\nreturn () => { _spTick(); return _spQueue.length; };'
    )(o.coarse || false, o.cfg || { skyMode: 'sky' }, o.hdri || null, { now: () => o.now }, () => calls.push(1));
    return { tick, calls };
  };
  { const t = mk({ queue: [100, 900], now: 150 });
    eq(t.tick(), 1, 'the first deploy shot fires and leaves the second queued');
    eq(t.calls.length, 1, '...one build');
    t.tick(); eq(t.calls.length, 1, 'the second shot waits its turn (now < its time)'); }
  { const t = mk({ queue: [100], now: 150, coarse: true }); t.tick();
    eq(t.calls.length, 0, 'phones never build — the sky-only probe stays'); }
  { const t = mk({ queue: [100], now: 150, hdri: 'x.hdr' }); t.tick();
    eq(t.calls.length, 0, 'an authored HDRI outranks the probe — the tick stands down entirely'); }
  { const t = mk({ rt: true, skyKey: 'b', spKey: 'a', at: 0, now: 5000 }); t.tick();
    eq(t.calls.length, 1, 'a moved sky (day cycle) rebuilds the probe'); }
  { const t = mk({ rt: true, skyKey: 'b', spKey: 'a', at: 4000, now: 5000 }); t.tick();
    eq(t.calls.length, 0, '...at most every 3 seconds — six scene renders is not a per-tick cost'); }
}

// ---------------------------------------------------------------- the wiring
{
  assert(src.indexOf('let _spCube=null') > -1 && src.indexOf('let _spCube=null') < src.indexOf('function applySky()'),
    'the probe state is declared ABOVE applySky, which reads _spRT per frame — typeof does not guard a TDZ (1127)');
  assert(/const env = _spRT \? _spRT\.texture : _skyEnv\(\);/.test(src),
    'applySky prefers the scene probe and falls back to the sky-only probe (and skips the sky rebuild while the scene probe lives)');
  eq((probeGlsl.match(/new THREE\.CubeCamera\(/g) || []).length, 2,
    'BOTH passes use CubeCamera — hand-built face bases are how probes ship subtly rotated');
  assert(/uInvExpo\.value = Math\.max\(0\.05, renderer\.toneMappingExposure \/ 0\.6\);/.test(src),
    'the inverse divides out the LIVE exposure (base × auto) the scene pass multiplied in');
  assert(/_spSkyScale = Math\.max\(0\.05, Math\.min\(2, \(typeof worldCfg!=='undefined' && worldCfg\.sky!=null\) \? \+worldCfg\.sky : 0\.55\)\);/.test(src) &&
    /try\{ _spCam\.update\(renderer, scene\); \} finally \{ _spSkyScale = 1; \}/.test(src),
    'worldCfg.sky scales the SKY ALONE, applied at the dome during the cube pass and restored in a finally — scaling the whole cube dimmed geometry reflections 3x and crushed the env-lit viewmodel to black (measured)');
  assert(/uScale\.value = 1;/.test(src), '...so the inverse pass no longer scales anything');
  assert(/toneMappingExposure \* \(\(typeof _spSkyScale!=='undefined'\) \? _spSkyScale : 1\)/.test(src),
    'the dome multiplies the probe-scoped sky scale into its exposure');
  assert(/_skyMesh\.position\.copy\(cam\.getWorldPosition\(_skyCamPos\)\)/.test(src),
    'the dome follows the rendering camera\'s WORLD position — a CubeCamera\'s face cameras are children with local position (0,0,0), and .position sent the dome to the origin: the probe rendered a BLACK sky (read back at 11/255) and blackened the env-lit weapon');
  assert(/worldCfg\.skyMode==='sky' && !\(\(typeof _skyHdriUrl!=='undefined'\) && _skyHdriUrl\) && scene\.environment/.test(src),
    'the builder\'s immediate apply also respects the HDRI outranking');
  assert(/_spQueue = \[n\+1200, n\+9000\];/.test(src),
    'two shots per deploy: one after the level settles, one after slow assets land');
  assert(/if\(_spRT && _spRT\.dispose\) _spRT\.dispose\(\);/.test(src), 'the previous PMREM target is disposed, not leaked');
  assert(/if\(typeof requestSceneProbe==='function'\) requestSceneProbe\(\);/.test(src), 'startGame requests the shots');
  assert(/if\(typeof _spTick==='function'\) _spTick\(\);/.test(src), 'the frame loop drives the scheduler');
}

done('build 1186: the scene reflection probe — the real level rendered from the spawn\'s eye, put through the exact ACES inverse (matrices derived in-test from the forward pair; full-fit round trip to 1e-3) so the environment holds raw radiance, PMREM\'d, scaled by worldCfg.sky so the ambient does not move, two deploy shots + throttled day-cycle refresh, phones and HDRI levels untouched');
