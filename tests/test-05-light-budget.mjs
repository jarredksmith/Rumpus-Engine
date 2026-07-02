// updateLightBudget: <=cap emitter lights all keep base intensity; >cap keep nearest cap at full,
// the next FADE ranks ease out (no hard pop), and the farthest are fully dark.
// build 811: the cap is a FUNCTION — desktop 16 / mobile 8, halved when the adaptive-res scaler is >=2 steps down.
import * as THREE from 'three';
import { gameSource, extractFunction, evalDecl, done, assert, eq } from './harness.mjs';
const src = gameSource();

// the adaptive cap function
assert(/function _maxActiveLights\(\)\{ const base = IS_COARSE \? 8 : 16; return \(typeof _prStepI!=='undefined' && _prStepI>=2\) \? \(base>>1\) : base; \}/.test(src), 'the light cap is device-aware (16 desktop / 8 mobile) and halves under GPU pressure');
{
  const mal = (IS_COARSE, _prStepI) => { const base = IS_COARSE ? 8 : 16; return (_prStepI>=2) ? (base>>1) : base; };
  eq(mal(false, 0), 16, 'desktop, healthy: 16');
  eq(mal(false, 2), 8,  'desktop, adaptive-res 2 steps down: 8');
  eq(mal(true, 0), 8,   'mobile: 8');
  eq(mal(true, 3), 4,   'mobile under pressure: 4');
}

const MAX = 16, FADE = 5;
const fnSrc = extractFunction('updateLightBudget');
function build(emitterLights, camera) {
  return evalDecl('const _maxActiveLights=()=>' + MAX + '; const _lp=new THREE.Vector3(); ' + fnSrc,
    'updateLightBudget', { THREE, emitterLights, camera });
}
const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 0);
function mk(n) { const arr = [];
  for (let i = 0; i < n; i++) { const L = new THREE.PointLight(0xffffff, 2); L.position.set(i*10+5, 0, 0); arr.push({ light: L, baseIntensity: 2 }); }
  return arr;
}
// <= cap: everyone at base
let e = mk(MAX); build(e, cam)();
assert(e.every(x => x.light.intensity === 2), `all ${MAX} lit when at budget`);
// > cap: nearest MAX at full, a fade band in between, farthest fully dark
e = mk(MAX + FADE + 3); build(e, cam)();
eq(e.filter(x => x.light.intensity === 2).length, MAX, 'nearest MAX at full intensity');
assert(e.filter(x => x.light.intensity > 0 && x.light.intensity < 2).length > 0, 'a fade band eases out (no hard pop)');
const dark = e.filter(x => x.light.intensity === 0).map(x => x.light.position.x);
assert(dark.length > 0 && Math.min(...dark) > (5 + (MAX - 1 + FADE - 1) * 10) - 0.5, 'fully-dark lights are the farthest');
done('light budget: smooth fade beyond an adaptive, device-aware cap (build 811)');
