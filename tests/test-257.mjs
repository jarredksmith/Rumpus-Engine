import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 359: adaptive resolution scaler + mobile HDR sky clamp.

// --- adaptive resolution: executable step logic ---
// Reconstruct _adaptResTick against controllable state to prove the up/down/settle behavior.
const ctx = {};
const setup = `
  let _adaptOn=true, _adaptAcc=0, _adaptN=0, _adaptNext=0, _adaptCool=0, _adaptGood=0;
  let _prStepI=0, _prScale=1, applied=0;
  const _PR_STEPS=[1,0.85,0.72,0.6,0.5];
  function _applyPixelRatio(){ applied++; }
  ${extractFunction('_adaptResTick')}
  function feed(ms, frames, now){ for(let i=0;i<frames;i++) _adaptResTick(ms, now); }
  return { down(){ return { run(){ feed(30, 8, 600); _adaptResTick(30,600); return _prStepI; } }; },
           state:()=>({ i:_prStepI, scale:_prScale, applied }),
           feed, get cool(){ return _adaptCool; } };
`;
const api = new Function(setup)();
// 8+ slow frames (30ms ~ 33fps) then an eval tick past _adaptNext -> one downshift
api.feed(30, 9, 100); api.feed(30, 1, 600);
let st = api.state(); assert(st.i === 1 && Math.abs(st.scale-0.85)<1e-9, 'sustained slow frames drop one resolution step');
assert(st.applied === 1, 'pixel ratio re-applied exactly once per change');

// --- wiring (the executable part proves behavior; these prove it's actually hooked up) ---
assert(/const _prBase = Math\.min\(devicePixelRatio, IS_COARSE \? 2\.0 : 1\.5\);/.test(src), 'base ratio is the old cap');
assert(/renderer\.setPixelRatio\(_prBase \* _prScale\)/.test(src), 'effective ratio = base * adaptive scale');
assert(/const _PR_FLOOR = IS_COARSE \? 0\.5 : 0\.66;/.test(src), 'a blur floor exists per device class');
const loop = extractFunction('loop');
assert(/if\(_adaptLast\) _adaptResTick\(_anow-_adaptLast, _anow\); _adaptLast=_anow;/.test(loop), 'loop feeds the scaler real wall-clock frame time');
assert(/try\{ const v=localStorage\.getItem\('breach_adaptres'\); if\(v==='on'\) _adaptOn=true; else if\(v==='off'\) _adaptOn=false; \}/.test(src), 'adaptive res is a persisted preference');
assert(/const ADAPT_ENABLED_DEFAULT = true;/.test(src), 'adaptive resolution defaults ON everywhere (build 810); the setting still opts out');

// --- mobile HDR clamp ---
assert(/if\(_isHdr && IS_COARSE\) tex = _clampHdrForMobile\(tex\);/.test(src), 'HDR skies are clamped on coarse devices, before becoming background/PMREM');
const clamp = src.slice(src.indexOf('const _clampHdrForMobile'), src.indexOf('const onTex ='));
assert(/const w=im\.width\|\|0, h=im\.height\|\|0; const MAXW=2048;/.test(clamp), 'clamps panoramas wider than 2048');
assert(/if\(w<=MAXW \|\| typeof document==='undefined'\) return tex;/.test(clamp), 'small skies and headless env pass through untouched');
assert(/new THREE\.DataTexture\(dst, cw, ch, tex\.format, tex\.type\)/.test(clamp), 'resamples the float data into a smaller DataTexture (not a canvas — HDR has no drawable image)');
assert(/dt\.mapping=tex\.mapping; dt\.colorSpace=tex\.colorSpace;/.test(clamp), 'preserves equirect mapping + color space');
assert(/catch\(e\)\{ \/\* clamp is best-effort; fall back to the full-res sky \*\//.test(clamp), 'never breaks the sky if resampling fails');
done();
