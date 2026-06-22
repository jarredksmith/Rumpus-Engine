import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 637: ranged-enemy gunfire is now an authorable look (Weapons > Enemy gunfire), not a hardcoded glowing
// ball. A style preset sets the base shape; size/streak/opacity/colours/trail/muzzle refine it. Serialized.

// --- config + sanitize ---
const DEF = (new Function('return ('+extractConst('DEFAULT_BOLT')+')'))();
assert(DEF.style==='tracer', 'default style is the realistic thin tracer (not the old plasma ball)');
const STYLES = (new Function('return ('+extractConst('_BOLT_STYLES')+')'))();
for(const k of ['tracer','plasma','laser','slug']) assert(STYLES[k] && STYLES[k].glowL>0 && STYLES[k].glowW>0, `${k} style preset present`);
assert(STYLES.tracer.glowW < STYLES.plasma.glowW && STYLES.tracer.glowL > STYLES.plasma.glowL, 'tracer is THINNER and LONGER than the old plasma ball');
const san = new Function('_fxClamp','DEFAULT_BOLT','_BOLT_STYLES', extractFunction('_sanitizeBolt') + '; return _sanitizeBolt;')(
  (v,lo,hi,dflt)=>{ v=+v; return isNaN(v)?dflt:Math.max(lo,Math.min(hi,v)); }, DEF, STYLES);
const d = san(undefined);
eq(d.style,'tracer','blank -> default style'); eq(d.trail,true,'trail on by default');
eq(san({style:'bogus'}).style,'tracer','unknown style falls back to tracer');
eq(san({style:'laser'}).style,'laser','a valid style is kept');
eq(san({size:99}).size,4,'size clamped'); eq(san({opacity:-1}).opacity,0.1,'opacity clamped'); eq(san({trail:false}).trail,false,'trail can be off');
eq(san({coreColor:0x123456}).coreColor,0x123456,'colors round-trip');

// --- wiring: the bolt mesh + trail + impact + muzzle all read boltCfg ---
const mb = extractFunction('makeEnemyBolt');
assert(/_BOLT_STYLES\[boltCfg\.style\]/.test(mb), 'bolt shape comes from the chosen style');
assert(/_boltCoreMat\.color\.setHex\(boltCfg\.coreColor\)/.test(mb) && /_boltGlowMat\.color\.setHex\(boltCfg\.glowColor\)/.test(mb), 'core + streak colours from config');
assert(/glow\.position\.y = -sl\*0\.5;/.test(mb), 'the streak trails BEHIND the bright tip');
assert(/if\(!boltCfg\.trail\) return;/.test(extractFunction('emitBoltTrail')), 'the trail can be turned off');
assert(/boltImpact\(p, boltCfg\.impactColor\)/.test(extractFunction('updateEnemyShots')), 'impacts use the configured colour');
assert(/playFlipbook\('muzzle', from, 0\.7\*boltCfg\.muzzle\)/.test(extractFunction('fireEnemyShot')), 'muzzle flash scales with the config');

// --- editor + persistence wiring ---
assert(/function renderBoltFxPanel\(\)/.test(src), 'editor panel exists');
assert(/sec\('Enemy gunfire', 'boltfx'/.test(src), 'section registered in the Weapons tab');
assert(/'object','transform','impactfx','tracerfx','boltfx','crosshair'/.test(src), 'shown in the Weapons (kit) mode');
assert(/bolt: Object\.assign\(\{\}, boltCfg\)/.test(src), 'serialized with the level');
assert((src.match(/boltCfg = _sanitizeBolt\(level\.bolt\)/g)||[]).length===2, 'restored in both load paths');

done('enemy gunfire: realistic tracer look + full editor control (build 637)');
