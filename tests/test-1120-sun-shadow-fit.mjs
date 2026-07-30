// build 1120: the sun's shadow volume follows the camera.
//
// It was a fixed +/-80 orthographic box nailed to the world origin on a 2048 map — 7.8 cm a texel —
// while worldCfg.arena goes to 2000. Past 80 units from the origin a level had NO shadows at all,
// which is most of any large level, and inside that radius they were soft and coarse.
//
// Fitting to the camera makes the same map cover a shadowDist radius (default 30) at 2.9 cm a texel:
// a 2.7x sharpening AND no size limit. The catch is shimmer — a volume that slides by a fraction of
// a texel each frame makes every shadow edge crawl — so the focus is snapped to the shadow map's own
// texel grid, measured along the LIGHT's axes rather than the world's.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// build 1135: 60, not 30. Build 1120 chose 30 for texel sharpness (2.9 cm), but worldCfg.arena
// defaults to 70, i.e. a 140-unit play space — so a 30-unit volume left the entire mid-ground with no
// shadows at all and reading as cardboard. 60 covers what a player can actually see, at 5.9 cm a texel,
// still sharper than the fixed +/-80 box this replaced. _sunNormalBias tracks it automatically.
assert(/shadowDist:60,/.test(src), 'the shadow radius is authorable and defaults to 60');
assert(/arena:70,/.test(src), '...against a default arena of 70, i.e. 140 units across');
assert(/const _sunTarget = new THREE\.Object3D\(\); scene\.add\(_sunTarget\); moon\.target = _sunTarget;/.test(src),
  'the sun aims at a target that can move (a DirectionalLight volume is centred on its target)');

// ---------------------------------------------------------------- run the fit
{
  // three's pieces, reduced to what the function actually touches
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    applyQuaternion() { return this; }                 // the test camera looks down -z, unrotated
    lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
    normalize() { const l = Math.sqrt(this.lengthSq()) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  }
  const mk = (shadowDist, lightPos) => {
    const moon = { position: new V3(...lightPos), shadow: { mapSize: { x: 2048 },
      camera: { left: -80, right: 80, top: 80, bottom: -80, updateProjectionMatrix() { this._upd = (this._upd || 0) + 1; } } } };
    const _sunTarget = { position: new V3(), updateMatrixWorld() { this._w = (this._w || 0) + 1; } };
    // build 1125: the fit also sets the normal bias, so it needs that helper in scope — pulled from
    // the real source rather than restated, or the test could pass against a formula that shipped
    // differently
    const nb = src.match(/const SUN_NB_TEXELS = [^\n]*\nconst _sunNormalBias = [^\n]*\n/);
    assert(nb, 'the normal-bias helper is a named, single-source expression');
    const fn = new Function('THREE', 'moon', '_sunTarget', 'worldCfg', 'Math',
      'const _fitF=new THREE.Vector3(), _fitAx=new THREE.Vector3(), _fitAy=new THREE.Vector3(), _fitL=new THREE.Vector3(), _fitL2=new THREE.Vector3();' +
      'const moonFar=null, _sunTargetFar=null;' +   // build 1185: this harness drives the single-cascade (phone) path; test-1185 drives the far cascade
      'let _fitFx=1e9,_fitFz=1e9;' + nb[0] + extractFunction('_fitSunShadow') + '; return _fitSunShadow;'
    )({ Vector3: V3 }, moon, _sunTarget, { shadowDist }, Math);
    return { fn, moon, _sunTarget };
  };
  const cam = (x, z) => ({ isCamera: true, position: new V3(x, 2, z), quaternion: {} });

  {
    const { fn, moon, _sunTarget } = mk(30, [40, 80, 20]);
    assert(fn(cam(0, 0)) === true, 'the first fit reports a change');
    eq(moon.shadow.camera.right, 30, 'the volume is sized to shadowDist');
    eq(moon.shadow.camera.left, -30, '...on both sides');
    // THE fix: a camera 400 units out gets a volume centred near it, where the old box never reached
    fn(cam(400, 400));
    const d = Math.hypot(_sunTarget.position.x - 400, _sunTarget.position.z - 400);
    assert(d < 30, 'a camera at (400,400) gets its own shadow volume, ' + d.toFixed(1) + ' units from the eye');
    assert(Math.abs(_sunTarget.position.x) > 80, '...far outside the old fixed +/-80 box, which had no shadows there at all');
  }
  {
    // the focus leads the view rather than centring on the eye — half a volume behind you is wasted
    const { fn, _sunTarget } = mk(30, [40, 80, 20]);
    fn(cam(0, 0));
    assert(_sunTarget.position.z < -1, 'the volume is biased along the view direction (z=' + _sunTarget.position.z.toFixed(1) + ')');
  }
  {
    // shimmer: sub-texel camera drift must NOT move the volume
    const { fn, _sunTarget } = mk(30, [40, 80, 20]);
    fn(cam(0, 0));
    const x0 = _sunTarget.position.x, z0 = _sunTarget.position.z;
    const texel = 60 / 2048;
    let moves = 0;
    for (let i = 1; i <= 10; i++) if (fn(cam(texel * 0.02 * i, 0))) moves++;
    eq(moves, 0, 'ten sub-texel camera nudges move the shadow volume zero times — no crawl');
    eq(_sunTarget.position.x, x0, '...the focus is unchanged');
    eq(_sunTarget.position.z, z0, '...on both axes');
    // ...but a real move does re-fit
    assert(fn(cam(5, 0)) === true, 'a metre of movement does re-fit');
  }
  {
    // the snap is quantised: every focus lands on the same lattice
    const { fn, _sunTarget } = mk(30, [0, 80, 90]);   // light along +z, so the lattice aligns with world x/z
    const texel = 60 / 2048, seen = [];
    for (let i = 0; i < 6; i++) { fn(cam(i * 3.7, 0)); seen.push(_sunTarget.position.x); }
    for (const v of seen) assert(Math.abs(v / texel - Math.round(v / texel)) < 1e-6,
      'the focus is an exact multiple of the texel size (' + v.toFixed(4) + ')');
  }
}

// ---------------------------------------------------------------- wiring
assert(/if\(typeof _fitSunShadow==='function' && _fitSunShadow\(camera\)\)\{/.test(src),
  'the fit runs from the frame loop against the active camera');
assert(/_dirtyShadows\(1\);/.test(src.slice(src.indexOf('_fitSunShadow(camera)'))),
  '...and a volume that moved re-renders the map, or the old shadows smear across it');
{
  const orbit = extractFunction('_sunOrbit');
  assert(/_sunTarget/.test(orbit),
    'the sun orbits its FOCUS, not the world origin — the volume is centred on the target, so a light left at (0,0) aims its depth range at the wrong place');
}
assert(/moon\.shadow\.camera\.far = 260;/.test(src), 'the depth range covers the 90-unit orbit plus the volume');

done('build 1120: the shadow volume follows the eye, snapped to its own texel grid');
