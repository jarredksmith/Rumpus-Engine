import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 585: laser sight — world-space dot + beam when the active weapon has a laser equipped.

// --- run the REAL pure visibility predicate ---
const vis = new Function('return ('+extractFunction('_laserVisible')+')')();
const base={ hasLaser:true, gameOn:true, reloading:false, melee:false, shopOpen:false, paused:false, dead:false, adsBlend:0 };
const T = o => vis(Object.assign({}, base, o));
assert(T({}), 'laser shows: equipped, in active play, hip-fire');
assert(!T({hasLaser:false}), 'hidden without a laser attachment');
assert(!T({gameOn:false}), 'hidden out of play');
assert(!T({reloading:true}), 'hidden while reloading');
assert(!T({melee:true}), 'hidden on a melee weapon');
assert(!T({shopOpen:true}) && !T({paused:true}) && !T({dead:true}), 'hidden in menus / dead');
assert(T({adsBlend:0.3}), 'still shows partway into ADS');
assert(!T({adsBlend:0.8}), 'fades out once you are sighted in (using the optic, not the laser)');

// --- wiring ---
const ul = extractFunction('updateLaser');
assert(/_laserRay\.set\(_lz_o, _lz_d\)/.test(ul) && /intersectObjects\(colliders, true\)/.test(ul), 'raycasts the aim into world colliders');
assert(/_laserDot\.position\.copy\(hit\)/.test(ul) && /p\.setXYZ\(1, hit\.x,hit\.y,hit\.z\)/.test(ul), 'dot sits at the hit; beam ends there');
assert(/if\(!vis\)\{ if\(_laserDot\)\{ _laserDot\.visible=false; _laserBeam\.visible=false; \} return; \}/.test(ul), 'hides cleanly when inactive');
assert(/Math\.max\(0\.006, Math\.min\(0\.04, dist\*0\.006\)\)/.test(ul), 'dot scales with distance for ~constant apparent size');
const el = extractFunction('ensureLaser');
assert(/scene\.add\(_laserDot\)/.test(el) && /scene\.add\(_laserBeam\)/.test(el), 'dot + beam live in the world scene (correct depth on surfaces)');
assert(/if\(typeof updateLaser==='function'\) updateLaser\(\)/.test(src), 'loop updates the laser every frame');
assert(/WEAPONS\[k\]\.hasLaser=r\.laser/.test(src), 'laser flag comes from the equipped attachment (build 583)');

done('laser sight: gun-agnostic world dot + beam, gated to active hip-fire with a laser equipped (build 585)');
