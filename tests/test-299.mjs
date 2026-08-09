import { gameSource, extractFunction, assert, done, appliedOnceByBothLoaders } from './harness.mjs';
const src = gameSource();
// build 406: death burst FX gained selectable styles (classic/blood/plasma/gib/vapor) + size + tint, with a
// lingering ground splat for the gory ones. Serialized with the level + editable in the Impact FX panel.

// config + sanitizer
assert(/const DEATH_FX_STYLES = \['classic','blood','plasma','gib','vapor'\];/.test(src), 'five death styles defined');
const san = extractFunction('_sanitizeDeathFx');
assert(/style:\(DEATH_FX_STYLES\.indexOf\(o\.style\)>=0\?o\.style:'classic'\)/.test(san), 'sanitizer validates the style, defaults classic');
assert(/scale:_fxClamp\(o\.scale,0\.3,3,1\)/.test(san), 'scale is clamped');
// executable: unknown styles fall back to classic, valid ones pass through
const fn = new Function('DEATH_FX_STYLES','_fxClamp','DEFAULT_DEATHFX', extractFunction('_sanitizeDeathFx')+'\nreturn _sanitizeDeathFx;')(
  ['classic','blood','plasma','gib','vapor'], (v,lo,hi,d)=>{v=+v; return isFinite(v)?Math.max(lo,Math.min(hi,v)):d;}, {style:'classic',scale:1,color:0xff2d55});
assert(fn({style:'blood'}).style==='blood', 'a valid style passes through');
assert(fn({style:'nope'}).style==='classic', 'an invalid style falls back to classic');
assert(fn({scale:99}).scale===3, 'oversize scale clamps to 3');
assert(fn(undefined).style==='classic', 'missing config -> classic defaults');

// playerDeathFx honors the chosen style + builds a splat for gory styles
const pdf = extractFunction('playerDeathFx');
assert(/const style = \(deathFxCfg && deathFxCfg\.style\) \|\| 'classic';/.test(pdf), 'reads the configured style');
assert(/blood:\s*\{ n:34/.test(pdf) && /gib:\s*\{ n:18/.test(pdf), 'blood + gib profiles exist');
assert(/if\(R\.splat\)\{/.test(pdf) && /sells a/.test(pdf), 'gory styles drop a lingering splat decal');
assert(/p\.rotation\.set\(Math\.random\(\)\*6/.test(pdf), 'gib debris tumbles (random rotation)');

// the ring update honors per-ring lifetime/growth/fade (not the old hardcoded 0.5 / *7)
const src2 = src.slice(src.indexOf('death rings (expanding + fading)'), src.indexOf('death rings (expanding + fading)')+520);
assert(/const mx=r\.max\|\|0\.5, gr=\(r\.grow!=null\?r\.grow:7\);/.test(src2), 'rings use their own life + growth');
assert(/r\.fade \? Math\.max\(0,r\.life\/mx\)\*0\.55 :/.test(src2), 'splats fade dimmer + linger');

// serialized both ways + editor present
assert(/deathFx: Object\.assign\(\{\}, deathFxCfg\)/.test(src), 'saved with the level');
appliedOnceByBothLoaders(/deathFxCfg = _sanitizeDeathFx\(level\.deathFx\)/g, 'restored on both load paths');
assert(/Death burst/.test(src) && /dtest\.onclick=\(\)=>\{/.test(src), 'editor has a Death burst section with a Test button');
done();
