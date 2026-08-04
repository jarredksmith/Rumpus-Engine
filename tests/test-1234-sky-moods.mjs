// build 1234: the sky becomes authorable — reported from play: "How can you change the sky color? No
// matter what it's always bright." Two findings behind it, both verified: the procedural dome has been
// fully parameterised since 1119 (zenith/horizon/ground, haze, sun disc, its own exposure) but NO
// editor UI ever wrote those fields — only the arena generator's themes did; and a dark dome alone
// cannot darken the SCENE, because the sun keeps lighting it and auto-exposure (1180) lifts a dark
// frame back up. So the Sky fold gains the seven controls AND mood presets that set the COHERENT
// PACKAGE — dome + sun strength/colour/height + fog colour + auto-exposure — with every field still
// individually editable, and a preset clears any HDRI URL (an HDRI silently covers the dome — the
// 1223 class of confusion).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the model actually darkens — executed
// skyRadiance is the real dome (test-1119 pins it against the GLSL). Drive it with the Night preset's
// colours and prove the frame the user called "always bright" goes genuinely dark.
{
  const code =
    'const THREE = { Color: function(h){ this.r=((h>>16)&255)/255; this.g=((h>>8)&255)/255; this.b=(h&255)/255; } };\n' +   // close enough for a relative luminance compare
    'let _skyDayDim = 1;\n' +
    extractFunction('_skyP') + '\n' + extractFunction('skyRadiance') + '\n' +
    'const SKY_DEF = { zenith:[0,0,0], horizon:[0,0,0], ground:[0,0,0], turb:0.35, sunSize:1.6, sunGlow:1.0, exp:1.0 };\n' +
    'const lum = (c) => 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];\n' +
    'const S = [0.6, 0.6, 0.52];\n' +                                     // sun direction, away from the sampled rays
    'const sample = (cfg) => { const worldCfg = cfg; const P = (function(w){ const hex=(h,d)=>{ if(h==null) return d.slice(); const c=new THREE.Color(h>>>0); return [c.r,c.g,c.b]; }; return { zenith:hex(w.skyZenith,SKY_DEF.zenith), horizon:hex(w.skyHorizon,SKY_DEF.horizon), ground:hex(w.skyGround,SKY_DEF.ground), turb:w.skyTurb, sunSize:w.skySunSize, sunGlow:w.skySunGlow, exp:w.skyExp }; })(cfg);\n' +
    '  return lum(skyRadiance(-0.3, 0.8, -0.5, P, S)); };\n' +            // looking up-ish, away from the sun
    'return { day: sample(DAY), night: sample(NIGHT), blood: (function(){ const P = { zenith:[0.11,0.03,0.03], horizon:[0.54,0.12,0.08], ground:[0.08,0.04,0.03], turb:0.6, sunSize:2.6, sunGlow:1.7, exp:0.8 }; const c = skyRadiance(0.7, 0.15, 0.6, P, [0.7,0.2,0.66]); return { r:c[0], b:c[2] }; })() };';
  const day = { skyZenith: 0x6f9ad4, skyHorizon: 0xc2cfdc, skyGround: 0x6b6660, skyTurb: 0.35, skySunSize: 1.6, skySunGlow: 1.0, skyExp: 1.0 };
  const night = { skyZenith: 0x060a18, skyHorizon: 0x12203a, skyGround: 0x0a0d12, skyTurb: 0.25, skySunSize: 0.9, skySunGlow: 0.35, skyExp: 0.55 };
  const r = new Function('DAY', 'NIGHT', code)(day, night);
  assert(r.day > 0.3, 'the stock day zenith is bright (' + r.day.toFixed(3) + ') — the "always" the user saw');
  assert(r.night < 0.035, 'the Night preset\'s zenith is DARK (' + r.night.toFixed(4) + ') — over 10x down; the dome was never the limit, the missing UI was');
  assert(r.blood.r > r.blood.b * 3, 'a Blood-moon horizon is red-dominant — arbitrary hue was always in the model');
}

