import { gameSource, extractFunction, extractConst, assert, done } from './harness.mjs';
const src = gameSource();
// build 595: every floating pickup can drop the base disc and/or the bounce+rotate animation.

// defaults exist and are on
const dw = extractConst('DEFAULT_WORLD');
assert(/pickupBase:true/.test(dw) && /pickupAnim:true/.test(dw), 'DEFAULT_WORLD carries pickupBase + pickupAnim (default on)');

// base disc is stored and gated at build time
const bm = extractFunction('buildPowerupMesh');
assert(/g\.userData\.pad=pad/.test(bm), 'pickup keeps a handle to its base pad');
assert(/pad\.visible=\(typeof worldCfg==='undefined' \|\| worldCfg\.pickupBase!==false\)/.test(bm), 'base pad hidden when pickupBase is off');

// animation gate + live base enforcement
const ap = extractFunction('_animatePickup');
assert(/worldCfg\.pickupAnim===false/.test(ap) && /ic\.rotation\.y=0; ic\.position\.y=1\.25; return;/.test(ap), 'animation off -> icon holds still');
assert(/ic\.rotation\.y \+= dt\*1\.8/.test(ap), 'animation on -> spin + bob preserved');
assert(/g\.userData\.pad\.visible=\(worldCfg\.pickupBase!==false\)/.test(ap), 'base visibility enforced live each frame');

// applyWorldCfg defaults the keys + refreshes editor markers
const aw = extractFunction('applyWorldCfg');
assert(/if\(worldCfg\.pickupBase==null\) worldCfg\.pickupBase = DEFAULT_WORLD\.pickupBase/.test(aw), 'applyWorldCfg defaults pickupBase');
assert(/if\(worldCfg\.pickupAnim==null\) worldCfg\.pickupAnim = DEFAULT_WORLD\.pickupAnim/.test(aw), 'applyWorldCfg defaults pickupAnim');
assert(/m\.userData\.pad\.visible=\(worldCfg\.pickupBase!==false\)/.test(aw), 'applyWorldCfg refreshes marker pads');

// editor toggles wired into the Pickups panel
assert(/styleTog\('Base disc under pickups','pickupBase'/.test(src), 'editor: base-disc toggle present');
assert(/styleTog\('Bounce & rotate animation','pickupAnim'/.test(src), 'editor: animation toggle present');
assert(/worldCfg\[key\]=cb\.checked; if\(typeof applyWorldCfg==='function'\) applyWorldCfg\(\)/.test(src), 'toggles write worldCfg + re-apply');

done('pickup visuals: base disc + bounce/rotate are independent toggles, default on (build 595)');
