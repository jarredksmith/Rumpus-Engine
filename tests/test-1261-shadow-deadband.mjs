import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1261: "static shadows" were redrawing on almost every MOVING frame. The focus is snapped to
// the shadow map's texel grid, so any change is at least a full texel — and the old `> texel*0.5`
// test was therefore true whenever the snap moved at all, i.e. every frame a player walks. Both
// cascades then redrew the entire caster set. A deadband of N texels fixes it, and this test
// MEASURES the refit rate rather than asserting the constant, because the rate is the claim.

// Build the real _fitSunShadow with a minimal three-like scope (test-1120's rig).
function V3(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
V3.prototype = {
  set(x, y, z){ this.x=x; this.y=y; this.z=z; return this; },
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; },
  normalize(){ const l=Math.hypot(this.x,this.y,this.z)||1; this.x/=l; this.y/=l; this.z/=l; return this; },
  lengthSq(){ return this.x*this.x+this.y*this.y+this.z*this.z; },
  applyQuaternion(){ return this; },
};
function rig(shadowDist, refitOverride) {
  const moon = { position:new V3(40,80,20), color:{ copy(){} }, intensity:1, visible:true,
    shadow:{ mapSize:{ x:2048, y:2048 }, camera:{ left:-1, right:1, top:1, bottom:-1, updateProjectionMatrix(){} }, normalBias:0, bias:0 } };
  const _sunTarget = { position:new V3(), updateMatrixWorld(){} };
  const nb = src.match(/const SUN_NB_TEXELS = [^\n]*\nconst _sunNormalBias = [^\n]*\n/);
  assert(nb, 'the normal-bias helper is still a single-source expression');
  const fn = new Function('THREE','moon','_sunTarget','worldCfg','Math','_prStepI',
    'const _fitF=new THREE.Vector3(), _fitAx=new THREE.Vector3(), _fitAy=new THREE.Vector3(), _fitL=new THREE.Vector3(), _fitL2=new THREE.Vector3();'
    + 'const moonFar=null, _sunTargetFar=null; let _fitFx=1e9,_fitFz=1e9;'
    + 'const SHADOW_REFIT_TEXELS=' + (refitOverride != null ? refitOverride : extractConst('SHADOW_REFIT_TEXELS')) + ';'
    + nb[0] + extractFunction('_fitSunShadow') + '; return _fitSunShadow;'
  )({ Vector3:V3 }, moon, _sunTarget, { shadowDist }, Math, 0);
  return fn;
}
const cam = (x, z) => ({ isCamera:true, position:new V3(x, 2, z), quaternion:{} });

// --- the measurement: refits over a straight walk ------------------------------------------------------
// A run is ~9.6 units/s; at 60fps that is 0.16 per frame. Walk 600 frames and count redraws.
function refitRate(refitTexels, perFrame = 0.16, frames = 600, shadowDist = 60) {
  const fn = rig(shadowDist, refitTexels);
  let n = 0;
  for (let i = 0; i < frames; i++) if (fn(cam(i * perFrame, 0))) n++;
  return n / frames;
}
const OLD = refitRate(0.5);          // the shipped behaviour before this build
const NEW = refitRate(null);         // the shipped constant now
{
  assert(OLD > 0.95, `the old rule redrew both cascades on ${(OLD*100).toFixed(0)}% of moving frames — the defect, reproduced`);
  assert(NEW < 0.4, `the deadband cuts that to ${(NEW*100).toFixed(0)}%`);
  assert(NEW < OLD / 3, `at least a 3x reduction in shadow redraws at a run (measured ${(OLD/NEW).toFixed(1)}x)`);
  const WALK = refitRate(null, 0.10);
  assert(WALK < OLD / 4.5, `and ${(OLD/WALK).toFixed(1)}x at a walk, which is where players spend their time`);
}
{ // it is a DISTANCE, so it is self-limiting: faster movement refits proportionally more often and
  // staleness never grows with speed — the property a frame-count throttle would NOT have.
  const slow = refitRate(null, 0.04), fast = refitRate(null, 0.64);
  assert(fast > slow * 3, `a 16x faster mover refits far more often (${(slow*100).toFixed(1)}% -> ${(fast*100).toFixed(1)}%), so a car is never staler than a walker`);
  assert(fast <= 1.0001, 'and never more than once per frame');
}
{ // bounded staleness: the covered region trails by at most the deadband, which is centimetres
  const texel = (2 * 60) / 2048;
  const slack = texel * (+extractConst('SHADOW_REFIT_TEXELS'));
  assert(slack < 0.6, `the shadow volume trails by at most ${(slack*100).toFixed(0)} cm against a 120 m volume — 0.4% of it, against a trailing edge that sits 27 m behind the eye. And it does not lag the SHADOWS at all: a shadow map is rendered from the LIGHT, so a stale fit only shifts which region is covered.`);
  // the slack is scale-invariant, because the texel tracks shadowDist
  const slack30 = ((2*30)/2048) * (+extractConst('SHADOW_REFIT_TEXELS'));
  assert(Math.abs((slack30/30) - (slack/60)) < 1e-9, 'slack stays the same FRACTION of the volume at any shadowDist');
}
{ // standing still must still cost nothing, and a resize must still force a refit
  const fn = rig(60);
  assert(fn(cam(0, 0)) === true, 'the first fit always commits');
  eq(fn(cam(0, 0)), false, 'a stationary camera never redraws');
  eq(fn(cam(0.001, 0)), false, 'nor does a sub-deadband nudge');
}

// --- wiring pins ------------------------------------------------------------------------------------
assert(/const SHADOW_REFIT_TEXELS = 8;/.test(src), 'the deadband is a named constant, set from the measured sweep');
{
  const fn = extractFunction('_fitSunShadow');
  assert(/const _rfT = texel \* SHADOW_REFIT_TEXELS \* \(\(typeof _prStepI!=='undefined' && _prStepI>0\) \? 2 : 1\);/.test(fn),
    'lower quality rungs wait twice as long — the machines that most need the draw calls back are the ones least able to see the difference');
  assert(/const moved = Math\.abs\(fx - _fitFx\) > _rfT \|\| Math\.abs\(fz - _fitFz\) > _rfT;/.test(fn), 'and the test uses it');
  assert(/Math\.round\(\(fx\*_fitAx\.x \+ fz\*_fitAx\.z\) \/ texel\) \* texel/.test(fn),
    'the texel snap is untouched — build 1120’s shimmer fix is what makes a deadband safe in the first place');
}

done(`build 1261: the shadow deadband — measured, not asserted: both cascades redrew ${(OLD*100).toFixed(0)}% of moving frames and now redraw ${(NEW*100).toFixed(0)}%, staleness stays at 0.4% of the volume, and the distance test keeps a car no staler than a walker`);