// ---------------------------------------------------------------- the coherent package — executed
{
  const fn = extractFunction('applySkyMood');
  const run = (k, cfg) => new Function('k', 'worldCfg',
    'let applied = 0; const applyWorldCfg = () => applied++;\n' +
    (src.match(/const SKY_MOODS = \{[\s\S]*?\n\};/)[0]) + '\n' + fn +
    '\nconst ok = applySkyMood(k);\nreturn { ok, cfg: worldCfg, applied };')(k, cfg);
  { const r = run('night', { sky_hdri: 'https://x/old.hdr', sun: 1.5, autoExp: 0.7, arena: 70 });
    eq(r.ok, true, 'night applies');
    assert(r.cfg.sun < 0.4, 'the package DIMS THE SUN — a dark dome under a 1.5 sun is a black ceiling over a sunny afternoon');
    near(r.cfg.autoExp, 0.15, 1e-9, '...and holds auto-exposure low, or the eye lifts the dark right back out');
    eq(r.cfg.sky_hdri, '', '...and clears the HDRI — which would otherwise silently cover the new sky');
    eq(r.cfg.arena, 70, '...without touching unrelated fields');
    eq(r.applied, 1, '...and applies through applyWorldCfg (the applySky owner chain)'); }
  { const r = run('nope', { sun: 1.5 });
    eq(r.ok, false, 'an unknown mood does nothing'); eq(r.cfg.sun, 1.5, '...and touches nothing'); }
}
{ // Day restores exactly stock — a creator can always find their way back
  const moods = new Function('return ' + src.match(/const SKY_MOODS = \{[\s\S]*?\n\};/)[0].replace('const SKY_MOODS =', '').replace(/;\s*$/, ''))();
  const dw = src.match(/const DEFAULT_WORLD = \{[^\n]*\};/)[0];
  for(const k of ['skyZenith', 'skyHorizon', 'skyGround', 'skyTurb', 'skySunSize', 'skySunGlow', 'skyExp', 'sun', 'sunElev', 'autoExp']){
    const m = dw.match(new RegExp(k + ':([0-9a-fx.]+)'));
    assert(m, 'DEFAULT_WORLD carries ' + k);
    near(moods.day[k], +m[1], 1e-9, 'Day.' + k + ' === DEFAULT_WORLD.' + k + ' — the Day preset IS stock, restated');
  }
  assert(Object.keys(moods).join(',') === 'day,sunset,night,overcast,blood', 'five moods');
}

// ---------------------------------------------------------------- the UI exists at last
{
  assert(/colorRow\(b,'Sky top','skyZenith'\); colorRow\(b,'Horizon','skyHorizon'\); colorRow\(b,'Ground band','skyGround'\);/.test(src),
    'the three dome colours are editable');
  assert(/slider\(b,'Sky brightness','skyExp',0\.05,2,0\.05\);/.test(src), 'sky brightness — the direct answer to "always bright"');
  assert(/slider\(b,'Haze','skyTurb',0,1,0\.05\);/.test(src) && /slider\(b,'Sun size','skySunSize',0\.3,4,0\.1\); slider\(b,'Sun glow','skySunGlow',0,3,0\.05\);/.test(src),
    'haze + sun-disc controls');
  assert(/\['night','\\ud83c\\udf19 Night'\]/.test(src) || /\['night','🌙 Night'\]/.test(src), 'the preset row offers Night');
  assert(/bn\.onclick=\(\)=>\{ pushUndoSnapshot\(\); applySkyMood\(k\); renderEditorFields\(\); \};/.test(src),
    'one undo snapshot per preset click');
  assert(/Overrides the sky look above while set\./.test(src), 'the HDRI hint says it covers the dome');
  // the fields have serialized since 1119 — the whole-object world write carries them; pin the source of that truth
  // build 1360 darkened skyGround with the ground plane it meets at the horizon (build 1156 tied them).
  // This pin's subject is that the sky fields LIVE in DEFAULT_WORLD, not their values.
  assert(/skyZenith:0x6f9ad4, skyHorizon:0xc2cfdc, skyGround:0x[0-9a-f]{6}, skyTurb:0.35/.test(src), 'the fields live in DEFAULT_WORLD (whole-object serialization carries them)');
}

done('build 1234: the sky becomes authorable — the real dome model executed proving Night goes 10x darker than the stock Day and a Blood-moon horizon reads red (the model was never the limit; the missing UI was), applySkyMood executed proving the coherent package (sun dimmed, auto-exposure held low, HDRI cleared, unrelated fields untouched, one applyWorldCfg), Day restated as exactly DEFAULT_WORLD so stock is always one click back, and the seven controls plus five presets finally exist in the Sky fold');
