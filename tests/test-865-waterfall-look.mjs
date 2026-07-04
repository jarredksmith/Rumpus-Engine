// (build 865) WATERFALLS LOOK LIKE WATERFALLS — de-cheesing pass on the 858 visuals:
//  - the sheet is now TWO layers (a back sheet running 0.82x speed at 0.55x opacity gives depth) with
//    three sine octaves of per-column streaks, see-through gaps between streams, a slow column wobble,
//    bright churn at the lip — still pure sin(), no textures, no noise lookups;
//  - the foam pool is a churn pattern (radial pulse x angular boil), not concentric rings;
//  - NEW 'Pool width' control (0.2-2.5 x the sheet width, default 1.15): the old pool was hardcoded to
//    0.84x the width — the "stuck at half the waterfall" complaint — and it's elliptical now (wider
//    along the sheet than out from it).
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// layered sheet
const bwg = src.match(/function buildWaterfallGroup\(f\)\{[\s\S]{0,2600}?\n\}/)[0];
assert(/mkSheet\(1, 1, 0\)/.test(bwg) && /mkSheet\(0\.82, 0\.55, -0\.35\)/.test(bwg), 'two sheets: back layer slower, dimmer, set back');
assert(/sheetMat2.*uniforms\.uTime\.value=_waterTime/.test(src.match(/function updateWaterfalls[\s\S]{0,900}/)[0]), 'both layers tick their time uniform');
const sheet = src.match(/const _FALL_FSH = \[[\s\S]{0,2000}?\]\.join/)[0];
assert(/0\.22\*s1 \+ 0\.16\*s2 \+ 0\.12\*s3/.test(sheet), 'three streak octaves');
assert(/float gaps = smoothstep\(0\.25, 0\.6,/.test(sheet), 'see-through gaps between streams');
assert(/float lip = smoothstep\(0\.86,0\.99,vUv\.y\)\*0\.5/.test(sheet), 'bright churn at the lip');
assert(/sin\(vUv\.y\*3\.0 \+ uTime\*0\.8\)\*0\.015/.test(sheet), 'columns wobble slowly');
assert(!/texture2D|texture\(/.test(sheet), 'still textureless (cheap)');

// foam churn + pool width
const foam = src.match(/const _FOAM_FSH = \[[\s\S]{0,900}?\]\.join/)[0];
assert(/atan\(c\.y, c\.x\)/.test(foam) && /sin\(ang\*7\.0 \+ uTime\*2\.3 \+ r\*9\.0\)/.test(foam), 'foam churns (angular boil), no more concentric rings');
assert(/pool:\(f\.pool!=null\?Math\.max\(0\.2,Math\.min\(2\.5,\+f\.pool\)\):1\.15\)/.test(src), 'pool migrates with clamp + 1.15 default (full width, not half)');
assert(/pool:\(f\.pool!=null\?\+f\.pool:1\.15\)/.test(src), '...and serializes');
assert(/mkN\('Pool width','pool',0\.2,2\.5,0\.05,/.test(src), 'the panel exposes Pool width');
assert(/foam\.scale\.set\(pool, pool\*0\.62, 1\)/.test(src), 'elliptical pool, scaled by the control');

done('build 865: two-layer streaked sheet with gaps + lip churn, boiling foam pool with an author-controlled width');
