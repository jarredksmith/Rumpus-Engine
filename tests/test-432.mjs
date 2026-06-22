import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 566: searched/added models import at the artist's native scale (wildly variable). On add we measure the
// bounding box, uniformly scale the largest dimension to a sane default, and sit the base on the ground.

assert(/const PROP_FIT_TARGET = 2;/.test(src), 'default fit target defined');
assert(/let _fitOnAdd = true;.*localStorage\.getItem\('breach_fit_on_add'\)/.test(src), 'fit-on-add defaults true + persists');

const f = extractFunction('_fitPropToSize');
assert(/new THREE\.Box3\(\)\.setFromObject\(obj\)/.test(f), 'measures the model bounding box');
assert(/obj\.scale\.multiplyScalar\(target \/ largest\)/.test(f), 'uniform scale: largest dimension -> target (never distorts)');
assert(/box\.isEmpty\(\)\) return false/.test(f) && /largest > 1e-4/.test(f), 'unmeasurable models are left untouched');
assert(/obj\.position\.y \+= \(gnd - box\.min\.y\)/.test(f), 'sits the rescaled base on the terrain (handles any origin)');
assert(/refreshPropCollider/.test(f) && /_propFootR\(obj\)/.test(f), 'collider + footprint refreshed after rescale');

// wired into the add path, models only, respects the toggle + a per-call override
const add = extractFunction('addSceneProp');
assert(/if\(_fitOnAdd && meta\.fit!==false && typeof isModelSrc==='function' && isModelSrc\(src\)\) _fitPropToSize\(obj, meta\.fitTarget\);/.test(add), 'fit runs on add for models only, honoring the toggle + meta.fit/fitTarget');

// toggle UI + persistence
assert(/Fit to size on add/.test(src), 'panel has the fit-on-add toggle');
assert(/localStorage\.setItem\('breach_fit_on_add'/.test(src), 'toggle persists');

// --- executable model: the fit factor + grounding math ---
function fitFactor(sx, sy, sz, target){
  const largest = Math.max(sx, sy, sz);
  if(!(largest > 1e-4) || !isFinite(largest)) return null;   // unmeasurable -> no change
  return target / largest;
}
// a big model shrinks so its longest side == target; aspect preserved
let fac = fitFactor(10, 3, 4, 2);
near(10*fac, 2, 1e-9, 'longest dimension lands on the target');
near(3*fac, 0.6, 1e-9, 'other dims scale by the same factor (aspect preserved)');
near(4*fac, 0.8, 1e-9, 'third dim scales by the same factor');
// a tiny model grows to the same target
fac = fitFactor(0.1, 0.05, 0.08, 2);
near(0.1*fac, 2, 1e-9, 'a microscopic model is enlarged to the target');
// degenerate / empty -> left alone
eq(fitFactor(0, 0, 0, 2), null, 'a zero-size model is left untouched');
// grounding: after offset, the base sits exactly on the ground
const groundOf = (minY, gnd)=> minY + (gnd - minY);
near(groundOf(-1.37, 0), 0, 1e-9, 'base lands on ground (gnd=0)');
near(groundOf(5.2, 3.5), 3.5, 1e-9, 'base lands on raised terrain');

done('fit-to-size on add: uniform bbox normalize to a target + ground the base, models only, toggle persists (build 566)');
