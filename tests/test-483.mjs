import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 630: fire particle point-size attenuation is tied to the camera FOV. Cinematics ANIMATE the FOV, and a
// tight (telephoto) cine lens ballooned the scale so every fire sprite hit the 128px clamp and rendered as a big
// white disc ("grouping of white particles, not on fire" in cutscenes). The scale is now capped.

const af = extractFunction('_animateFire');
assert(/const baseScale = \(cam && cam\.isPerspectiveCamera\) \? \(H\*0\.5\)\/Math\.tan\(\(cam\.fov\*0\.5\)\*Math\.PI\/180\) : H\*0\.5;/.test(af), 'point-size scale still derives from the active camera fov/viewport');
assert(/_fireUniforms\.uScale\.value = Math\.min\(baseScale, H\*1\.6\);/.test(af), 'the scale is capped so a tight cinematic lens cannot balloon fire sprites into clamped white discs');

// executable: the cap only bites at narrow (telephoto) fovs; normal + ADS play is untouched
const H = 800, cap = H*1.6;
const scaleAt = (fov)=> (H*0.5)/Math.tan((fov*0.5)*Math.PI/180);
const capped = (fov)=> Math.min(scaleAt(fov), cap);
assert(capped(75) === scaleAt(75), 'wide fov (75°) — unchanged');
assert(capped(60) === scaleAt(60), 'default fov (60°) — unchanged');
assert(capped(50) === scaleAt(50), 'ADS-ish fov (50°) — unchanged');
assert(scaleAt(20) > cap && capped(20) === cap, 'tight cinematic lens (20°) — reined in to the cap (no white-disc blowout)');
assert(capped(60) < cap, 'the cap sits above all normal-play fovs, so it never affects ordinary fire');

done('cinematic fire: cap the fov-driven point size so a tight cine lens stops blowing flames into white discs (build 630)');
