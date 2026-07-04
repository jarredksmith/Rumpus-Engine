// (build 868) WATER RESPONDS TO LIGHT — the water/waterfall shaders had their own baked-in lighting:
// the body color ignored the Sun/Sky sliders and the day/night cycle (a midnight lake glowed like noon).
// One scene-light factor (_waterLightF — moon + hemisphere + ambient intensities, normalized so the
// default sliders give ~1) now multiplies the water body, both waterfall sheets and the foam pool, set
// per frame. Because the day/night cycle writes moon/skyLight intensity every frame, water follows dusk
// and dawn automatically; the sun GLINT keeps its own path (uSunCol already tracks the sun's color and
// intensity) so low sun = warm dim glitter, not a white flare on black water.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// the factor, executably: defaults ≈ 1, night ≈ dark, floors and caps hold
const mk = (moonI, skyI, ambI)=>new Function('moon','skyLight','worldAmbient',
  extractFunction('_waterLightF') + 'return _waterLightF();')({intensity:moonI},{intensity:skyI},{intensity:ambI});
near(mk(0.9, 0.55, 0), 0.9*0.75 + 0.55*0.65, 1e-9, 'default sliders ≈ 1');
assert(mk(0.054, 0.1, 0) < 0.15, 'day-cycle midnight (moonlight floor) = dark water');
eq(mk(0, 0, 0), 0.04, 'floors at 0.04 — water never goes fully invisible-black');
eq(mk(4, 3, 2), 1.6, 'caps at 1.6 — maxed sliders don\'t nuke it white');

// the uniform reaches all three shaders and is applied to the BODY, not the glint
assert(/mix\(uDeep, uSky, fres\*0\.75\)\*uLight \+ uSunCol \* spec \* 0\.9/.test(src), 'water body dims; the sun glint rides uSunCol separately');
assert(/vec4\(col\*uLight, clamp\(a, 0\.0, 0\.95\)\)/.test(src), 'waterfall sheets dim');
assert(/vec4\(vec3\(uLight\), clamp\(a,0\.0,0\.9\)\)/.test(src), 'foam dims');
// per-frame updates
assert(/u\.uLight\.value=_waterLightF\(\)/.test(src), 'water surfaces update each frame');
eq((src.match(/uniforms\.uLight\.value=_lf/g)||[]).length, 3, 'both sheets + foam update each frame');
// the glint now scales with the LIVE sun intensity (day cycle) instead of the static slider
assert(/multiplyScalar\(Math\.min\(1\.5, \(typeof moon!=='undefined'\?moon\.intensity:1\)\)\)/.test(src), 'glint intensity follows the live sun (cycle-aware)');

done('build 868: water, waterfall sheets and foam all follow the scene lighting — sliders and day/night alike');
